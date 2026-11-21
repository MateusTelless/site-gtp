// Matrícula pelo site e financeiro (fase 1).
// Sem imports: route.ts chama estas funções com o banco, e os testes (scripts/test-matricula.cjs) carregam o arquivo do mesmo jeito.
// Ainda não há integração com cobrança nem com assinatura: as parcelas nascem em aberto e a baixa é manual no painel.

export type Role='admin'|'secretaria'|'financeiro'|'consulta';
export type Staff={email:string;role:Role};
// Linhas do D1 e corpos JSON já validados campo a campo antes do uso.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
// Plano: valor à vista (base do Pix e do cartão), dias de vencimento do Pix, formas aceitas e a regra do cartão.
type PlanRow={id:string;class_id:string;name:string;due_days:string;methods:string;active:number;cash_cents:number;card_max:number;card_rate_bp:number;class_ends_on?:string};
type PersonIn={full_name:string;cpf:string;rg:string;birth_date:string;email:string;phone:string;cep:string;street:string;number:string;complement:string;district:string;city:string;state:string};

const ROLES:Role[]=['admin','secretaria','financeiro','consulta'];
const STATUS=['aguardando_assinatura','aguardando_pagamento','aguardando_biometria','ativa','encerrada','cancelada'];
// Matrícula efetivada = contrato assinado. Estas situações só existem depois da assinatura.
const SIGNED_STATUS=['aguardando_pagamento','aguardando_biometria','ativa','encerrada'];
// Dia no fuso de São Paulo a partir de um horário ISO (o Brasil não tem horário de verão desde 2019).
const SP_DAY=(col:string)=>`date(${col},'-3 hours')`;
const EFFECTIVE="e.contract_signed_at IS NOT NULL AND e.status<>'cancelada'";
// Pelo site, só Pix e cartão de crédito. Na baixa manual, a equipe ainda registra dinheiro e transferência.
const METHODS=['pix','cartao'];
const PAID_WITH=['pix','cartao','dinheiro','transferencia'];
const CLASS_STATUS=['aberta','fechada','encerrada'];
const UF=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
// Versão do texto aceito na matrícula. Trocar quando a política revisada pelo advogado for publicada.
const CONSENT_VERSION='matricula-v1-rascunho';

function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status})}

