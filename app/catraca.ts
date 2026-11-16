// API usada pela ponte da catraca (ponte-catraca/, roda no PC do curso). Contrato: ponte-catraca/CONTRATO-API.md.
// A ponte se autentica com CATRACA_TOKEN (Bearer). Não usa cookie nem Origin: é um programa, não um navegador.
// Regra de acesso: aluno ativo, com matrícula 'ativa' e sem parcela aberta vencida há mais de CATRACA_TOLERANCIA_DIAS.
import { todaySP } from './enrollment';

type Env={DB:D1Database;CATRACA_TOKEN?:string;CATRACA_TOLERANCIA_DIAS?:string};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status})}
const RESULTADOS=['liberado','negado','nao_cadastrado','giro','desistencia'];
const MAX_EVENTOS=500;
const MENSAGEM_BLOQUEIO='VER NA RECEPCAO';

const sha=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
async function autorizado(req:Request,token:string|undefined){
 if(!token||token.length<24)fail('Catraca não configurada.',503);
 const h=req.headers.get('authorization')||'';const recebido=h.startsWith('Bearer ')?h.slice(7):'';
 // Compara os hashes para não vazar o token pelo tempo de resposta.
 const [a,b]=await Promise.all([sha(recebido),sha(token)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(diff)fail('Não autorizado.',401);
}

/** Número que a catraca envia: só dígitos, sem zeros à esquerda (a Inner completa com zeros). */
export function normalizarCodigo(v:unknown){const s=String(v??'').trim();if(!/^\d{1,20}$/.test(s))return '';return s.replace(/^0+(?=\d)/,'')}
function diasAtras(dia:string,n:number){const d=new Date(dia+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)}
/** Visor da Inner: 16 caracteres, sem acento. Usa primeiro e último nome. */
function nomeVisor(nome:string){const p=nome.trim().split(/\s+/);const curto=p.length>1?p[0]+' '+p[p.length-1]:p[0]||'';return curto.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().slice(0,16)}

const CODIGO_SQL="COALESCE(NULLIF(s.access_code,''),s.legacy_code)";

export async function listaLiberados(DB:D1Database,toleranciaDias:number){
 const limite=diasAtras(todaySP(),toleranciaDias);
 const rows=(await DB.prepare(`SELECT s.id,${CODIGO_SQL} AS codigo,p.full_name,s.status,
   EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status='ativa') AS ativa,
   (SELECT COUNT(*) FROM installments i JOIN enrollments e ON e.id=i.enrollment_id
     WHERE e.student_id=s.id AND e.status<>'cancelada' AND i.status='aberta' AND i.due_on<?1) AS vencidas
  FROM students s JOIN people p ON p.id=s.person_id
  WHERE ${CODIGO_SQL} IS NOT NULL`).bind(limite).all<{id:string;codigo:string;full_name:string;status:string;ativa:number;vencidas:number}>()).results;
 const porCodigo=new Map<string,number>();
 for(const r of rows){const c=normalizarCodigo(r.codigo);if(c)porCodigo.set(c,(porCodigo.get(c)||0)+1)}
 const pessoas=[];
 for(const r of rows){
  const codigo=normalizarCodigo(r.codigo);if(!codigo)continue;
  // O visor mostra a mesma frase para qualquer bloqueio (não expõe atraso de pagamento na frente dos outros);
  // o motivo vai só para o registro e o painel.
  let motivo='';
  if((porCodigo.get(codigo)||0)>1)motivo='codigo_duplicado';
  else if(r.status!=='ativo'||!r.ativa)motivo='matricula_inativa';
  else if(r.vencidas>0)motivo='pagamento_atrasado';
  pessoas.push({codigo,nome:nomeVisor(r.full_name),liberado:!motivo,mensagem:motivo?MENSAGEM_BLOQUEIO:'',motivo});
 }
 return pessoas;
}

function evento(raw:unknown){
 if(!raw||typeof raw!=='object')return null;
 const v=raw as Record<string,unknown>;
 const id=String(v.id||''),codigo=normalizarCodigo(v.codigo),dataHora=String(v.dataHora||''),resultado=String(v.resultado||'');
 const equipamento=Number(v.equipamento??1),motivo=String(v.motivo??'').slice(0,64);
 if(!/^[\w-]{8,64}$/.test(id)||!RESULTADOS.includes(resultado)||!Number.isInteger(equipamento)||equipamento<1||equipamento>99)return null;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dataHora)||!Number.isFinite(Date.parse(dataHora))||dataHora.length>40)return null;
 // Giro sem identificação (ex.: saída livre) chega com código vazio; o resto precisa de código.
 if(!codigo&&!['giro','desistencia'].includes(resultado))return null;
 return {id,codigo,dataHora,resultado,motivo,equipamento};
}

