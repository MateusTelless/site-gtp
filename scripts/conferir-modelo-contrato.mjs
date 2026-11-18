// Confere o Word do contrato antes de enviá-lo no painel: variáveis [[...]] que o site preenche e as duas assinaturas {{...}}.
// Uso: node scripts/conferir-modelo-contrato.mjs "C:\...\Contrato GETEPE 2027 - site.docx"
// Só lê o arquivo no computador. Não envia nada.
import fs from 'node:fs';
import zlib from 'node:zlib';

// Variáveis que o site preenche (mesmos nomes de app/enrollment.ts, função contractData).
const SITE_VARS = ['RA', 'NomeResponsavel', 'RGResponsavel', 'CPFResponsavel', 'EnderecoCliente', 'NomeCliente', 'Turmas', 'PeriodosTurmas',
  'ValorTotalContrato', 'FormaPagamento', 'ParcelasMatriculas', 'DatasMatriculas'];
const SIGNATURES = [['AssinaturaContratante', 'Contratante'], ['AssinaturaGETEPE', 'GETEPE']];

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Informe o caminho do Word (.docx).'); process.exit(1) }
const zip = fs.readFileSync(file);
if (zip.readUInt32LE(0) !== 0x04034b50) { console.log('O arquivo não é um Word (.docx).'); process.exit(1) }

// Lê word/document.xml pelo diretório central do zip.
const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
let p = zip.readUInt32LE(eocd + 16), xml = '';
for (let n = zip.readUInt16LE(eocd + 10); n > 0; n--) {
  const method = zip.readUInt16LE(p + 10), size = zip.readUInt32LE(p + 20), nameLen = zip.readUInt16LE(p + 28), extra = zip.readUInt16LE(p + 30), comment = zip.readUInt16LE(p + 32), local = zip.readUInt32LE(p + 42);
  const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
  if (name === 'word/document.xml') {
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28), data = zip.subarray(start, start + size);
    xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
  }
  p += 46 + nameLen + extra + comment;
}
if (!xml) { console.log('Não achei o texto do contrato dentro do Word.'); process.exit(1) }
const text = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(m => [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(t => t[1]).join('')).join('\n');

const vars = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]), tags = [...text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
const problems = [];
console.log('Variáveis no Word:');
for (const v of SITE_VARS) { const n = vars.filter(x => x === v).length; console.log(`  ${n ? '✓' : '·'} [[${v}]]${n > 1 ? ` (${n} vezes)` : ''}${n ? '' : '  (não usada)'}`) }
for (const v of new Set(vars.filter(x => !SITE_VARS.includes(x)))) problems.push(`[[${v}]] não é preenchida pelo site (confira o nome).`);
const partidas = (text.match(/\[\[|\]\]/g) || []).length / 2 !== vars.length;
if (partidas) problems.push('Há [[ ou ]] sem par: alguma variável ficou quebrada ou incompleta.');
if (/\[[A-Za-z][^\]\[]*\](?!\])/.test(text.replace(/\[\[[^\]]+\]\]/g, ''))) problems.push('Ainda há marcadores com um colchete só, como [Nome]. O site só preenche [[Nome]].');
console.log('Assinaturas:');
for (const [name, role] of SIGNATURES) {
  const t = tags.find(x => x.split(';')[0] === name);
  const ok = t && /type=signature/.test(t) && new RegExp('role=' + role + '(;|$)').test(t);
  console.log(`  ${ok ? '✓' : '✗'} {{${name};type=signature;role=${role}}}`);
  if (!ok) problems.push(`Falta a assinatura {{${name};type=signature;role=${role}}}.`);
}
console.log(problems.length ? '\nAjustar antes de enviar no painel:\n' + problems.map(x => '  ✗ ' + x).join('\n') : '\nWord pronto para enviar no painel.');
process.exit(problems.length ? 1 : 0);