// Planilhas da equipe: recebem o estado atual de cada matrícula sempre que ele muda. route.ts fornece o envio; sem ele, nada é enviado.
// A aba "Matrículas do site" (painel) recebe só o código da matrícula, sem nome, CPF ou contato.
// Depois do contrato assinado vai também o bloco "alunos", para o Apps Script lançar o aluno na planilha "Alunos 202X"
// no padrão dela: nome, data da matrícula, código e turno da turma, situação, total e as parcelas por mês. Nunca CPF, e-mail, telefone ou endereço.
export type SheetSync=(row:Record<string,unknown>)=>Promise<void>;
const STATUS_LABEL:Record<string,string>={aguardando_assinatura:'Aguardando assinatura',aguardando_pagamento:'Aguardando pagamento',aguardando_biometria:'Aguardando biometria',ativa:'Ativa',encerrada:'Encerrada',cancelada:'Cancelada'};
const METHOD_LABEL:Record<string,string>={pix:'Pix',boleto:'Boleto',cartao:'Cartão'};
// Forma de pagamento como a planilha de alunos escreve.
const SHEET_METHOD:Record<string,string>={pix:'PIX',cartao:'CARTÃO',dinheiro:'DINHEIRO',transferencia:'TRANSFERÊNCIA',boleto:'BOLETO'};
// Turno da turma como letra da coluna TURMA da planilha de alunos (M, T, N ou ONLINE).
const sheetShift=(s:string)=>/online|ead|distância/i.test(s)?'ONLINE':/manh/i.test(s)?'M':/tarde/i.test(s)?'T':/noite|noturn/i.test(s)?'N':String(s||'').toUpperCase().slice(0,10);
export const enrollmentCode=(id:string)=>id.replace(/-/g,'').slice(0,8).toUpperCase();
const spDate=(iso:string)=>new Date(Date.parse(iso)-3*3600000).toISOString().slice(0,10);
async function syncEnrollment(DB:D1Database,sync:SheetSync|undefined,id:string){
 if(!sync)return;
 try{
  const e=await DB.prepare('SELECT e.id,e.status,e.created_at,e.contract_signed_at,e.payment_method,c.name AS class_name,c.seats,c.shift,c.sheet_code,p.full_name,pl.name AS plan_name,(SELECT COALESCE(SUM(i.amount_cents),0) FROM installments i WHERE i.enrollment_id=e.id AND i.status<>\'cancelada\') AS total_cents,e.card_installments,e.card_visit_on,s.ra,e.first_due_on FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE e.id=?').bind(id).first<Row>();
  if(!e)return;
  let alunos:Row|undefined;
  if(e.contract_signed_at){
   const parcels=(await DB.prepare("SELECT i.due_on,i.amount_cents,(SELECT COALESCE(SUM(y.amount_cents),0) FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado') AS paid_cents,(SELECT y.method FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado' ORDER BY y.paid_on DESC LIMIT 1) AS paid_method FROM installments i WHERE i.enrollment_id=? AND i.status<>'cancelada' ORDER BY i.due_on,i.number").bind(e.id).all<Row>()).results;
   alunos={ra:e.ra||'',nome:String(e.full_name).toUpperCase(),matriculado_em:spDate(e.created_at),escola:e.sheet_code||'',turma:sheetShift(e.shift),situacao:e.status==='cancelada'?'DESLIGADO':'ATIVO',total_cents:e.total_cents,
    parcelas:parcels.map(p=>({vence:p.due_on,valor_cents:p.amount_cents,pago_cents:p.paid_cents,forma:SHEET_METHOD[p.paid_method||e.payment_method]||''}))};
  }
  await sync({codigo:enrollmentCode(e.id),recebida_em:e.created_at,turma:e.class_name,plano:e.plan_name,forma:(METHOD_LABEL[e.payment_method]||e.payment_method)+(e.payment_method==='cartao'&&e.card_installments?(e.card_installments>1?' '+e.card_installments+'x':' à vista'):''),valor_cents:e.total_cents,vagas:e.seats,situacao:STATUS_LABEL[e.status]||e.status,contrato_assinado_em:e.contract_signed_at?spDate(e.contract_signed_at):'',atualizado_em:nowIso(),...(alunos?{alunos}:{})});
 }catch(err){console.error('Falha ao preparar envio da matrícula para a planilha',(err as Error)?.name)}
}
// Contrato pelo DocuSeal (app/docuseal.ts, quando ligado). O site manda os dados da matrícula; o DocuSeal manda o e-mail ao contratante
// (aluno maior de idade ou responsável do menor), com a parte do GETEPE já assinada. Quando o contrato é assinado, o DocuSeal avisa o site
// (docusealWebhook), que confere direto na API antes de marcar. Regra de envio (dono, 17/11/2026): automático logo após a matrícula,
// menos quando há desconto de militar ou dependente a conferir; aí a equipe aprova o desconto (o contrato sai junto) ou envia pelo botão.
export type ContractData={codigo:string;contratante:{nome:string;email:string};campos:Record<string,string>};
export type ContractApi={send:(d:ContractData)=>Promise<string>;signedAt:(ref:string)=>Promise<string|null>;documentUrl:(ref:string)=>Promise<string|null>;signedPdf?:(ref:string)=>Promise<Uint8Array|null>};
// Cópia do contrato assinado (as duas assinaturas) no arquivo privado do GETEPE: R2, numa pasta que a rota pública de mídia não serve.
// Fica guardada mesmo se a conta do DocuSeal mudar. O SHA-256 vai no registro de alterações, para provar depois que o arquivo é o mesmo.
export const signedContractKey=(id:string)=>'privado/contratos/'+id+'.pdf';
// Word do contrato (com as [[variáveis]] e as duas assinaturas), enviado pelo administrador no painel.
// Fica no R2 numa pasta que a rota pública de mídia não serve. Trocar o arquivo muda os próximos contratos, sem mexer no código.
export const CONTRACT_MODEL_KEY='privado/contrato/modelo.docx';
export async function loadContractModel(bucket:R2Bucket|undefined){if(!bucket)return null;const o=await bucket.get(CONTRACT_MODEL_KEY);return o?new Uint8Array(await new Response(o.body).arrayBuffer()):null}
const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const brl=(c:number)=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const br=(d:string|null)=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const cpfFmt=(c:string)=>c&&c.length===11?c.slice(0,3)+'.'+c.slice(3,6)+'.'+c.slice(6,9)+'-'+c.slice(9):'';
const address=(p:Row)=>[p.street&&p.street+', '+p.number+(p.complement?' - '+p.complement:''),p.district,p.city&&p.city+'/'+p.state,p.cep&&'CEP '+p.cep].filter(Boolean).join(' - ');
const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const longDate=(d:string)=>Number(d.slice(8,10))+' de '+MONTHS[Number(d.slice(5,7))-1]+' de '+d.slice(0,4);
// Campos do contrato, com os nomes dos marcadores do "Contrato GETEPE 2027" (modelo no DocuSeal). O contratante é quem paga:
// o aluno maior de idade ou o responsável do menor.
async function contractData(DB:D1Database,id:string):Promise<ContractData|null>{
 const e=await DB.prepare('SELECT e.*,c.name AS class_name,c.exam,c.starts_on,c.ends_on,pl.cash_cents,pl.card_max,pl.card_rate_bp,pl.methods,st.ra FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id JOIN students st ON st.id=e.student_id WHERE e.id=?').bind(id).first<Row>();if(!e)return null;
 const student=(await DB.prepare('SELECT p.* FROM students s JOIN people p ON p.id=s.person_id WHERE s.id=?').bind(e.student_id).first<Row>())!;
 const payer=(await DB.prepare('SELECT p.* FROM people p WHERE p.id=?').bind(e.payer_person_id).first<Row>())||student,minor=payer.id!==student.id;
 // Cadastro já existente não é alterado pelo formulário: o RG enviado na matrícula completa o que faltar.
 let sent:Row={};try{sent=JSON.parse(e.submitted||'{}')}catch{/* sem dados enviados */}
 const rgRaw=String(payer.rg||(minor?sent.responsavel?.rg:sent.aluno?.rg)||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
 // RG de SP (9 caracteres) sai como 00.000.000-0; outros formatos ficam como foram digitados.
 const rg=rgRaw.length===9?rgRaw.slice(0,2)+'.'+rgRaw.slice(2,5)+'.'+rgRaw.slice(5,8)+'-'+rgRaw.slice(8):rgRaw;
 const parcels=(await DB.prepare("SELECT number,amount_cents,due_on FROM installments WHERE enrollment_id=? AND status<>'cancelada' ORDER BY number").bind(id).all<Row>()).results,sum=total(parcels as {amount_cents:number}[]);
 const pct=e.discount_pct&&e.discount_status!=='recusado'?e.discount_pct:0,off=(c:number)=>Math.round(c*(100-pct)/100),disc=pct?' (com '+pct+'% de desconto por ser '+(DISCOUNT_LABEL[e.discount_reason]||e.discount_reason)+')':'';
 // Cláusula 3ª §3º: no cartão, o valor total do contrato é o preço à vista; a forma de pagamento mostra as parcelas e o total no cartão.
 let pay:string,list:string;
 if(e.payment_method==='cartao'){
  const n=e.card_installments||1,opt=cardOptions(e as unknown as PlanRow).find(o=>o.n===n),each=opt?off(opt.parcela_cents):Math.round(sum/n);
  pay='Cartão de crédito'+(n>1?', em '+n+'x de '+brl(each)+' (total no cartão: '+brl(sum)+')':', à vista: '+brl(sum))+', passado na unidade em '+br(e.card_visit_on)+'.';
  list='Cobrança no cartão em '+br(e.card_visit_on)+(n>1?': '+n+' parcelas de '+brl(each)+'.':': '+brl(sum)+'.');
 }else{
  pay='Pix, '+(parcels.length>1?'em '+parcels.length+' parcelas sem acréscimo, a primeira em '+br(e.first_due_on)+' e as demais no dia '+e.due_day+' de cada mês.':'em parcela única, em '+br(e.first_due_on)+'.');
  list=parcels.map(r=>(parcels.length>1?r.number+'ª parcela':'Parcela única')+': '+br(r.due_on)+' - '+brl(r.amount_cents)).join('; ')+'.';
 }
 const campos:Record<string,string>={RA:e.ra||enrollmentCode(id),NomeResponsavel:payer.full_name,RGResponsavel:rg,CPFResponsavel:cpfFmt(payer.cpf),EnderecoCliente:address(payer),NomeCliente:student.full_name,
  Turmas:e.exam+' (turma '+e.class_name+')',PeriodosTurmas:br(e.starts_on)+' a '+br(e.ends_on),ValorTotalContrato:brl(e.payment_method==='cartao'?off(e.cash_cents):sum)+disc,
  FormaPagamento:pay,ParcelasMatriculas:list,DatasMatriculas:longDate(spDate(e.created_at))};
 return {codigo:enrollmentCode(id),contratante:{nome:payer.full_name,email:payer.email},campos};
}
// RA do aluno (número do contrato e coluna B da planilha de alunos). Ex-aluno reconhecido no Lexus com um RA só usa o dele;
// aluno novo recebe o próximo número depois do último RA do Lexus (RA_ULTIMO_LEXUS, conferido na planilha ao publicar) e dos já usados.
async function assignRa(DB:D1Database,studentId:string,lexusRa:string|null,raBase:number){
 const cur=await DB.prepare('SELECT ra FROM students WHERE id=?').bind(studentId).first<Row>();if(cur?.ra)return String(cur.ra);
 const take=async(ra:string)=>{try{return !!(await DB.prepare('UPDATE students SET ra=? WHERE id=? AND ra IS NULL').bind(ra,studentId).run()).meta.changes}catch{return false}};
 if(lexusRa&&/^\d{1,10}$/.test(lexusRa)&&await take(lexusRa))return lexusRa;
 for(let i=0;i<5;i++){
  const m=await DB.prepare("SELECT MAX(n) AS n FROM (SELECT CAST(ra AS INTEGER) AS n FROM students WHERE ra GLOB '[0-9]*' UNION ALL SELECT CAST(ra AS INTEGER) FROM lexus_ex_alunos)").first<{n:number|null}>();
  const next=String(Math.max(Number(m?.n)||0,raBase||0)+1);if(await take(next))return next;
 }
 return null;
}
// Envia o contrato e guarda o número dele. Falha do DocuSeal não derruba a matrícula: fica registrada e a equipe reenvia pelo painel.
async function sendContract(DB:D1Database,req:Request,contracts:ContractApi,id:string,staff:Staff|null){
 try{
  const d=await contractData(DB,id);if(!d)return false;const ref=await contracts.send(d),now=nowIso();
  await DB.batch([DB.prepare('UPDATE enrollments SET contract_ref=?,contract_sent_at=?,updated_at=? WHERE id=?').bind(ref,now,now,id),audit(DB,req,staff,'contrato_enviado','enrollment',id,{por:'DocuSeal',contrato:ref})]);
  return true;
 }catch(err){console.error('Envio do contrato ao DocuSeal falhou',(err as Error)?.message);await audit(DB,req,staff,'contrato_envio_falhou','enrollment',id,{por:'DocuSeal'}).run().catch(()=>{});return false}
}
// Guarda o PDF assinado (uma vez por matrícula). Falha não derruba nada: fica no registro e a equipe tenta de novo pelo painel.
async function archiveSignedContract(DB:D1Database,req:Request,bucket:R2Bucket|undefined,contracts:ContractApi|undefined,staff:Staff|null,id:string,ref:string){
 if(!bucket||!contracts?.signedPdf)return false;
 const key=signedContractKey(id);if(await bucket.head(key))return true;
 try{
  const pdf=await contracts.signedPdf(ref);if(!pdf)return false;
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(pdf)))].map(b=>b.toString(16).padStart(2,'0')).join(''),at=nowIso();
  await bucket.put(key,pdf,{httpMetadata:{contentType:'application/pdf'},customMetadata:{contrato:ref,sha256:sha,guardado_em:at}});
  await audit(DB,req,staff,'contrato_guardado','enrollment',id,{contrato:ref,sha256:sha,bytes:pdf.length}).run();
  return true;
 }catch(err){console.error('Cópia do contrato assinado falhou',(err as Error)?.message);await audit(DB,req,staff,'contrato_guardar_falhou','enrollment',id,{contrato:ref}).run().catch(()=>{});return false}
}
// Aviso do DocuSeal (route.ts confere o código secreto do endereço). Só "assinado" interessa; o site confere na API antes de marcar.
export async function docusealWebhook(req:Request,DB:D1Database,contracts:ContractApi|undefined,sync?:SheetSync,bucket?:R2Bucket):Promise<Response>{
 if(!contracts)return json({error:'DocuSeal não configurado.'},503);
 let b:Row;try{b=await readBody(req,2_000_000)}catch{return json({ok:true})}
 const ev=String(b.event_type||''),d=(b.data&&typeof b.data==='object'?b.data:{}) as Row;
 if(ev!=='form.completed'&&ev!=='submission.completed')return json({ok:true});
 const ref=String(ev==='form.completed'?(d.submission as Row)?.id??'':d.id??'');if(!/^\d{1,15}$/.test(ref))return json({ok:true});
 const e=await DB.prepare('SELECT id,status,contract_signed_at FROM enrollments WHERE contract_ref=?').bind(ref).first<Row>();
 if(!e||e.status==='cancelada')return json({ok:true});
 // Aviso repetido de contrato já marcado: só completa a cópia guardada, se ainda faltar.
 if(e.contract_signed_at){await archiveSignedContract(DB,req,bucket,contracts,null,e.id,ref);return json({ok:true})}
 // Se o DocuSeal estiver fora do ar, responde erro para ele tentar de novo mais tarde.
 let at:string|null;try{at=await contracts.signedAt(ref)}catch{return json({error:'Tente de novo.'},503)}
 if(!at)return json({ok:true});
 const status=e.status==='aguardando_assinatura'?'aguardando_pagamento':e.status,now=nowIso();
 await DB.batch([DB.prepare('UPDATE enrollments SET contract_signed_at=?,status=?,updated_at=? WHERE id=? AND contract_signed_at IS NULL').bind(new Date(Date.parse(at)||Date.now()).toISOString(),status,now,e.id),
  audit(DB,req,null,'contrato_assinado','enrollment',e.id,{por:'DocuSeal',contrato:ref,antes:e.status,depois:status})]);
 await syncEnrollment(DB,sync,e.id);
 await archiveSignedContract(DB,req,bucket,contracts,null,e.id,ref);
 return json({ok:true});
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readBody(req:Request,max:number):Promise<Row>{const raw=await req.text();if(raw.length>max)fail('Conteúdo muito grande.',413);let data:unknown;try{data=JSON.parse(raw)}catch{fail('Dados inválidos.')}if(!data||typeof data!=='object'||Array.isArray(data))fail('Dados inválidos.');return data as Row}
const ip=(req:Request)=>req.headers.get('cf-connecting-ip')||'';
const uuid=()=>crypto.randomUUID();
const nowIso=()=>new Date().toISOString();
const pad=(n:number)=>String(n).padStart(2,'0');

export const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const isDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const isMonth=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function addDays(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function age(birth:string,today:string){const [by,bm,bd]=birth.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);return ty-by-(tm<bm||(tm===bm&&td<bd)?1:0)}
export function validCpf(raw:string){const c=raw.replace(/\D/g,'');if(c.length!==11||/^(\d)\1{10}$/.test(c))return '';for(const n of [9,10]){let s=0;for(let i=0;i<n;i++)s+=Number(c[i])*(n+1-i);if((s*10)%11%10!==Number(c[n]))return ''}return c}
export const maskCpf=(c:string)=>c&&c.length===11?'***.'+c.slice(3,6)+'.'+c.slice(6,9)+'-**':'';
function text(v:unknown,min:number,max:number){const s=typeof v==='string'?v.trim().replace(/\s+/g,' '):'';return s.length>=min&&s.length<=max&&!/[<>]/.test(s)?s:null}
const cents=(v:unknown,max=100000000)=>Number.isInteger(v)&&(v as number)>=0&&(v as number)<=max?v as number:null;
const intList=(raw:string)=>{try{const v=JSON.parse(raw);return Array.isArray(v)?v:[]}catch{return []}};

// Pix: o valor à vista dividido em parcelas iguais, sem juros e sem taxa de matrícula. A pessoa escolhe de 1x até o número de meses
// entre o mês da primeira parcela e o mês em que o curso termina (ex.: começa em novembro, curso termina em julho = até 9x).
// A primeira parcela vence na data escolhida, em até 3 dias; as outras, no dia escolhido de cada mês seguinte. Centavos que sobram vão na primeira.
const PIX_FIRST_DAYS=3,CARD_VISIT_DAYS=30;
export function pixMax(first:string,endsOn:string){const [fy,fm]=first.split('-').map(Number),[ey,em]=endsOn.split('-').map(Number);return Math.max(1,(ey*12+em)-(fy*12+fm)+1)}
export function pixSchedule(cash:number,n:number,dueDay:number,first:string){
 const base=Math.floor(cash/n),rows:{number:number;kind:string;amount_cents:number;due_on:string}[]=[];let [y,m]=first.split('-').map(Number);
 for(let i=1;i<=n;i++){let due=first;if(i>1){m++;if(m>12){m=1;y++}due=`${y}-${pad(m)}-${pad(dueDay)}`}rows.push({number:i,kind:'mensalidade',amount_cents:base+(i===1?cash-base*n:0),due_on:due})}
 return rows;
}
const pixOptions=(plan:PlanRow,first:string)=>plan.cash_cents>0&&intList(plan.methods).includes('pix')&&plan.class_ends_on?Array.from({length:pixMax(first,plan.class_ends_on)},(_,i)=>({n:i+1,parcela_cents:Math.round(plan.cash_cents/(i+1))})):[];
// Cartão: à vista sem juros ou até 12x, como na tabela de parcelamento do GETEPE: juros compostos a cada parcela a mais.
// Total em N vezes = valor à vista × (1 + taxa)^(N−1). Ex.: R$ 4.800 a 1,5%: 2x = R$ 4.872; 12x = R$ 5.654,15 (12 de R$ 471,18).
// A taxa fica em centésimos de ponto percentual (150 = 1,5%) para não guardar número quebrado.
export function cardOptions(plan:PlanRow){
 if(!(plan.cash_cents>0)||!intList(plan.methods).includes('cartao'))return [];
 const rate=Number.isInteger(plan.card_rate_bp)&&plan.card_rate_bp>=0&&plan.card_rate_bp<=1000?plan.card_rate_bp/10000:0;
 const out=[{n:1,total_cents:plan.cash_cents,parcela_cents:plan.cash_cents}];
 // A parcela sai do valor exato, sem arredondar o total antes (como a planilha: 4x de R$ 1.254,81, não 1.254,82).
 for(let n=2;n<=Math.min(12,plan.card_max||12);n++){const exact=plan.cash_cents*Math.pow(1+rate,n-1);out.push({n,total_cents:Math.round(exact),parcela_cents:Math.round(exact/n)})}
 return out;
}
const weekday=(d:string)=>new Date(d+'T12:00:00Z').getUTCDay();
// Desconto de 5% no valor total: ex-aluno (o banco reconhece pelo CPF e pela data de nascimento) ou militar e dependente de militar
// (com documento anexado, conferido pela equipe). Os descontos não se somam.
export const DISCOUNT_PCT=5;
const DISCOUNT_LABEL:Record<string,string>={ex_aluno:'ex-aluno do GETEPE',militar:'militar',dependente_militar:'dependente de militar'};
const PROOF_KINDS=['militar','dependente_militar'];
// Comprovação: frente e verso do documento militar; para dependente, também o documento do vínculo, o parentesco e o nome do militar.
const DOC_PARTS=['frente','verso','vinculo'],KINSHIP=['Filho(a)','Cônjuge','Companheiro(a)','Enteado(a)','Outro'];
// Conferência automática dos documentos (app/doc-check.ts, quando ligada). Sem incoerência e com aparência de documento real, o desconto é aprovado;
// senão, fica "a conferir" com as incoerências apontadas no painel.
export type DocCheck={parece_real:boolean;incoerencias:string[];resumo:string};
export type DocVerifier=(input:{tipo:string;aluno:string;militar:string|null;parentesco:string|null;arquivos:{parte:string;content_type:string;bytes:Uint8Array}[]})=>Promise<DocCheck|null>;
async function runDocCheck(DB:D1Database,req:Request,bucket:R2Bucket,verify:DocVerifier,id:string){
 try{
  const e=await DB.prepare('SELECT e.discount_reason,e.discount_status,e.discount_info,p.full_name FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE e.id=?').bind(id).first<Row>();
  if(!e||e.discount_status!=='pendente')return;
  const info=e.discount_info?JSON.parse(e.discount_info):{};
  const docs=(await DB.prepare('SELECT part,r2_key,content_type FROM enrollment_documents WHERE enrollment_id=? ORDER BY uploaded_at').bind(id).all<Row>()).results;
  const arquivos=[];for(const d of docs){const o=await bucket.get(d.r2_key);if(o)arquivos.push({parte:d.part,content_type:d.content_type,bytes:new Uint8Array(await new Response(o.body).arrayBuffer())})}
  const result=await Promise.race([verify({tipo:e.discount_reason,aluno:e.full_name,militar:info.nome_militar||null,parentesco:info.parentesco||null,arquivos}),new Promise<null>(r=>setTimeout(()=>r(null),30000))]);
  if(!result)return;
  const clean=result.parece_real&&!result.incoerencias.length,now=nowIso();
  await DB.batch([DB.prepare('UPDATE enrollments SET discount_check=?,discount_checked_at=?'+(clean?",discount_status='aprovado'":'')+",updated_at=? WHERE id=? AND discount_status='pendente'").bind(JSON.stringify(result),now,now,id),
   audit(DB,req,null,clean?'desconto_aprovado_automatico':'desconto_incoerencia','enrollment',id,{por:'conferência automática',incoerencias:result.incoerencias,resumo:result.resumo})]);
 }catch(err){console.error('Conferência automática do documento falhou',(err as Error)?.name)}
}
const withDiscount=(rows:{number:number;kind:string;amount_cents:number;due_on:string}[],pct:number)=>pct?rows.map(r=>({...r,amount_cents:Math.round(r.amount_cents*(100-pct)/100)})):rows;
// Nome para comparar com o Lexus: maiúsculas, sem acento, sem "de/da/do/das/dos/e" e com espaços simples.
const NAME_PARTICLES=new Set(['DE','DA','DO','DAS','DOS','E','D']);
export function nameKey(name:string){return name.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z]+/g,' ').trim().split(' ').filter(w=>w&&!NAME_PARTICLES.has(w)).join(' ')}
// O banco guarda só o SHA-256 do nome normalizado e o RA (tabela lexus_ex_alunos): dá para conferir um nome, não para listar os nomes.
export async function nameHash(name:string){const k=nameKey(name);if(k.split(' ').length<2)return '';const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(k));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
// Ex-aluno: já assinou contrato numa matrícula do sistema, veio do cadastro antigo com código (CPF + nascimento),
// ou tem o mesmo nome completo de um aluno do Lexus com matrícula não cancelada (decisão do dono, 17/11/2026).
// Quem ainda está estudando (matrícula não cancelada nem encerrada, numa turma que não terminou) não é ex-aluno: não ganha o desconto
// ao se matricular em outra turma (decisão do dono, 21/11/2026). Quem cancelou ou já terminou continua com o desconto.
async function exStudent(DB:D1Database,cpf:string,birth:string,name:string):Promise<{fonte:string;ra?:string}|null>{
 if(cpf&&birth&&await DB.prepare("SELECT 1 FROM students s JOIN people p ON p.id=s.person_id JOIN enrollments e ON e.student_id=s.id JOIN classes c ON c.id=e.class_id WHERE p.cpf=? AND p.birth_date=? AND e.status NOT IN ('cancelada','encerrada') AND (c.ends_on IS NULL OR c.ends_on='' OR c.ends_on>=?) LIMIT 1").bind(cpf,birth,todaySP()).first())return null;
 if(cpf&&birth&&await DB.prepare("SELECT 1 FROM students s JOIN people p ON p.id=s.person_id WHERE p.cpf=? AND p.birth_date=? AND (COALESCE(s.legacy_code,'')<>'' OR EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.contract_signed_at IS NOT NULL)) LIMIT 1").bind(cpf,birth).first())return {fonte:'cadastro'};
 const h=name?await nameHash(name):'';if(!h)return null;
 const rows=(await DB.prepare('SELECT ra FROM lexus_ex_alunos WHERE name_hash=? ORDER BY ra LIMIT 5').bind(h).all<{ra:string}>()).results;
 return rows.length?{fonte:'lexus',ra:rows.map(r=>r.ra).join(', ')}:null;
}
// Documento de militar ou dependente: PDF ou foto, até 5 MB, guardado no R2 numa pasta que a rota pública de mídia não serve.
const DOC_MAX=5*1024*1024,DOC_PREFIX='privado/matriculas/';
function docType(bytes:Uint8Array,declared:string){const t=(a:number[])=>a.every((x,i)=>bytes[i]===x);const s=(a:number,b:number)=>new TextDecoder().decode(bytes.slice(a,b));
 if(declared==='application/pdf'&&s(0,5)==='%PDF-')return '.pdf';if(declared==='image/png'&&t([137,80,78,71]))return '.png';if(declared==='image/jpeg'&&t([255,216,255]))return '.jpg';if(declared==='image/webp'&&s(0,4)==='RIFF'&&s(8,12)==='WEBP')return '.webp';return ''}
