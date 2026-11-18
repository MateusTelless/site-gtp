// Conferência automática dos documentos do desconto de militar ou dependente, feita pelo Claude (Anthropic).
// Recebe frente, verso e, para dependente, o documento do vínculo, e devolve se parecem reais e o que não bate.
// Ligada só quando ANTHROPIC_API_KEY está nos segredos do site. Sem a chave, ou se a leitura falhar, a equipe confere à mão.
import Anthropic from '@anthropic-ai/sdk';
import type { DocCheck, DocVerifier } from './enrollment';

const MODEL = 'claude-opus-5-5';
const PART: Record<string, string> = { frente: 'frente do documento militar', verso: 'verso do documento militar', vinculo: 'documento que mostra o vínculo' };
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const SYSTEM = `Você confere documentos enviados por quem pede desconto de militar ou de dependente de militar num curso preparatório no Brasil.
Responda só com o JSON pedido. Seja objetivo e escreva em português.
- parece_real: true se os arquivos parecem fotos ou cópias de documentos verdadeiros (identidade militar das Forças Armadas, Polícia Militar ou Corpo de Bombeiros; para o vínculo, certidão de nascimento, de casamento, de união estável ou RG com filiação). false se forem imagens que não são documentos, montagens evidentes, documentos de outro tipo ou ilegíveis.
- incoerencias: uma frase curta por problema concreto. Exemplos: frente e verso de documentos diferentes; nome no documento militar diferente do nome informado; documento do vínculo que não liga o aluno ao militar no parentesco informado; documento vencido; arquivo ilegível. Lista vazia se não houver.
- resumo: uma frase dizendo o que foi conferido.
Não transcreva números de documentos, CPF, endereço ou outros dados pessoais na resposta.`;

const SCHEMA = {
  type: 'object',
  properties: {
    parece_real: { type: 'boolean' },
    incoerencias: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' },
  },
  required: ['parece_real', 'incoerencias', 'resumo'],
  additionalProperties: false,
};

// Base64 sem depender de Buffer (o Worker pode não ter compatibilidade com Node).
function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function makeDocVerifier(apiKey: string | undefined): DocVerifier | undefined {
  if (!apiKey) return undefined;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });
  return async ({ tipo, aluno, militar, parentesco, arquivos }) => {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const a of arquivos) {
      content.push({ type: 'text', text: `Arquivo: ${PART[a.parte] || a.parte}` });
      if (a.content_type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64(a.bytes) } });
      else if ((IMAGE_TYPES as readonly string[]).includes(a.content_type)) content.push({ type: 'image', source: { type: 'base64', media_type: a.content_type as (typeof IMAGE_TYPES)[number], data: base64(a.bytes) } });
    }
    content.push({
      type: 'text',
      text: tipo === 'dependente_militar'
        ? `Pedido de desconto de DEPENDENTE de militar. Aluno: ${aluno}. Militar informado: ${militar}. Vínculo informado: o aluno é ${parentesco} do militar. Confira se a identidade militar é do militar informado e se o documento do vínculo liga os dois.`
        : `Pedido de desconto de MILITAR. Aluno: ${aluno}. Confira se a identidade militar é do próprio aluno.`,
    });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    // Recusa ou resposta cortada: não aprova nada, a equipe confere.
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) return null;
    const out = JSON.parse(text) as DocCheck;
    if (typeof out.parece_real !== 'boolean' || !Array.isArray(out.incoerencias)) return null;
    return { parece_real: out.parece_real, incoerencias: out.incoerencias.map(String).slice(0, 10), resumo: String(out.resumo || '').slice(0, 300) };
  };
}
