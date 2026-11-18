// Gera o SQL da tabela lexus_ex_alunos (desconto de ex-aluno) a partir da exportação de matrículas do Lexus.
// Uso:  node scripts/importar-ex-alunos-lexus.mjs "C:\...\lexus_matriculas.csv" ["C:\...\ex-alunos-lexus.sql"]
//
// - Conta como ex-aluno quem tem pelo menos uma matrícula NÃO cancelada (coluna "Data Cancelamento" vazia).
// - O SQL leva só o RA e o SHA-256 do nome normalizado (mesma regra do site, em app/enrollment.ts): nada de nome, CPF, e-mail ou telefone.
// - A planilha e o SQL ficam FORA do repositório (ele é público). O programa se recusa a gravar dentro da pasta do site.
// - Na tela aparecem só contagens, nunca nomes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [input, outArg] = process.argv.slice(2);
if (!input) { console.error('Informe o arquivo lexus_matriculas.csv.'); process.exit(1) }
const output = path.resolve(outArg || path.join(path.dirname(path.resolve(input)), 'ex-alunos-lexus.sql'));
const inside = p => { const r = path.relative(repo, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) };
if (inside(path.resolve(input)) || inside(output)) { console.error('A planilha e o SQL não podem ficar dentro da pasta do site (o repositório é público). Use, por exemplo, a pasta Downloads.'); process.exit(1) }

// Mesma normalização e o mesmo hash do site.
const src = stripTypeScriptTypes(fs.readFileSync(path.join(repo, 'app/enrollment.ts'), 'utf8').replace(/export /g, ''));
const { nameHash } = new Function(src + ';return {nameHash}')();

function parseLine(line, sep) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c } else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = '' } else cur += c } out.push(cur); return out.map(s => s.trim()) }

(async () => {
  let text = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
  if (text.includes('\uFFFD')) text = fs.readFileSync(input, 'latin1');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = parseLine(lines[0], ';'), col = n => head.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const iRa = col('RA'), iName = col('Aluno'), iCancel = col('Data Cancelamento');
  if (iRa < 0 || iName < 0 || iCancel < 0) { console.error('Arquivo sem as colunas RA, Aluno e Data Cancelamento (exportação de matrículas do Lexus).'); process.exit(1) }

  const byRa = new Map(); let bad = 0;
  for (const line of lines.slice(1)) {
    const r = parseLine(line, ';'), ra = r[iRa], name = r[iName], cancelled = !!r[iCancel];
    if (!/^\d{1,10}$/.test(ra || '') || !name) { bad++; continue }
    const cur = byRa.get(ra) || { name, active: false };
    cur.active = cur.active || !cancelled; byRa.set(ra, cur);
  }
  const rows = []; let onlyCancelled = 0, shortName = 0;
  for (const [ra, { name, active }] of byRa) {
    if (!active) { onlyCancelled++; continue }
    const h = await nameHash(name); if (!h) { shortName++; continue }
    rows.push([ra, h]);
  }
  const now = new Date().toISOString(), sql = ['-- Ex-alunos do Lexus (desconto de 5%): RA e SHA-256 do nome normalizado. Gerado em ' + now + '. Não guardar no repositório.'];
  for (let i = 0; i < rows.length; i += 400) sql.push('INSERT OR REPLACE INTO lexus_ex_alunos(ra,name_hash,imported_at) VALUES ' + rows.slice(i, i + 400).map(([ra, h]) => `('${ra}','${h}','${now}')`).join(',') + ';');
  fs.writeFileSync(output, sql.join('\n') + '\n');
  const sameName = rows.length - new Set(rows.map(r => r[1])).size;
  console.log(`Linhas lidas: ${lines.length - 1} (${bad} sem RA ou nome)`);
  console.log(`Alunos (RA): ${byRa.size} | ex-alunos com matrícula não cancelada: ${rows.length} | só canceladas: ${onlyCancelled} | nome curto demais: ${shortName}`);
  console.log(`RAs com nome repetido (mesmo nome em mais de um RA): ${sameName}`);
  console.log('SQL gravado em: ' + output);
})();