// Valida a escolha de pagamento e devolve as parcelas que serão geradas.
function paymentChoice(b:Row,plan:PlanRow,today:string){
 const method=String(b.forma||'');if(!METHODS.includes(method)||!intList(plan.methods).includes(method))fail('Escolha Pix ou cartão.');
 if(method==='pix'){
  const first=String(b.primeira_parcela||'');if(!isDate(first)||first<today||first>addDays(today,PIX_FIRST_DAYS))fail('A primeira parcela precisa vencer em até 3 dias.');
  const max=plan.class_ends_on?pixMax(first,plan.class_ends_on):1,n=Number(b.parcelas_pix);
  if(!(plan.cash_cents>0)||!Number.isInteger(n)||n<1||n>max)fail('No Pix, escolha de 1 a '+max+' parcela'+(max>1?'s':'')+' (até o mês em que o curso termina).');
  // Com uma parcela só, não há dia de vencimento mensal.
  const day=n===1?0:Number(b.vencimento);if(n>1&&(!Number.isInteger(day)||day<1||day>28))fail('Escolha o dia de vencimento das parcelas.');
  return {method,day,first,cardN:null as number|null,visit:null as string|null,rows:pixSchedule(plan.cash_cents,n,day,first)};
 }
 const opt=cardOptions(plan).find(o=>o.n===Number(b.parcelas_cartao));if(!opt)fail('Escolha à vista ou em quantas vezes no cartão.');
 // O cartão só é passado em dia útil (segunda a sexta). Feriados ainda não são conferidos.
 const visit=String(b.visita||'');if(!isDate(visit)||visit<today||visit>addDays(today,CARD_VISIT_DAYS)||weekday(visit)===0||weekday(visit)===6)fail('Escolha um dia útil, de segunda a sexta, nos próximos 30 dias, para passar o cartão.');
 return {method,day:0,first:null as string|null,cardN:opt.n,cardParcela:opt.parcela_cents,visit,rows:[{number:1,kind:'cartao',amount_cents:opt.total_cents,due_on:visit}]};
}

function person(raw:unknown,label:string,today:string):PersonIn{
 if(!raw||typeof raw!=='object')fail(`Preencha os dados ${label}.`);const r=raw as Row;
 const full_name=text(r.nome,5,120);if(!full_name||full_name.split(' ').length<2)fail(`Digite o nome completo ${label}.`);
 const cpf=validCpf(String(r.cpf||''));if(!cpf)fail(`Confira o CPF ${label}.`);
 // RG: vai para o contrato. Guardado só com letras e números (cada estado formata de um jeito).
 const rg=String(r.rg||'').toUpperCase().replace(/[^0-9A-Z]/g,'');if(rg.length<4||rg.length>14)fail(`Confira o RG ${label}.`);
 const birth_date=String(r.nascimento||'');if(!isDate(birth_date)||birth_date>today||age(birth_date,today)>110)fail(`Confira a data de nascimento ${label}.`);
 const email=String(r.email||'').trim().toLowerCase();if(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email))fail(`Confira o e-mail ${label}.`);
 const phone=String(r.celular||'').replace(/\D/g,'');if(phone.length<10||phone.length>11)fail(`Confira o celular com DDD ${label}.`);
 const cep=String(r.cep||'').replace(/\D/g,'');if(cep.length!==8)fail(`Confira o CEP ${label}.`);
 const street=text(r.logradouro,3,150),number=text(r.numero,1,20),complement=text(r.complemento??'',0,80),district=text(r.bairro,2,80),city=text(r.cidade,2,80),state=String(r.uf||'').toUpperCase();
 if(!street||!number||complement===null||!district||!city||!UF.includes(state))fail(`Confira o endereço ${label}.`);
 return {full_name,cpf,rg,birth_date,email,phone,cep,street,number,complement,district,city,state};
}
// Cadastro antigo (importado do Lexus/planilha) pode não ter CPF, nascimento ou endereço.
// No painel, o que vier vazio fica vazio; o que vier preenchido passa pela mesma conferência da matrícula.
const isLegacyPerson=(p:Row)=>!validCpf(String(p.cpf||''))||!isDate(String(p.birth_date||''))||!String(p.cep||'')||!String(p.street||'');
function personLoose(raw:unknown,today:string):PersonIn{
 if(!raw||typeof raw!=='object')fail('Preencha os dados.');const r=raw as Row,blank=(v:unknown)=>String(v??'').trim()==='';
 const full_name=text(r.nome,5,120);if(!full_name||full_name.split(' ').length<2)fail('Digite o nome completo.');
 const birth_date=String(r.nascimento||'');if(birth_date&&(!isDate(birth_date)||birth_date>today||age(birth_date,today)>110))fail('Confira a data de nascimento.');
 const email=String(r.email||'').trim().toLowerCase();if(email&&(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)))fail('Confira o e-mail.');
 const phone=String(r.celular||'').replace(/\D/g,'');if(phone&&(phone.length<10||phone.length>11))fail('Confira o celular com DDD.');
 const addr=[r.cep,r.logradouro,r.numero,r.bairro,r.cidade,r.uf].some(v=>!blank(v));
 if(!addr)return {full_name,cpf:'',rg:'',birth_date,email,phone,cep:'',street:'',number:'',complement:'',district:'',city:'',state:''};
 const cep=String(r.cep||'').replace(/\D/g,'');if(cep.length!==8)fail('Confira o CEP.');
 const street=text(r.logradouro,3,150),number=text(r.numero,1,20),complement=text(r.complemento??'',0,80),district=text(r.bairro,2,80),city=text(r.cidade,2,80),state=String(r.uf||'').toUpperCase();
 if(!street||!number||complement===null||!district||!city||!UF.includes(state))fail('Confira o endereço completo (ou deixe o endereço todo em branco).');
 return {full_name,cpf:'',rg:'',birth_date,email,phone,cep,street,number,complement,district,city,state};
}
const masked=(p:PersonIn|Row)=>({...p,cpf:maskCpf(String(p.cpf||''))});