async function lerCorpo(req:Request,max:number){const raw=await req.text();if(raw.length>max)fail('Conteúdo muito grande.',413);try{return JSON.parse(raw)}catch{fail('Dados inválidos.')}}

/** Rotas /api/catraca/*. Devolve null se o caminho não for da catraca. */
export async function catracaApi(req:Request,path:string,env:Env):Promise<Response|null>{
 if(!path.startsWith('catraca/'))return null;
 await autorizado(req,env.CATRACA_TOKEN);
 const {DB}=env,agora=new Date().toISOString();

 if(path==='catraca/liberados'&&req.method==='GET'){
  const tol=Math.max(0,Math.min(60,Number(env.CATRACA_TOLERANCIA_DIAS??5)||0));
  return json({geradoEm:agora,toleranciaDias:tol,pessoas:await listaLiberados(DB,tol)});
 }

 if(path==='catraca/eventos'&&req.method==='POST'){
  const b=await lerCorpo(req,400000);
  if(!Array.isArray(b?.eventos)||b.eventos.length>MAX_EVENTOS)fail('Envie até '+MAX_EVENTOS+' eventos em "eventos".');
  const validos=b.eventos.map(evento).filter(Boolean) as NonNullable<ReturnType<typeof evento>>[];
  if(validos.length)await DB.batch(validos.map(e=>DB.prepare(
   `INSERT OR IGNORE INTO catraca_acessos(id,codigo,student_id,data_hora,resultado,motivo,equipamento,recebido_em)
    VALUES(?1,?2,(SELECT s.id FROM students s WHERE ?2<>'' AND ltrim(${CODIGO_SQL},'0')=?2 LIMIT 1),?3,?4,?5,?6,?7)`
  ).bind(e.id,e.codigo,e.dataHora,e.resultado,e.motivo,e.equipamento,agora)));
  // Inválidos são descartados (e contados) para não travar a fila da ponte para sempre.
  return json({recebidos:validos.length,descartados:b.eventos.length-validos.length});
 }

 if(path==='catraca/status'&&req.method==='POST'){
  const b=await lerCorpo(req,4000);
  const equipamento=Number(b?.equipamento??1);if(!Number.isInteger(equipamento)||equipamento<1||equipamento>99)fail('Equipamento inválido.');
  await DB.prepare(`INSERT INTO catraca_status(equipamento,versao,conectada,ultima_lista,pendentes,visto_em) VALUES(?,?,?,?,?,?)
   ON CONFLICT(equipamento) DO UPDATE SET versao=excluded.versao,conectada=excluded.conectada,ultima_lista=excluded.ultima_lista,pendentes=excluded.pendentes,visto_em=excluded.visto_em`)
   .bind(equipamento,String(b.versao||'').slice(0,20),b.catracaConectada?1:0,b.ultimaLista?String(b.ultimaLista).slice(0,40):null,Math.max(0,Number(b.eventosPendentes)||0),agora).run();
  return json({ok:true});
 }

 fail('Caminho não encontrado.',404);
}

/** Painel: situação da(s) ponte(s) e últimas passagens. GET /api/admin/catraca */
export async function catracaPainel(DB:D1Database){
 const pontes=(await DB.prepare('SELECT * FROM catraca_status ORDER BY equipamento').all()).results;
 const acessos=(await DB.prepare(`SELECT a.data_hora,a.codigo,a.resultado,a.motivo,a.equipamento,p.full_name
  FROM catraca_acessos a LEFT JOIN students s ON s.id=a.student_id LEFT JOIN people p ON p.id=s.person_id
  ORDER BY a.data_hora DESC LIMIT 200`).all()).results;
 return {pontes,acessos,agora:new Date().toISOString()};
}
