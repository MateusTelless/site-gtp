// Contrato da matrícula pelo DocuSeal (https://www.docuseal.com/docs/api). Ligado quando DOCUSEAL_API_KEY está nos segredos
// e o modelo do contrato (Word) foi enviado no painel.
// - Envio: POST /submissions/docx com o Word do contrato e as variáveis da matrícula. No Word, os marcadores [[NomeResponsavel]] etc.
//   viram texto no próprio parágrafo, com a formatação do contrato. As assinaturas são campos ({{AssinaturaContratante;...}}).
//   O papel "GETEPE" vai marcado como já assinado (completed: true), com a assinatura da instituição; o "Contratante" recebe o e-mail.
// - Conferência: GET /submissions/{id}. O aviso (webhook) do DocuSeal não tem assinatura; por isso o site confere aqui antes de marcar.
// - Os links dos PDFs valem 40 minutos. Quando o contrato é assinado, o site baixa o PDF final e guarda uma cópia no R2
//   (enrollment.ts, archiveSignedContract), para o GETEPE ter o registro mesmo sem o DocuSeal.
import type { ContractApi, ContractData } from './enrollment';

type Env = { DOCUSEAL_API_KEY?: string; DOCUSEAL_API_URL?: string; DOCUSEAL_GETEPE_ASSINATURA?: string; DOCUSEAL_GETEPE_EMAIL?: string };
type Submission = { status?: string; completed_at?: string | null; combined_document_url?: string | null; documents?: { url?: string }[] };

const DEFAULT_SIGNATURE = 'GETEPE - Curso General Telles Pires';
const MAX_PDF = 25 * 1024 * 1024;

// Base64 sem depender de Buffer (o Worker pode não ter compatibilidade com Node).
function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function makeContractApi(env: Env, loadModel: () => Promise<Uint8Array | null>): ContractApi | undefined {
  const key = env.DOCUSEAL_API_KEY;
  if (!key) return undefined;
  const base = (env.DOCUSEAL_API_URL || 'https://api.docuseal.com').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) return undefined;
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(base + path, { ...init, headers: { 'X-Auth-Token': key!, 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error('DocuSeal respondeu ' + r.status);
    return await r.json() as T;
  }
  const getSubmission = (ref: string) => call<Submission>('/submissions/' + encodeURIComponent(ref));
  async function documentUrl(ref: string) {
    const s = await getSubmission(ref);
    return s.combined_document_url || s.documents?.find(x => x.url)?.url || null;
  }
  return {
    async send(d: ContractData) {
      const doc = await loadModel();
      if (!doc) throw new Error('O modelo do contrato ainda não foi enviado no painel');
      const signature = env.DOCUSEAL_GETEPE_ASSINATURA || DEFAULT_SIGNATURE;
      const res = await call<{ id?: number } | { submission_id?: number }[]>('/submissions/docx', { method: 'POST', body: JSON.stringify({
        name: 'Contrato ' + d.codigo, send_email: true, order: 'preserved', variables: d.campos,
        documents: [{ name: 'Contrato GETEPE ' + d.codigo + '.docx', file: base64(doc) }],
        submitters: [
          // O DocuSeal exige nome, e-mail ou telefone em cada parte, mesmo na que já vai assinada.
          { role: 'GETEPE', name: DEFAULT_SIGNATURE, completed: true, send_email: false, ...(env.DOCUSEAL_GETEPE_EMAIL ? { email: env.DOCUSEAL_GETEPE_EMAIL } : {}), fields: [{ name: 'AssinaturaGETEPE', default_value: signature, readonly: true }] },
          { role: 'Contratante', name: d.contratante.nome, email: d.contratante.email, external_id: d.codigo },
        ],
      }) });
      const id = Array.isArray(res) ? res.find(s => s.submission_id)?.submission_id : res.id;
      if (!id) throw new Error('DocuSeal não devolveu o número do contrato');
      return String(id);
    },
    async signedAt(ref: string) {
      const s = await getSubmission(ref);
      return s.status === 'completed' ? (s.completed_at || new Date().toISOString()) : null;
    },
    documentUrl,
    // PDF final (com as duas assinaturas) para o arquivo do GETEPE. Só aceita https, até 25 MB e arquivo que começa com %PDF.
    async signedPdf(ref: string) {
      const url = await documentUrl(ref);
      if (!url || !/^https:\/\//i.test(url)) return null;
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!r.ok) throw new Error('DocuSeal respondeu ' + r.status + ' ao baixar o PDF');
      if (Number(r.headers.get('content-length') || 0) > MAX_PDF) throw new Error('PDF do contrato grande demais');
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > MAX_PDF || bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('O DocuSeal não devolveu um PDF');
      return bytes;
    },
  };
}

// O aviso do DocuSeal chega em /api/docuseal/webhook/<DOCUSEAL_WEBHOOK_TOKEN>. Compara os hashes para não vazar o código pelo tempo de resposta.
const sha = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export async function webhookTokenOk(received: string, token: string | undefined) {
  if (!token || token.length < 24) return false;
  const [a, b] = await Promise.all([sha(received), sha(token)]);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