function audit(DB:D1Database,req:Request,staff:Staff|null,action:string,entity:string,entityId:string,detail:unknown){
 return DB.prepare('INSERT INTO audit_log(id,at,actor,role,action,entity,entity_id,detail,ip) VALUES(?,?,?,?,?,?,?,?,?)').bind(uuid(),nowIso(),staff?.email||'site',staff?.role||'publico',action,entity,entityId,JSON.stringify(detail),ip(req));
}
async function rateLimit(DB:D1Database,req:Request,scope:string,max:number){const hour=Math.floor(Date.now()/3600000);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope+':'+(ip(req)||'local')+':'+hour)))).map(x=>x.toString(16).padStart(2,'0')).join('');const r=await DB.prepare('INSERT INTO limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(hash,Date.now()+7200000).first<{count:number}>();if((r?.count||0)>max)fail('Muitas tentativas. Tente novamente mais tarde.',429)}

async function publicPlan(DB:D1Database,planId:unknown,classId?:unknown){
 const plan=await DB.prepare("SELECT p.*,c.ends_on AS class_ends_on FROM plans p JOIN classes c ON c.id=p.class_id WHERE p.id=? AND p.active=1 AND c.public=1 AND c.status='aberta'").bind(String(planId||'')).first<PlanRow>();
 if(!plan||(classId!==undefined&&plan.class_id!==classId))fail('Escolha uma turma e um plano disponíveis.');
 return plan;
}
const total=(rows:{amount_cents:number}[])=>rows.reduce((s,r)=>s+r.amount_cents,0);

// Rotas públicas: /api/matricula/opcoes, /api/matricula/simular e /api/matricula.
export async function enrollmentPublic(req:Request,path:string,DB:D1Database,sync?:SheetSync,bucket?:R2Bucket,verify?:DocVerifier,contracts?:ContractApi,raBase?:number):Promise<Response|null>{
 // Confere se a pessoa é ex-aluna, para a página mostrar o desconto: CPF e nascimento juntos ou o nome completo. Tem limite por IP.
 if(path==='matricula/desconto'&&req.method==='POST'){
  const b=await readBody(req,500),cpf=validCpf(String(b.cpf||'')),birth=isDate(b.nascimento)?b.nascimento:'',name=text(b.nome,5,120)||'';
  if(!(cpf&&birth)&&!name)return json({ex_aluno:false});
  await rateLimit(DB,req,'desconto',20);
  return json({ex_aluno:!!await exStudent(DB,cpf,birth,name),pct:DISCOUNT_PCT});
 }
 // Envio do documento de militar ou dependente. Devolve só um código para ir junto com a matrícula.
 if(path==='matricula/documento'&&req.method==='POST'){
  if(!bucket)fail('Envio de documentos indisponível agora. Fale com a equipe.',503);
  const len=Number(req.headers.get('content-length')||0);if(len>DOC_MAX+20000)fail('O arquivo pode ter até 5 MB.',413);
  let fd:FormData;try{fd=await req.formData()}catch{fail('Envie o arquivo do documento.')}
  const kind=String(fd.get('tipo')||''),part=String(fd.get('parte')||''),file=fd.get('arquivo');if(!PROOF_KINDS.includes(kind))fail('Diga se o documento é de militar ou de dependente.');
  if(!DOC_PARTS.includes(part)||(part==='vinculo'&&kind!=='dependente_militar'))fail('Diga se o arquivo é a frente, o verso ou o documento do vínculo.');
  if(!file||typeof file==='string')fail('Escolha o arquivo do documento.');const f=file as File;if(f.size>DOC_MAX)fail('O arquivo pode ter até 5 MB.',413);if(!f.size)fail('O arquivo está vazio.');
  await rateLimit(DB,req,'documento',10);
  const bytes=new Uint8Array(await f.arrayBuffer()),ext=docType(bytes,f.type);if(!ext)fail('Envie o documento em PDF, JPG, PNG ou WEBP.');
  const id=uuid(),key=DOC_PREFIX+id+ext;await bucket.put(key,bytes,{httpMetadata:{contentType:f.type}});
  await DB.prepare('INSERT INTO enrollment_documents(id,enrollment_id,kind,part,r2_key,content_type,size,uploaded_at) VALUES(?,NULL,?,?,?,?,?,?)').bind(id,kind,part,key,f.type,f.size,nowIso()).run();
  return json({documento:id});
 }
 if(path==='matricula/opcoes'&&req.method==='GET'){
  const classes=(await DB.prepare("SELECT c.id,c.name,c.exam,c.unit,c.shift,c.course_id,c.schedule,c.starts_on,c.ends_on,c.seats,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=c.id AND e.status<>'cancelada') AS taken FROM classes c WHERE c.public=1 AND c.status='aberta' ORDER BY c.starts_on,c.name").all<Row>()).results;
  const plans=(await DB.prepare("SELECT p.*,c.ends_on AS class_ends_on FROM plans p JOIN classes c ON c.id=p.class_id WHERE p.active=1 AND c.public=1 AND c.status='aberta' ORDER BY p.name").all<PlanRow>()).results;
  const t=todaySP();
  // A página mostra só o valor de cada parcela. No Pix, o máximo de parcelas vale para a primeira parcela hoje; se ela cair no mês seguinte, a página tira a última opção.
  const pub=(p:PlanRow)=>({id:p.id,class_id:p.class_id,name:p.name,due_days:intList(p.due_days),methods:intList(p.methods).filter(m=>METHODS.includes(String(m))),pix:pixOptions(p,t),cartao:cardOptions(p).map(o=>({n:o.n,parcela_cents:o.parcela_cents}))});
  return json({hoje:t,pix_primeira_ate:addDays(t,PIX_FIRST_DAYS),visita_ate:addDays(t,CARD_VISIT_DAYS),turmas:classes.map(({taken,seats,...c})=>({...c,vagas:!seats||taken<seats,planos:plans.filter(p=>p.class_id===c.id).map(pub)})).filter(c=>c.planos.length)});
 }
 if(path==='matricula/simular'&&req.method==='POST'){
  const b=await readBody(req,1000),plan=await publicPlan(DB,b.plano),pay=paymentChoice(b,plan,todaySP());
  // Simulação com desconto: ex-aluno é conferido de novo aqui; militar e dependente entram como "a conferir".
  let reason='';if(b.desconto==='ex_aluno'){if(await exStudent(DB,validCpf(String(b.cpf||'')),isDate(b.nascimento)?b.nascimento:'',text(b.nome,5,120)||''))reason='ex_aluno'}else if(PROOF_KINDS.includes(String(b.desconto)))reason=String(b.desconto);
  const pct=reason?DISCOUNT_PCT:0,rows=withDiscount(pay.rows,pct),desconto=reason?{pct,motivo:reason,texto:DISCOUNT_LABEL[reason]}:null;
  if(pay.method==='cartao')return json({parcelas:rows.map(r=>({...r,amount_cents:undefined})),cartao:{n:pay.cardN,parcela_cents:Math.round(pay.cardParcela!*(100-pct)/100),visita:pay.visit},desconto});
  return json({parcelas:rows,total_cents:total(rows),desconto});
 }
 if(path==='matricula'&&req.method==='POST'){
  const b=await readBody(req,8000);if(b.website)return json({ok:true});
  const today=todaySP(),plan=await publicPlan(DB,b.plano,b.turma);
  const pay=paymentChoice(b,plan,today),method=pay.method;
  const student=person(b.aluno,'do aluno',today),minor=age(student.birth_date,today)<18;
  let guardian:PersonIn|null=null,relationship='';
  // Responsável financeiro só para menores de 18 anos; o aluno maior de idade é o próprio responsável.
  if(minor){
   guardian=person(b.responsavel,'do responsável',today);
   if(guardian.cpf===student.cpf)fail('O responsável precisa ser outra pessoa, com CPF próprio.');
   if(age(guardian.birth_date,today)<18)fail('O responsável financeiro precisa ser maior de idade.');
   relationship=text((b.responsavel as Row).parentesco,2,40)||fail('Informe o parentesco do responsável.');
  }
  if(b.aceite!==true)fail('Para enviar, aceite a política de privacidade e os termos da matrícula.');
  // Desconto: ex-aluno é reconhecido pelo banco (aprovado na hora); militar ou dependente precisa do documento anexado (a equipe confere).
  let disc:{pct:number;reason:string;status:string;docs:string[];info:Row|null}={pct:0,reason:'',status:'',docs:[],info:null};
  // Reconhecido pelo nome no Lexus: o RA fica na matrícula para a equipe conferir se é a mesma pessoa.
  const ex=await exStudent(DB,student.cpf,student.birth_date,student.full_name);
  if(ex)disc={pct:DISCOUNT_PCT,reason:'ex_aluno',status:'aprovado',docs:[],info:ex.fonte==='lexus'?{fonte:'lexus',ra:ex.ra}:null};
  else if(PROOF_KINDS.includes(String(b.desconto||''))){
   const kind=String(b.desconto),sent=(b.documentos&&typeof b.documentos==='object'?b.documentos:{}) as Row,need=kind==='dependente_militar'?DOC_PARTS:['frente','verso'];
   const label={frente:'a frente',verso:'o verso',vinculo:'o documento do vínculo'} as Record<string,string>,ids:string[]=[];
   for(const part of need){
    const doc=await DB.prepare("SELECT id FROM enrollment_documents WHERE id=? AND kind=? AND part=? AND enrollment_id IS NULL AND uploaded_at>?").bind(String(sent[part]||''),kind,part,new Date(Date.now()-86400000).toISOString()).first<{id:string}>();
    if(!doc)fail('Para o desconto de '+DISCOUNT_LABEL[kind]+', anexe '+label[part]+'.');ids.push(doc.id);
   }
   let info:Row|null=null;
   if(kind==='dependente_militar'){const kin=String(b.parentesco||''),mil=text(b.nome_militar,5,120);if(!KINSHIP.includes(kin))fail('Diga qual é o seu vínculo com o militar.');if(!mil||mil.split(' ').length<2)fail('Digite o nome completo do militar.');info={parentesco:kin,nome_militar:mil}}
   disc={pct:DISCOUNT_PCT,reason:kind,status:'pendente',docs:ids,info};
  }
  const cls=await DB.prepare("SELECT seats,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=classes.id AND e.status<>'cancelada') AS taken FROM classes WHERE id=?").bind(plan.class_id).first<{seats:number;taken:number}>();
  if(cls&&cls.seats&&cls.taken>=cls.seats)fail('As vagas desta turma acabaram. Fale com a equipe.',409);
  await rateLimit(DB,req,'matricula',5);
  const now=nowIso(),insertPerson=(p:PersonIn)=>DB.prepare('INSERT OR IGNORE INTO people(id,full_name,cpf,rg,birth_date,email,phone,cep,street,number,complement,district,city,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(uuid(),p.full_name,p.cpf,p.rg,p.birth_date,p.email,p.phone,p.cep,p.street,p.number,p.complement,p.district,p.city,p.state,now,now);
  // Quem já está cadastrado não tem a ficha alterada pelo formulário público: os dados enviados ficam na matrícula para a equipe revisar.
  const inserted=await DB.batch([insertPerson(student),...(guardian?[insertPerson(guardian)]:[])]);
  const needsReview=inserted.some(r=>!r.meta.changes)?1:0;
  const idOf=async(cpf:string)=>(await DB.prepare('SELECT id FROM people WHERE cpf=?').bind(cpf).first<{id:string}>())!.id;
  const studentPerson=await idOf(student.cpf),guardianPerson=guardian?await idOf(guardian.cpf):null;
  await DB.prepare("INSERT OR IGNORE INTO students(id,person_id,status,biometrics_registered,created_at) VALUES(?,?,'ativo',0,?)").bind(uuid(),studentPerson,now).run();
  const studentId=(await DB.prepare('SELECT id FROM students WHERE person_id=?').bind(studentPerson).first<{id:string}>())!.id;
  // Envio repetido para a mesma turma não cria outra matrícula. A resposta é a mesma, para não revelar quem já está matriculado.
  const message='Matrícula recebida. Você vai receber o contrato por e-mail para assinar.';
  if(await DB.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND class_id=? AND status<>'cancelada'").bind(studentId,plan.class_id).first())return json({ok:true,message});
  const id=uuid(),rows=withDiscount(pay.rows,disc.pct),payer=guardianPerson||studentPerson;
  const submitted={aluno:student,responsavel:guardian?{...guardian,parentesco:relationship}:null,menor:minor,forma:method,vencimento:pay.day||null,primeira_parcela:pay.first,parcelas_cartao:pay.cardN,visita:pay.visit,desconto:disc.reason||null,recebida_em:now};
  const statements=[
   DB.prepare("INSERT INTO enrollments(id,student_id,class_id,plan_id,payer_person_id,status,due_day,payment_method,first_due_on,card_installments,card_visit_on,discount_pct,discount_reason,discount_status,discount_info,origin,submitted,needs_review,created_at,updated_at) VALUES(?,?,?,?,?,'aguardando_assinatura',?,?,?,?,?,?,?,?,?,'site',?,?,?,?)").bind(id,studentId,plan.class_id,plan.id,payer,pay.day,method,pay.first,pay.cardN,pay.visit,disc.pct,disc.reason||null,disc.status||null,disc.info?JSON.stringify(disc.info):null,JSON.stringify(submitted),needsReview,now,now),
   ...disc.docs.map(doc=>DB.prepare('UPDATE enrollment_documents SET enrollment_id=? WHERE id=? AND enrollment_id IS NULL').bind(id,doc)),
   ...(guardianPerson?[DB.prepare('INSERT OR IGNORE INTO student_guardians(id,student_id,person_id,kind,relationship,created_at) VALUES(?,?,?,?,?,?)').bind(uuid(),studentId,guardianPerson,minor?'legal_financeiro':'financeiro',relationship,now)]:[]),
   ...[...new Set([studentPerson,payer])].map(p=>DB.prepare("INSERT INTO consents(id,person_id,enrollment_id,document,version,accepted_at,ip) VALUES(?,?,?,'politica_privacidade_e_termos_matricula',?,?,?)").bind(uuid(),p,id,CONSENT_VERSION,now,ip(req))),
   ...rows.map(r=>DB.prepare("INSERT INTO installments(id,enrollment_id,number,kind,amount_cents,due_on,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'aberta',?,?)").bind(uuid(),id,r.number,r.kind,r.amount_cents,r.due_on,now,now)),
   audit(DB,req,null,'matricula_recebida','enrollment',id,{turma:plan.class_id,plano:plan.id,forma:method,parcelas:rows.length,parcelas_cartao:pay.cardN,visita:pay.visit,total_cents:total(rows),desconto:disc.reason||null,desconto_situacao:disc.status||null,revisar:!!needsReview}),
  ];
  await DB.batch(statements);
  await assignRa(DB,studentId,ex?.fonte==='lexus'&&ex.ra&&!ex.ra.includes(',')?ex.ra:null,raBase||0).catch(err=>console.error('RA não atribuído',(err as Error)?.name));
  // Militar ou dependente: conferência automática dos documentos, quando ligada. Se falhar ou demorar, fica para a equipe.
  if(disc.status==='pendente'&&verify&&bucket)await runDocCheck(DB,req,bucket,verify,id);
  // Contrato: sai na hora, menos com desconto ainda a conferir (a equipe envia depois de olhar).
  const later=(await DB.prepare('SELECT discount_status FROM enrollments WHERE id=?').bind(id).first<Row>())?.discount_status==='pendente';
  const sent=!later&&!!contracts&&await sendContract(DB,req,contracts,id,null);
  await syncEnrollment(DB,sync,id);
  return json({ok:true,message,contrato:sent?'agora':'depois'});
 }
 return null;
}

export async function staffRole(DB:D1Database,email:string):Promise<Role>{const r=await DB.prepare('SELECT role FROM staff_roles WHERE email=?').bind(email.toLowerCase()).first<{role:Role}>();return r&&ROLES.includes(r.role)?r.role:'admin'}

// Rotas do painel: matrículas, turmas e planos, financeiro, equipe e registro. Cada rota confere o perfil.
export async function enrollmentAdmin(req:Request,path:string,DB:D1Database,staff:Staff,teamEmails:string[],sync?:SheetSync,bucket?:R2Bucket,contracts?:ContractApi):Promise<Response|null>{
 const url=new URL(req.url),q=(k:string)=>url.searchParams.get(k)||'',GET=req.method==='GET',POST=req.method==='POST';
 const can=(...roles:Role[])=>{if(!roles.includes(staff.role))fail('Seu perfil não permite esta ação.',403)};
 const today=todaySP(),now=nowIso();
 if(path==='admin/equipe/eu'&&GET)return json({email:staff.email,role:staff.role});

 if(path==='admin/matriculas'&&GET){
  // Filtro por período: "por=efetivada" usa o dia da assinatura do contrato; senão, o dia em que a matrícula chegou.
  const like=q('q')?'%'+q('q').replace(/[\\%_]/g,'\\$&')+'%':'',from=q('de'),to=q('ate')||from,byCol=q('por')==='efetivada'?'e.contract_signed_at':'e.created_at';
  if(from&&(!isDate(from)||!isDate(to)))fail('Período inválido.');
  const rows=(await DB.prepare(`SELECT e.id,e.status,e.created_at,e.contract_signed_at,e.needs_review,e.payment_method,p.full_name,p.cpf,c.name AS class_name,pl.name AS plan_name,s.biometrics_registered,(SELECT COUNT(*) FROM installments i WHERE i.enrollment_id=e.id AND i.status='aberta' AND i.due_on<?1) AS overdue FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id WHERE (?2='' OR e.status=?2) AND (?3='' OR e.class_id=?3) AND (?4='' OR p.full_name LIKE ?4 ESCAPE '\\') AND (?5='' OR ${SP_DAY(byCol)} BETWEEN ?5 AND ?6) ORDER BY ${byCol} DESC LIMIT 1000`).bind(today,q('situacao'),q('turma'),like,from,to).all<Row>()).results;
  if(staff.role==='consulta')return json({matriculas:rows.map(r=>({id:r.id,codigo:enrollmentCode(r.id),status:r.status,full_name:r.full_name,class_name:r.class_name,created_at:r.created_at,contract_signed_at:r.contract_signed_at}))});
  return json({matriculas:rows.map(r=>({...r,codigo:enrollmentCode(r.id),cpf:maskCpf(r.cpf)}))});
 }
 if(path==='admin/matriculas/agenda'&&GET){
  // Agenda do mês (quantas chegaram e quantas foram efetivadas em cada dia) e contagem por turma.
  const month=q('mes')||today.slice(0,7);if(!isMonth(month))fail('Mês inválido.');
  const perDay=async(col:string,extra:string)=>(await DB.prepare(`SELECT ${SP_DAY(col)} AS dia,COUNT(*) AS n FROM enrollments e WHERE ${col} IS NOT NULL ${extra} AND substr(${SP_DAY(col)},1,7)=? GROUP BY dia`).bind(month).all<{dia:string;n:number}>()).results;
  const received=await perDay('e.created_at',''),signed=await perDay('e.contract_signed_at',"AND e.status<>'cancelada'");
  const days=[...new Set([...received,...signed].map(r=>r.dia))].sort().map(dia=>({dia,recebidas:received.find(r=>r.dia===dia)?.n||0,efetivadas:signed.find(r=>r.dia===dia)?.n||0}));
  const classes=(await DB.prepare(`SELECT c.id,c.name,c.status,c.seats,c.starts_on,
   COALESCE(SUM(CASE WHEN ${EFFECTIVE} THEN 1 ELSE 0 END),0) AS efetivadas,
   COALESCE(SUM(CASE WHEN ${EFFECTIVE} AND substr(${SP_DAY('e.contract_signed_at')},1,7)=?1 THEN 1 ELSE 0 END),0) AS efetivadas_mes,
   COALESCE(SUM(CASE WHEN e.status='aguardando_assinatura' THEN 1 ELSE 0 END),0) AS aguardando_assinatura,
   COALESCE(SUM(CASE WHEN e.status='aguardando_pagamento' THEN 1 ELSE 0 END),0) AS aguardando_pagamento,
   COALESCE(SUM(CASE WHEN e.status='aguardando_biometria' THEN 1 ELSE 0 END),0) AS aguardando_biometria,
   COALESCE(SUM(CASE WHEN e.status='ativa' THEN 1 ELSE 0 END),0) AS ativas,
   COALESCE(SUM(CASE WHEN e.status='cancelada' THEN 1 ELSE 0 END),0) AS canceladas
   FROM classes c LEFT JOIN enrollments e ON e.class_id=c.id GROUP BY c.id ORDER BY c.status='encerrada',c.starts_on,c.name`).bind(month).all<Row>()).results;
  // Vagas livres: o contrato pendente segura a vaga, para a turma não passar do limite enquanto a pessoa assina.
  return json({mes:month,hoje:today,dias:days,turmas:classes.map(c=>({...c,vagas_livres:c.seats?Math.max(c.seats-c.efetivadas-c.aguardando_assinatura,0):null}))});
 }
 if(path==='admin/matriculas/resumo-dia'&&GET){
  // Resumo do dia para a visão geral: matrículas em destaque, pendências e, por perfil, financeiro e atendimento do site.
  const d=q('dia')||today;if(!isDate(d)||d>today)fail('Dia inválido.');const prev=addDays(d,-1);
  const n=async(sql:string,...a:unknown[])=>Number((await DB.prepare(sql).bind(...a).first<{n:number}>())?.n||0);
  const onDay=(col:string,extra='')=>`SELECT COUNT(*) AS n FROM enrollments e WHERE ${SP_DAY(col)}=? ${extra}`,live="AND e.status<>'cancelada'";
  const enrollmentsToday={recebidas:await n(onDay('e.created_at'),d),recebidas_dia_anterior:await n(onDay('e.created_at'),prev),
   efetivadas:await n(onDay('e.contract_signed_at',live),d),efetivadas_dia_anterior:await n(onDay('e.contract_signed_at',live),prev),
   aguardando_assinatura:await n("SELECT COUNT(*) AS n FROM enrollments WHERE status='aguardando_assinatura'"),
   assinatura_ha_mais_de_3_dias:await n(`SELECT COUNT(*) AS n FROM enrollments e WHERE e.status='aguardando_assinatura' AND ${SP_DAY('e.created_at')}<=?`,addDays(today,-3)),
   aguardando_biometria:await n("SELECT COUNT(*) AS n FROM enrollments WHERE status='aguardando_biometria'"),
   revisar_cadastro:await n("SELECT COUNT(*) AS n FROM enrollments WHERE needs_review=1 AND status<>'cancelada'"),
   desconto_a_conferir:await n("SELECT COUNT(*) AS n FROM enrollments WHERE discount_status='pendente' AND status<>'cancelada'"),
   desconto_com_incoerencia:await n("SELECT COUNT(*) AS n FROM enrollments WHERE discount_status='pendente' AND discount_check IS NOT NULL AND status<>'cancelada'")};
  const list=(await DB.prepare(`SELECT e.id,e.status,e.created_at,e.contract_signed_at,p.full_name,c.name AS class_name,${SP_DAY('e.created_at')}=?1 AS recebida_no_dia,COALESCE(${SP_DAY('e.contract_signed_at')}=?1,0) AS efetivada_no_dia FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id JOIN classes c ON c.id=e.class_id WHERE ${SP_DAY('e.created_at')}=?1 OR ${SP_DAY('e.contract_signed_at')}=?1 ORDER BY COALESCE(e.contract_signed_at,e.created_at) DESC LIMIT 50`).bind(d).all<Row>()).results;
  // Turmas perto do limite: 90% das vagas tomadas por efetivadas e contratos pendentes.
  const full=(await DB.prepare(`SELECT c.name,c.seats,COALESCE(SUM(CASE WHEN ${EFFECTIVE} OR e.status='aguardando_assinatura' THEN 1 ELSE 0 END),0) AS tomadas FROM classes c LEFT JOIN enrollments e ON e.class_id=c.id WHERE c.seats>0 AND c.status='aberta' GROUP BY c.id`).all<Row>()).results.filter(c=>c.tomadas>=c.seats*0.9).map(c=>({turma:c.name,vagas:c.seats,livres:Math.max(c.seats-c.tomadas,0)}));
  const money=async(sql:string,...a:unknown[])=>(await DB.prepare(sql).bind(...a).first<{n:number;cents:number}>())||{n:0,cents:0};
  const finance=['admin','financeiro'].includes(staff.role)?{
   recebido:await money("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM payments WHERE status='confirmado' AND paid_on=?",d),
   recebido_dia_anterior:await money("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM payments WHERE status='confirmado' AND paid_on=?",prev),
   vence_no_dia:await money("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM installments WHERE status='aberta' AND due_on=?",d),
   vencido_hoje:await money("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM installments WHERE status='aberta' AND due_on<?",today),
   matriculas_em_atraso:await n("SELECT COUNT(DISTINCT enrollment_id) AS n FROM installments WHERE status='aberta' AND due_on<?",today)}:null;
  const site=['admin','secretaria'].includes(staff.role)?{aula_teste:await n(`SELECT COUNT(*) AS n FROM trial_requests WHERE ${SP_DAY('created_at')}=?`,d),newsletter:await n(`SELECT COUNT(*) AS n FROM contacts WHERE ${SP_DAY('created_at')}=?`,d)}:null;
  return json({dia:d,hoje:today,matriculas:enrollmentsToday,lista:list,turmas_quase_lotadas:full,financeiro:finance,site});
 }
 // Modelo do contrato (Word): o administrador envia; administrador e secretaria veem a situação e baixam o arquivo atual.
 if(path==='admin/matriculas/modelo-contrato'&&GET){
  can('admin','secretaria');if(!bucket)fail('Armazenamento indisponível.',503);
  const o=await bucket.get(CONTRACT_MODEL_KEY);
  if(q('baixar')==='1'){if(!o)fail('Nenhum modelo enviado.',404);await audit(DB,req,staff,'baixar_modelo_contrato','contrato','modelo',{}).run();return new Response(o.body,{headers:{'Content-Type':DOCX_TYPE,'Content-Disposition':'attachment; filename="modelo-contrato-getepe.docx"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
  return json({enviado:!!o,enviado_em:o?.customMetadata?.enviado_em||null,por:o?.customMetadata?.por||null,docuseal:!!contracts});
 }
 if(path==='admin/matriculas/modelo-contrato'&&POST){
  can('admin');if(!bucket)fail('Armazenamento indisponível.',503);
  const form=await req.formData().catch(()=>null),f=form?.get('arquivo');
  if(!f||typeof f==='string')fail('Escolha o arquivo do contrato em Word (.docx).');
  if(f.size>5*1024*1024)fail('O arquivo pode ter até 5 MB.');
  const bytes=new Uint8Array(await f.arrayBuffer());
  // Word (.docx) é um arquivo zip: começa com "PK".
  if(!/\.docx$/i.test(f.name)||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==3||bytes[3]!==4)fail('Envie o contrato em Word (.docx).');
  await bucket.put(CONTRACT_MODEL_KEY,bytes,{httpMetadata:{contentType:DOCX_TYPE},customMetadata:{por:staff.email,enviado_em:now}});
  await audit(DB,req,staff,'enviar_modelo_contrato','contrato','modelo',{tamanho:f.size}).run();
  return json({ok:true});
 }
 // DocuSeal: a equipe envia (ou reenvia) o contrato; com desconto a conferir, primeiro aprova ou recusa.
 if(path==='admin/matriculas/enviar-contrato'&&POST){
  can('admin','secretaria');if(!contracts)fail('O DocuSeal ainda não está ligado no site.',503);
  const b=await readBody(req,1000),id=String(b.id||''),e=await DB.prepare('SELECT status,contract_signed_at,discount_status FROM enrollments WHERE id=?').bind(id).first<Row>();
  if(!e)fail('Matrícula não encontrada.',404);if(e.status==='cancelada')fail('Matrícula cancelada.',409);if(e.contract_signed_at)fail('O contrato já foi assinado.',409);
  if(e.discount_status==='pendente')fail('Aprove ou recuse o desconto antes de enviar o contrato.',409);
  if(!await sendContract(DB,req,contracts,id,staff))fail('O DocuSeal não aceitou o envio. Tente de novo em alguns minutos.',502);
  return json({ok:true});
 }
 // Contrato assinado: a cópia guardada pelo GETEPE (guarda na hora, se ainda faltar). Sem cópia, link novo do DocuSeal (vale 40 minutos).
 if(path==='admin/matriculas/contrato-pdf'&&GET){
  can('admin','secretaria');
  const e=await DB.prepare('SELECT id,contract_ref,contract_signed_at FROM enrollments WHERE id=?').bind(q('id')).first<Row>();if(!e?.contract_ref)fail('Esta matrícula não tem contrato no DocuSeal.',404);
  if(bucket&&e.contract_signed_at){
   let obj=await bucket.get(signedContractKey(e.id));
   if(!obj&&await archiveSignedContract(DB,req,bucket,contracts,staff,e.id,e.contract_ref))obj=await bucket.get(signedContractKey(e.id));
   if(obj){
    await audit(DB,req,staff,'ver_contrato','enrollment',e.id,{contrato:e.contract_ref,copia:'arquivo do GETEPE'}).run();
    return new Response(obj.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="contrato-'+enrollmentCode(e.id)+'.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});
   }
  }
  if(!contracts)fail('O DocuSeal ainda não está ligado no site.',503);
  const link=await contracts.documentUrl(e.contract_ref).catch(()=>null);if(!link||!/^https:\/\//.test(link))fail('O DocuSeal não devolveu o documento agora. Tente de novo.',502);
  await audit(DB,req,staff,'ver_contrato','enrollment',q('id'),{contrato:e.contract_ref}).run();
  return new Response(null,{status:302,headers:{Location:link,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 // Guarda a cópia dos contratos assinados que ainda não têm (assinados antes desta função ou com falha). Até 20 por clique.
 if(path==='admin/matriculas/guardar-contratos'&&POST){
  can('admin');if(!bucket||!contracts?.signedPdf)fail('O DocuSeal ainda não está ligado no site.',503);
  const rows=(await DB.prepare('SELECT id,contract_ref FROM enrollments WHERE contract_signed_at IS NOT NULL AND contract_ref IS NOT NULL ORDER BY contract_signed_at').all<Row>()).results;
  let guardados=0,ja=0,falhas=0;
  for(const r of rows){if(await bucket.head(signedContractKey(r.id))){ja++;continue}if(guardados+falhas>=20)continue;if(await archiveSignedContract(DB,req,bucket,contracts,staff,r.id,r.contract_ref))guardados++;else falhas++}
  return json({ok:true,guardados,ja_guardados:ja,falhas,faltam:rows.length-ja-guardados});
 }
 if(path==='admin/matriculas/contrato'&&POST){
  can('admin','secretaria');const b=await readBody(req,1000),signedOn=b.data||today;
  if(!isDate(signedOn)||signedOn>today)fail('Confira a data da assinatura.');
  const e=await DB.prepare('SELECT status,contract_signed_at FROM enrollments WHERE id=?').bind(String(b.id)).first<Row>();if(!e)fail('Matrícula não encontrada.',404);
  if(e.status==='cancelada')fail('Matrícula cancelada não pode ser efetivada.',409);
  // Guardado como meio-dia em São Paulo, para cair no mesmo dia em qualquer conversão.
  const at=signedOn===today?now:signedOn+'T15:00:00.000Z',status=e.status==='aguardando_assinatura'?'aguardando_pagamento':e.status;
  await DB.batch([DB.prepare('UPDATE enrollments SET contract_signed_at=?,status=?,updated_at=? WHERE id=?').bind(at,status,now,String(b.id)),audit(DB,req,staff,'contrato_assinado','enrollment',String(b.id),{data:signedOn,antes:e.status,depois:status,assinatura_anterior:e.contract_signed_at})]);
  await syncEnrollment(DB,sync,String(b.id));
  return json({ok:true});
 }
 if(path==='admin/matriculas/detalhe'&&GET){
  can('admin','secretaria','financeiro');
  const e=await DB.prepare('SELECT e.*,c.name AS class_name,pl.name AS plan_name,s.person_id,s.biometrics_registered,s.biometrics_at,s.biometrics_by FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id JOIN students s ON s.id=e.student_id WHERE e.id=?').bind(q('id')).first<Row>();
  if(!e)fail('Matrícula não encontrada.',404);
  const personOf=(id:string)=>DB.prepare('SELECT * FROM people WHERE id=?').bind(id).first<Row>();
  const guardians=(await DB.prepare('SELECT g.kind,g.relationship,p.* FROM student_guardians g JOIN people p ON p.id=g.person_id WHERE g.student_id=?').bind(e.student_id).all<Row>()).results;
  const parcels=(await DB.prepare("SELECT i.*,(SELECT json_group_array(json_object('amount_cents',y.amount_cents,'method',y.method,'paid_on',y.paid_on,'origin',y.origin,'recorded_by',y.recorded_by,'note',y.note)) FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado') AS payments FROM installments i WHERE i.enrollment_id=? ORDER BY i.number").bind(e.id).all<Row>()).results;
  const overdue=parcels.filter(p=>p.status==='aberta'&&p.due_on<today).length;
  await audit(DB,req,staff,'ver_dados','enrollment',e.id,{}).run();
  const {submitted,...enrollment}=e;
  // Documentos anexados (comprovante de militar ou dependente): só administrador e secretaria abrem o arquivo.
  const docs=(await DB.prepare('SELECT id,kind,part,content_type,size,uploaded_at FROM enrollment_documents WHERE enrollment_id=? ORDER BY uploaded_at').bind(e.id).all<Row>()).results;
  const parse=(s:string|null)=>{try{return s?JSON.parse(s):null}catch{return null}};
  const kept=e.contract_signed_at&&bucket?await bucket.head(signedContractKey(e.id)).catch(()=>null):null;
  return json({matricula:{...enrollment,contrato_guardado_em:kept?(kept.customMetadata?.guardado_em||kept.uploaded?.toISOString?.()||'sim'):null,discount_info:parse(e.discount_info),discount_check:parse(e.discount_check),codigo:enrollmentCode(e.id),documentos:docs,desconto_texto:e.discount_reason?DISCOUNT_LABEL[e.discount_reason]||e.discount_reason:null},aluno:await personOf(e.person_id),pagador:await personOf(e.payer_person_id),responsaveis:guardians,
   enviado:e.needs_review?JSON.parse(submitted):null,
   financeiro:['admin','financeiro'].includes(staff.role)?{parcelas:parcels.map(p=>({...p,payments:JSON.parse(p.payments||'[]')}))}:{em_dia:!overdue,vencidas:overdue}});
 }
 if(path==='admin/matriculas/documento'&&GET){
  can('admin','secretaria');
  const d=await DB.prepare('SELECT * FROM enrollment_documents WHERE id=? AND enrollment_id IS NOT NULL').bind(q('id')).first<Row>();if(!d)fail('Documento não encontrado.',404);
  if(!bucket)fail('Arquivos indisponíveis agora.',503);const obj=await bucket.get(d.r2_key);if(!obj)fail('Arquivo não encontrado.',404);
  await audit(DB,req,staff,'ver_documento','enrollment',d.enrollment_id,{documento:d.id,tipo:d.kind}).run();
  return new Response(obj.body,{headers:{'Content-Type':d.content_type,'Content-Disposition':'attachment; filename="documento-'+enrollmentCode(d.enrollment_id)+d.r2_key.slice(d.r2_key.lastIndexOf('.'))+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});
 }
 // Desconto de militar ou dependente: a equipe confere o documento e aprova, ou recusa e as parcelas em aberto voltam ao valor cheio.
 if(path==='admin/matriculas/desconto'&&POST){
  can('admin','secretaria');const b=await readBody(req,1000),id=String(b.id||''),decision=String(b.decisao||''),reason=text(b.motivo??'',0,300);
  if(!['aprovar','recusar'].includes(decision))fail('Escolha aprovar ou recusar.');if(reason===null||(decision==='recusar'&&reason.length<3))fail('Informe o motivo da recusa.');
  const e=await DB.prepare('SELECT * FROM enrollments WHERE id=?').bind(id).first<Row>();if(!e)fail('Matrícula não encontrada.',404);
  if(!PROOF_KINDS.includes(e.discount_reason)||e.discount_status!=='pendente')fail('Esta matrícula não tem desconto a conferir.',409);
  const stmts=[];
  if(decision==='aprovar')stmts.push(DB.prepare("UPDATE enrollments SET discount_status='aprovado',updated_at=? WHERE id=?").bind(now,id));
  else{
   // Volta ao valor cheio: no Pix, o valor à vista dividido no mesmo número de parcelas; no cartão, o total da opção escolhida.
   const plan=(await DB.prepare('SELECT * FROM plans WHERE id=?').bind(e.plan_id).first<PlanRow>())!;
   const all=(await DB.prepare('SELECT id,kind,number,status FROM installments WHERE enrollment_id=?').bind(id).all<Row>()).results;
   const pixFull=pixSchedule(plan.cash_cents,all.filter(r=>r.kind==='mensalidade').length||1,1,'2000-01-01');
   const full=(r:Row)=>r.kind==='mensalidade'?pixFull[r.number-1]?.amount_cents:r.kind==='cartao'?cardOptions(plan).find(o=>o.n===e.card_installments)?.total_cents:null;
   for(const r of all.filter(x=>x.status==='aberta')){const v=full(r);if(v)stmts.push(DB.prepare("UPDATE installments SET amount_cents=?,updated_at=? WHERE id=? AND status='aberta'").bind(v,now,r.id))}
   stmts.push(DB.prepare("UPDATE enrollments SET discount_pct=0,discount_status='recusado',updated_at=? WHERE id=?").bind(now,id));
  }
  stmts.push(audit(DB,req,staff,decision==='aprovar'?'desconto_aprovado':'desconto_recusado','enrollment',id,{motivo:e.discount_reason,obs:reason}));
  await DB.batch(stmts);
  // Desconto aprovado: o contrato sai junto. Recusado: a equipe fala com a pessoa e envia pelo botão quando for o caso.
  const sent=decision==='aprovar'&&contracts&&!e.contract_sent_at&&!e.contract_signed_at?await sendContract(DB,req,contracts,id,staff):null;
  await syncEnrollment(DB,sync,id);
  return json({ok:true,contrato_enviado:sent});
 }
 if(path==='admin/matriculas/situacao'&&POST){
  can('admin','secretaria');const b=await readBody(req,2000),status=String(b.situacao||''),reason=text(b.motivo??'',0,300);
  if(!STATUS.includes(status))fail('Situação inválida.');if(reason===null||(['cancelada','encerrada'].includes(status)&&reason.length<3))fail('Informe o motivo.');
  const before=await DB.prepare('SELECT status,contract_signed_at FROM enrollments WHERE id=?').bind(String(b.id)).first<{status:string;contract_signed_at:string|null}>();if(!before)fail('Matrícula não encontrada.',404);
  // Sair de "aguardando assinatura" para uma situação posterior efetiva a matrícula hoje; voltar a ela desfaz a efetivação.
  const signedAt=status==='aguardando_assinatura'?null:before.contract_signed_at||(SIGNED_STATUS.includes(status)?now:null);
  await DB.batch([DB.prepare('UPDATE enrollments SET status=?,status_reason=?,contract_signed_at=?,updated_at=? WHERE id=?').bind(status,reason||null,signedAt,now,String(b.id)),audit(DB,req,staff,'mudar_situacao','enrollment',String(b.id),{antes:before.status,depois:status,motivo:reason,contrato_assinado_em:signedAt})]);
  await syncEnrollment(DB,sync,String(b.id));
  return json({ok:true});
 }
 if(path==='admin/matriculas/biometria'&&POST){
  can('admin','secretaria');const b=await readBody(req,2000),done=b.feito===true;
  const e=await DB.prepare('SELECT student_id FROM enrollments WHERE id=?').bind(String(b.id)).first<{student_id:string}>();if(!e)fail('Matrícula não encontrada.',404);
  await DB.batch([
   DB.prepare('UPDATE students SET biometrics_registered=?,biometrics_at=?,biometrics_by=? WHERE id=?').bind(done?1:0,done?now:null,done?staff.email:null,e.student_id),
   ...(done?[DB.prepare("UPDATE enrollments SET status='ativa',updated_at=? WHERE student_id=? AND status='aguardando_biometria'").bind(now,e.student_id)]:[]),
   audit(DB,req,staff,done?'biometria_cadastrada':'biometria_desmarcada','student',e.student_id,{matricula:String(b.id)})]);
  // A biometria vale para todas as matrículas do aluno: atualiza na planilha as que mudaram de situação.
  for(const r of (await DB.prepare('SELECT id FROM enrollments WHERE student_id=?').bind(e.student_id).all<{id:string}>()).results)await syncEnrollment(DB,sync,r.id);
  return json({ok:true});
 }
 if(path==='admin/matriculas/revisada'&&POST){
  can('admin','secretaria');const b=await readBody(req,2000);
  await DB.batch([DB.prepare('UPDATE enrollments SET needs_review=0,updated_at=? WHERE id=?').bind(now,String(b.id)),audit(DB,req,staff,'marcar_revisada','enrollment',String(b.id),{})]);
  return json({ok:true});
 }
 // Alunos: busca por nome, CPF ou código (da matrícula ou do aluno) e a ficha com dados, matrículas, financeiro e histórico.
 if(path==='admin/alunos'&&GET){
  const raw=q('q').trim(),digits=raw.replace(/\D/g,''),code=/^[0-9a-f]{8}$/i.test(raw)?raw.toUpperCase():'';
  const cpf=digits.length===11&&!code?digits:'',like=!cpf&&!code&&raw?'%'+raw.replace(/[\\%_]/g,'\\$&')+'%':'';
  if(raw&&raw.length<2)fail('Digite pelo menos 2 letras.');
  const rows=(await DB.prepare(`SELECT s.id,s.status,s.biometrics_registered,p.full_name,p.cpf,
   (SELECT group_concat(c.name,' · ') FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=s.id AND e.status<>'cancelada') AS turmas,
   (SELECT e.status FROM enrollments e WHERE e.student_id=s.id ORDER BY e.created_at DESC LIMIT 1) AS situacao,
   (SELECT COUNT(*) FROM installments i JOIN enrollments e ON e.id=i.enrollment_id WHERE e.student_id=s.id AND i.status='aberta' AND i.due_on<?1) AS vencidas,
   (SELECT COALESCE(SUM(i.amount_cents),0) FROM installments i JOIN enrollments e ON e.id=i.enrollment_id WHERE e.student_id=s.id AND i.status='aberta' AND i.due_on<?1) AS vencido_cents,
   (SELECT COALESCE(SUM(i.amount_cents),0) FROM installments i JOIN enrollments e ON e.id=i.enrollment_id WHERE e.student_id=s.id AND i.status='aberta') AS aberto_cents
   FROM students s JOIN people p ON p.id=s.person_id
   WHERE (?2='' OR p.full_name LIKE ?2 ESCAPE '\\') AND (?3='' OR p.cpf=?3)
    AND (?4='' OR upper(substr(replace(s.id,'-',''),1,8))=?4 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND upper(substr(replace(e.id,'-',''),1,8))=?4))
   ORDER BY p.full_name LIMIT 500`).bind(today,like,cpf,code).all<Row>()).results;
  const list=q('atraso')==='1'?rows.filter(r=>r.vencidas>0):rows;
  if(staff.role==='consulta')return json({alunos:list.map(r=>({id:r.id,codigo:enrollmentCode(r.id),full_name:r.full_name,turmas:r.turmas,situacao:r.situacao}))});
  const money=['admin','financeiro'].includes(staff.role);
  return json({alunos:list.map(r=>({id:r.id,codigo:enrollmentCode(r.id),full_name:r.full_name,cpf:maskCpf(r.cpf),status:r.status,biometrics_registered:r.biometrics_registered,turmas:r.turmas,situacao:r.situacao,vencidas:r.vencidas,...(money?{vencido_cents:r.vencido_cents,aberto_cents:r.aberto_cents}:{})}))});
 }
 if(path==='admin/alunos/ficha'&&GET){
  can('admin','secretaria','financeiro');
  const s=await DB.prepare('SELECT * FROM students WHERE id=?').bind(q('id')).first<Row>();if(!s)fail('Aluno não encontrado.',404);
  const person=await DB.prepare('SELECT * FROM people WHERE id=?').bind(s.person_id).first<Row>();
  const guardians=(await DB.prepare('SELECT g.kind,g.relationship,p.* FROM student_guardians g JOIN people p ON p.id=g.person_id WHERE g.student_id=?').bind(s.id).all<Row>()).results;
  const enrollments=(await DB.prepare('SELECT e.id,e.status,e.status_reason,e.created_at,e.contract_signed_at,e.due_day,e.payment_method,e.origin,c.name AS class_name,c.shift,c.starts_on,c.ends_on,pl.name AS plan_name,(SELECT COALESCE(SUM(i.amount_cents),0) FROM installments i WHERE i.enrollment_id=e.id AND i.status<>\'cancelada\') AS total_cents,e.card_installments,e.card_visit_on,e.first_due_on FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id WHERE e.student_id=? ORDER BY e.created_at DESC').bind(s.id).all<Row>()).results;
  const parcels=(await DB.prepare("SELECT i.id,i.number,i.kind,i.amount_cents,i.due_on,i.status,i.cancel_reason,c.name AS class_name,p.full_name,(SELECT y.paid_on FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado' ORDER BY y.paid_on DESC LIMIT 1) AS paid_on,(SELECT y.method FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado' ORDER BY y.paid_on DESC LIMIT 1) AS paid_method,(SELECT COALESCE(SUM(y.amount_cents),0) FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado') AS paid_cents FROM installments i JOIN enrollments e ON e.id=i.enrollment_id JOIN classes c ON c.id=e.class_id JOIN people p ON p.id=e.payer_person_id WHERE e.student_id=? ORDER BY i.due_on,i.number").bind(s.id).all<Row>()).results;
  const live=parcels.filter(p=>p.status!=='cancelada'),overdue=live.filter(p=>p.status==='aberta'&&p.due_on<today),next=live.find(p=>p.status==='aberta'&&p.due_on>=today);
  const sum=(l:Row[],k='amount_cents')=>l.reduce((t,p)=>t+(p[k]||0),0),money=['admin','financeiro'].includes(staff.role);
  const ids=[s.id,person!.id,...enrollments.map(e=>e.id),...parcels.map(p=>p.id)];
  const history=staff.role==='admin'?(await DB.prepare(`SELECT at,actor,role,action,entity,detail FROM audit_log WHERE entity_id IN (${ids.map(()=>'?').join(',')}) ORDER BY at DESC LIMIT 100`).bind(...ids).all<Row>()).results.map(r=>({...r,detail:JSON.parse(r.detail)})):null;
  await audit(DB,req,staff,'ver_dados','student',s.id,{}).run();
  const catraca=String(s.access_code||s.legacy_code||'').replace(/^0+(?=\d)/,'');
  return json({aluno:{...person,codigo:enrollmentCode(s.id),status:s.status,biometrics_registered:s.biometrics_registered,biometrics_at:s.biometrics_at,cadastrado_em:s.created_at,catraca_numero:catraca||null,catraca_legado:!s.access_code&&!!s.legacy_code},responsaveis:guardians,
   matriculas:enrollments.map(e=>({...e,codigo:enrollmentCode(e.id),...(money?{}:{total_cents:undefined})})),
   // Secretaria vê só se está em dia; valores e parcelas ficam com administrador e financeiro, como na ficha da matrícula.
   financeiro:money?{resumo:{contratado_cents:sum(live),pago_cents:sum(live,'paid_cents'),aberto_cents:sum(live.filter(p=>p.status==='aberta')),vencido_cents:sum(overdue),vencidas:overdue.length,proxima:next?{due_on:next.due_on,amount_cents:next.amount_cents}:null},parcelas:parcels}
    :{resumo:{vencidas:overdue.length}},
   historico:history});
 }
 // Número do aluno na catraca (o mesmo gravado com a digital). Sem "numero", gera o próximo livre.
 // O número antigo do Secullum (legacy_code) continua valendo até alguém definir um novo.
 if(path==='admin/alunos/catraca'&&POST){
  can('admin','secretaria');const b=await readBody(req,1000);
  const s=await DB.prepare('SELECT id,access_code,legacy_code FROM students WHERE id=?').bind(String(b.id)).first<Row>();if(!s)fail('Aluno não encontrado.',404);
  const CODE="ltrim(COALESCE(NULLIF(access_code,''),legacy_code),'0')";
  let numero=b.numero===undefined||b.numero===null||b.numero===''?'':String(b.numero).trim();
  if(numero){if(!/^\d{1,10}$/.test(numero)||/^0+$/.test(numero))fail('Use só números, de 1 a 10 dígitos.');numero=numero.replace(/^0+/,'')}
  else{
   // Segue a sequência das matrículas (hoje na casa dos 4 dígitos). Números de 6 ou mais dígitos ficam de fora:
   // no Secullum alguns alunos ganharam o ano no fim (ex.: 4257 + "26" = 425726) e puxariam a sequência lá para cima.
   const usados=new Set(((await DB.prepare(`SELECT ltrim(access_code,'0') AS c FROM students WHERE access_code GLOB '[0-9]*' UNION SELECT ltrim(legacy_code,'0') FROM students WHERE legacy_code GLOB '[0-9]*'`).all<{c:string}>()).results||[]).map(r=>String(r.c)));
   let n=1000;for(const c of usados)if(c.length<=5)n=Math.max(n,Number(c));
   do n++;while(usados.has(String(n)));
   numero=String(n);
  }
  const dono=await DB.prepare(`SELECT p.full_name FROM students s JOIN people p ON p.id=s.person_id WHERE s.id<>? AND ${CODE.replace(/access_code|legacy_code/g,m=>'s.'+m)}=?`).bind(s.id,numero).first<{full_name:string}>();
  if(dono)fail('O número '+numero+' já é de '+dono.full_name+'.',409);
  await DB.batch([DB.prepare('UPDATE students SET access_code=? WHERE id=?').bind(numero,s.id),audit(DB,req,staff,'numero_catraca','student',s.id,{antes:s.access_code||s.legacy_code||null,depois:numero})]);
  return json({ok:true,numero});
 }
 if(path==='admin/pessoas/editar'&&POST){
  can('admin','secretaria');const b=await readBody(req,4000);
  const before=await DB.prepare('SELECT * FROM people WHERE id=?').bind(String(b.id)).first<Row>();if(!before)fail('Cadastro não encontrado.',404);
  const p=isLegacyPerson(before)?personLoose(b.dados,today):person({...b.dados,cpf:before.cpf},'',today);
  await DB.batch([DB.prepare('UPDATE people SET full_name=?,birth_date=?,email=?,phone=?,cep=?,street=?,number=?,complement=?,district=?,city=?,state=?,updated_at=? WHERE id=?').bind(p.full_name,p.birth_date,p.email,p.phone,p.cep,p.street,p.number,p.complement,p.district,p.city,p.state,now,before.id),
   audit(DB,req,staff,'editar_cadastro','person',before.id,{antes:masked(before),depois:masked(p)})]);
  return json({ok:true});
 }

 if(path==='admin/turmas'&&GET){
  const classes=(await DB.prepare("SELECT c.*,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=c.id AND e.status<>'cancelada') AS taken FROM classes c ORDER BY c.starts_on DESC,c.name").all<Row>()).results;
  const plans=(await DB.prepare("SELECT p.*,(SELECT COUNT(*) FROM enrollments e WHERE e.plan_id=p.id) AS used FROM plans p ORDER BY p.created_at").all<Row>()).results;
  return json({turmas:classes.map(c=>({...c,planos:plans.filter(p=>p.class_id===c.id).map(p=>({...p,due_days:intList(p.due_days),methods:intList(p.methods).filter(m=>METHODS.includes(String(m)))}))}))});
 }
 if(path==='admin/turmas'&&POST){
  can('admin','secretaria');const b=await readBody(req,4000);
  const sheetCode=String(b.codigo_planilha??'').trim().toUpperCase();if(!/^[A-Z0-9]{0,20}$/.test(sheetCode))fail('O código na planilha de alunos usa só letras e números, como BSET27.');
  // Curso do site a que a turma pertence: o botão "Matricule-se" desse curso abre a matrícula já nas turmas dele.
  const courseId=String(b.curso_site??'').trim().toLowerCase();if(!/^[a-z0-9-]{0,40}$/.test(courseId))fail('Curso do site inválido.');
  const v={name:text(b.nome,3,120),exam:text(b.concurso,2,80),unit:text(b.unidade,2,80),shift:text(b.turno,2,40),sheet_code:sheetCode,course_id:courseId,schedule:text(b.horario,2,120),starts_on:b.inicio,ends_on:b.fim,seats:Number.isInteger(b.vagas)&&b.vagas>=0&&b.vagas<=2000?b.vagas:null,public:b.site===true?1:0,status:String(b.situacao||'aberta')};
  if(!v.name||!v.exam||!v.unit||!v.shift||!v.schedule)fail('Preencha nome, concurso, unidade, turno e horário.');
  if(!isDate(v.starts_on)||!isDate(v.ends_on)||v.ends_on<v.starts_on)fail('Confira as datas de início e fim.');
  if(v.seats===null)fail('Informe o número de vagas (0 para sem limite).');if(!CLASS_STATUS.includes(v.status))fail('Situação inválida.');
  const id=b.id?String(b.id):uuid(),before=b.id?await DB.prepare('SELECT * FROM classes WHERE id=?').bind(id).first<Row>():null;
  if(b.id&&!before)fail('Turma não encontrada.',404);
  await DB.batch([before
   ?DB.prepare('UPDATE classes SET name=?,exam=?,unit=?,shift=?,sheet_code=?,course_id=?,schedule=?,starts_on=?,ends_on=?,seats=?,public=?,status=?,updated_at=? WHERE id=?').bind(v.name,v.exam,v.unit,v.shift,v.sheet_code,v.course_id,v.schedule,v.starts_on,v.ends_on,v.seats,v.public,v.status,now,id)
   :DB.prepare('INSERT INTO classes(id,name,exam,unit,shift,sheet_code,course_id,schedule,starts_on,ends_on,seats,public,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,v.name,v.exam,v.unit,v.shift,v.sheet_code,v.course_id,v.schedule,v.starts_on,v.ends_on,v.seats,v.public,v.status,now,now),
   audit(DB,req,staff,before?'editar_turma':'criar_turma','class',id,{antes:before,depois:v})]);
  return json({ok:true,id});
 }
 if(path==='admin/planos'&&POST){
  can('admin','secretaria');const b=await readBody(req,4000);
  const days:unknown[]=Array.isArray(b.dias_vencimento)?[...new Set(b.dias_vencimento as unknown[])].sort((x,y)=>Number(x)-Number(y)):[],methods:unknown[]=Array.isArray(b.formas)?[...new Set(b.formas as unknown[])]:[];
  // Plano: valor à vista (base do Pix, dividido sem juros, e do cartão, com a taxa por parcela), dias de vencimento do Pix e formas aceitas.
  // O número de parcelas do Pix vem da data de término da turma; não existe mais taxa de matrícula.
  const v={class_id:String(b.turma||''),name:text(b.nome,2,80),cash_cents:cents(b.valor_a_vista),due_days:JSON.stringify(days),methods:JSON.stringify(methods),active:b.ativo===false?0:1};
  if(!v.name)fail('Dê um nome ao plano.');if(!v.cash_cents)fail('Informe o valor à vista do curso.');
  if(!methods.length||methods.some(m=>!METHODS.includes(String(m))))fail('Escolha as formas de pagamento.');
  if(methods.includes('pix')&&(!days.length||days.some(d=>!Number.isInteger(d)||(d as number)<1||(d as number)>28)))fail('Escolha os dias de vencimento do Pix, entre 1 e 28.');
  // Cartão: até quantas vezes e a taxa de juros por parcela a mais (%, compostos; 0 = sem juros).
  const cardMax=b.cartao_max===undefined?12:Number.isInteger(b.cartao_max)&&b.cartao_max>=1&&b.cartao_max<=12?b.cartao_max:null;
  const rawRate=b.cartao_taxa===undefined||b.cartao_taxa===null||b.cartao_taxa===''?0:typeof b.cartao_taxa==='number'?b.cartao_taxa:Number(String(b.cartao_taxa).replace(',','.'));
  if(cardMax===null)fail('No cartão, escolha de 1 a 12 vezes.');
  if(!Number.isFinite(rawRate)||rawRate<0||rawRate>10)fail('Confira a taxa de juros do cartão (de 0 a 10% por parcela).');
  const card={card_max:cardMax,card_rate_bp:Math.round(rawRate*100)};
  if(!await DB.prepare('SELECT 1 FROM classes WHERE id=?').bind(v.class_id).first())fail('Turma não encontrada.',404);
  const id=b.id?String(b.id):uuid(),before=b.id?await DB.prepare('SELECT p.*,(SELECT COUNT(*) FROM enrollments e WHERE e.plan_id=p.id) AS used FROM plans p WHERE p.id=?').bind(id).first<Row>():null;
  if(b.id&&!before)fail('Plano não encontrado.',404);
  // Plano com matrícula não muda de valor nem de vencimentos: as parcelas já geradas seguem o que foi contratado.
  // A regra do cartão pode mudar: vale para as próximas matrículas.
  if(before&&before.used&&(['class_id','cash_cents','due_days','methods'] as const).some(k=>String(before[k])!==String(v[k])))fail('Este plano já tem matrículas. Para mudar o valor, os vencimentos ou as formas, crie um plano novo e desative este.',409);
  await DB.batch([before
   ?DB.prepare('UPDATE plans SET class_id=?,name=?,cash_cents=?,due_days=?,methods=?,active=?,card_max=?,card_rate_bp=?,updated_at=? WHERE id=?').bind(v.class_id,v.name,v.cash_cents,v.due_days,v.methods,v.active,card.card_max,card.card_rate_bp,now,id)
   :DB.prepare('INSERT INTO plans(id,class_id,name,cash_cents,due_days,methods,active,card_max,card_rate_bp,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,v.class_id,v.name,v.cash_cents,v.due_days,v.methods,v.active,card.card_max,card.card_rate_bp,now,now),
   audit(DB,req,staff,before?'editar_plano':'criar_plano','plan',id,{antes:before,depois:{...v,...card}})]);
  return json({ok:true,id});
 }

 if(path==='admin/financeiro/resumo'&&GET){
  can('admin','financeiro');const month=today.slice(0,7);
  const one=async(sql:string,...a:unknown[])=>(await DB.prepare(sql).bind(...a).first<Row>())||{};
  const toReceive=await one("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM installments WHERE status='aberta' AND due_on>=? AND substr(due_on,1,7)=?",today,month);
  const received=await one("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents FROM payments WHERE status='confirmado' AND substr(paid_on,1,7)=?",month);
  const overdue=await one("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS cents,COUNT(DISTINCT enrollment_id) AS people FROM installments WHERE status='aberta' AND due_on<?",today);
  const aging=(await DB.prepare("SELECT CASE WHEN julianday(?)-julianday(due_on)<=15 THEN 'ate_15' WHEN julianday(?)-julianday(due_on)<=30 THEN 'de_16_a_30' WHEN julianday(?)-julianday(due_on)<=60 THEN 'de_31_a_60' ELSE 'mais_de_60' END AS faixa,COUNT(*) AS n,SUM(amount_cents) AS cents FROM installments WHERE status='aberta' AND due_on<? GROUP BY faixa").bind(today,today,today,today).all<Row>()).results;
  const projection=(await DB.prepare("SELECT substr(due_on,1,7) AS mes,SUM(CASE WHEN status IN ('aberta','paga') THEN amount_cents ELSE 0 END) AS previsto_cents,SUM(CASE WHEN status='paga' THEN amount_cents ELSE 0 END) AS pago_cents,SUM(CASE WHEN status='aberta' THEN amount_cents ELSE 0 END) AS aberto_cents FROM installments WHERE substr(due_on,1,7)>=? GROUP BY mes ORDER BY mes LIMIT 12").bind(month).all<Row>()).results;
  return json({hoje:today,a_receber_mes:toReceive,recebido_mes:received,vencido:overdue,atraso:aging,projecao:projection});
 }
 if(path==='admin/financeiro/parcelas'&&GET){
  can('admin','financeiro');const s=q('situacao'),month=q('mes');if(month&&!isMonth(month))fail('Mês inválido.');
  const where=s==='vencida'?"i.status='aberta' AND i.due_on<?1":s==='aberta'?"i.status='aberta' AND i.due_on>=?1":s?"i.status=?2":'1=1';
  const rows=(await DB.prepare(`SELECT i.id,i.number,i.kind,i.amount_cents,i.due_on,i.status,i.cancel_reason,e.id AS enrollment_id,p.full_name,c.name AS class_name,(SELECT y.paid_on FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado' ORDER BY y.paid_on DESC LIMIT 1) AS paid_on,(SELECT y.method FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado' ORDER BY y.paid_on DESC LIMIT 1) AS paid_method FROM installments i JOIN enrollments e ON e.id=i.enrollment_id JOIN people p ON p.id=e.payer_person_id JOIN classes c ON c.id=e.class_id WHERE ${where} AND (?3='' OR substr(i.due_on,1,7)=?3) AND (?4='' OR e.class_id=?4) ORDER BY i.due_on,p.full_name LIMIT 1000`).bind(today,s,month,q('turma')).all<Row>()).results;
  return json({hoje:today,parcelas:rows.map(r=>({...r,situacao:r.status==='aberta'&&r.due_on<today?'vencida':r.status}))});
 }
 if(path==='admin/financeiro/baixa'&&POST){
  can('admin','financeiro');const b=await readBody(req,2000),id=String(b.parcela||''),amount=cents(b.valor),method=String(b.forma||''),paidOn=b.data,note=text(b.obs??'',0,300);
  if(!amount)fail('Informe o valor recebido.');if(!PAID_WITH.includes(method))fail('Escolha a forma de pagamento.');
  if(!isDate(paidOn)||paidOn>today)fail('Confira a data do pagamento.');if(note===null)fail('Observação inválida.');
  const inst=await DB.prepare('SELECT * FROM installments WHERE id=?').bind(id).first<Row>();if(!inst)fail('Parcela não encontrada.',404);if(inst.status!=='aberta')fail('Esta parcela não está em aberto.',409);
  const r=await DB.batch([
   DB.prepare("INSERT INTO payments(id,installment_id,amount_cents,fee_cents,method,paid_on,status,origin,recorded_by,note,created_at) SELECT ?,?,?,0,?,?,'confirmado','manual',?,?,? WHERE EXISTS(SELECT 1 FROM installments WHERE id=? AND status='aberta')").bind(uuid(),id,amount,method,paidOn,staff.email,note,now,id),
   DB.prepare("UPDATE installments SET status='paga',updated_at=? WHERE id=? AND status='aberta'").bind(now,id),
   // O primeiro pagamento confirma a matrícula: passa a esperar a biometria, ou fica ativa se ela já foi cadastrada.
   DB.prepare("UPDATE enrollments SET status=CASE WHEN (SELECT biometrics_registered FROM students WHERE id=enrollments.student_id)=1 THEN 'ativa' ELSE 'aguardando_biometria' END,updated_at=? WHERE id=? AND status='aguardando_pagamento'").bind(now,inst.enrollment_id),
   audit(DB,req,staff,'baixa_manual','installment',id,{valor_cents:amount,parcela_cents:inst.amount_cents,forma:method,data:paidOn,obs:note})]);
  if(!r[1].meta.changes)fail('Esta parcela não está em aberto.',409);
  // Sempre envia: a planilha de alunos marca a parcela como paga, mesmo quando a situação da matrícula não muda.
  await syncEnrollment(DB,sync,inst.enrollment_id);
  return json({ok:true});
 }
 if(path==='admin/financeiro/cancelar-parcela'&&POST){
  can('admin','financeiro');const b=await readBody(req,2000),id=String(b.parcela||''),reason=text(b.motivo,3,300);if(!reason)fail('Informe o motivo do cancelamento.');
  const r=await DB.batch([DB.prepare("UPDATE installments SET status='cancelada',cancel_reason=?,updated_at=? WHERE id=? AND status='aberta'").bind(reason,now,id),audit(DB,req,staff,'cancelar_parcela','installment',id,{motivo:reason})]);
  if(!r[0].meta.changes)fail('Só parcelas em aberto podem ser canceladas.',409);  return json({ok:true});
 }

 if(path==='admin/equipe'&&GET){
  can('admin');const roles=(await DB.prepare('SELECT email,role FROM staff_roles').all<{email:string;role:Role}>()).results;
  return json({equipe:teamEmails.map(email=>({email,role:roles.find(r=>r.email===email)?.role||'admin'}))});
 }
 if(path==='admin/equipe'&&POST){
  can('admin');const b=await readBody(req,1000),email=String(b.email||'').toLowerCase(),role=String(b.perfil||'') as Role;
  if(!teamEmails.includes(email))fail('Esse e-mail não está na lista autorizada do painel.');if(!ROLES.includes(role))fail('Perfil inválido.');
  const current=(await DB.prepare('SELECT email,role FROM staff_roles').all<{email:string;role:Role}>()).results;
  const admins=teamEmails.filter(e=>(e===email?role:current.find(r=>r.email===e)?.role||'admin')==='admin');if(!admins.length)fail('O painel precisa de pelo menos um administrador.');
  await DB.batch([DB.prepare('INSERT INTO staff_roles(email,role,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(email,role,now,staff.email),audit(DB,req,staff,'mudar_perfil','staff',email,{perfil:role})]);
  return json({ok:true});
 }
 if(path==='admin/registro'&&GET){
  can('admin');const limit=Math.min(Math.max(Number(q('limite'))||200,1),500);
  const rows=(await DB.prepare("SELECT at,actor,role,action,entity,entity_id,detail FROM audit_log WHERE (?1='' OR entity=?1) AND (?2='' OR entity_id=?2) ORDER BY at DESC LIMIT ?3").bind(q('entidade'),q('id'),limit).all<Row>()).results;
  return json({registro:rows.map(r=>({...r,detail:JSON.parse(r.detail)}))});
 }
 return null;
}
