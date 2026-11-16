// Matrícula pelo site e financeiro (fase 1).
// Sem imports: route.ts chama estas funções com o banco, e os testes (scripts/test-matricula.cjs) carregam o arquivo do mesmo jeito.
// Ainda não há integração com cobrança nem com assinatura: as parcelas nascem em aberto e a baixa é manual no painel.

export type Role='admin'|'secretaria'|'financeiro'|'consulta';
export type Staff={email:string;role:Role};
// Linhas do D1 e corpos JSON já validados campo a campo antes do uso.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
type PlanRow={id:string;class_id:string;name:string;enrollment_fee_cents:number;enrollment_fee_due_days:number;installment_count:number;installment_cents:number;first_due_month:string;due_days:string;methods:string;active:number};
type PersonIn={full_name:string;cpf:string;birth_date:string;email:string;phone:string;cep:string;street:string;number:string;complement:string;district:string;city:string;state:string};

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
  const e=await DB.prepare('SELECT e.id,e.status,e.created_at,e.contract_signed_at,e.payment_method,c.name AS class_name,c.seats,c.shift,c.sheet_code,p.full_name,pl.name AS plan_name,pl.enrollment_fee_cents+pl.installment_count*pl.installment_cents AS total_cents FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE e.id=?').bind(id).first<Row>();
  if(!e)return;
  let alunos:Row|undefined;
  if(e.contract_signed_at){
   const parcels=(await DB.prepare("SELECT i.due_on,i.amount_cents,(SELECT COALESCE(SUM(y.amount_cents),0) FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado') AS paid_cents,(SELECT y.method FROM payments y WHERE y.installment_id=i.id AND y.status='confirmado' ORDER BY y.paid_on DESC LIMIT 1) AS paid_method FROM installments i WHERE i.enrollment_id=? AND i.status<>'cancelada' ORDER BY i.due_on,i.number").bind(e.id).all<Row>()).results;
   alunos={nome:String(e.full_name).toUpperCase(),matriculado_em:spDate(e.created_at),escola:e.sheet_code||'',turma:sheetShift(e.shift),situacao:e.status==='cancelada'?'DESLIGADO':'ATIVO',total_cents:e.total_cents,
    parcelas:parcels.map(p=>({vence:p.due_on,valor_cents:p.amount_cents,pago_cents:p.paid_cents,forma:SHEET_METHOD[p.paid_method||e.payment_method]||''}))};
  }
  await sync({codigo:enrollmentCode(e.id),recebida_em:e.created_at,turma:e.class_name,plano:e.plan_name,forma:METHOD_LABEL[e.payment_method]||e.payment_method,valor_cents:e.total_cents,vagas:e.seats,situacao:STATUS_LABEL[e.status]||e.status,contrato_assinado_em:e.contract_signed_at?spDate(e.contract_signed_at):'',atualizado_em:nowIso(),...(alunos?{alunos}:{})});
 }catch(err){console.error('Falha ao preparar envio da matrícula para a planilha',(err as Error)?.name)}
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

// Parcelas do plano: taxa de matrícula (parcela 0) e as mensalidades no dia escolhido.
// As mensalidades começam no mês definido no plano; se esse vencimento já passou, começam no próximo dia escolhido.
export function schedule(plan:PlanRow,dueDay:number,today:string){
 const rows:{number:number;kind:string;amount_cents:number;due_on:string}[]=[];
 if(plan.enrollment_fee_cents>0)rows.push({number:0,kind:'matricula',amount_cents:plan.enrollment_fee_cents,due_on:addDays(today,plan.enrollment_fee_due_days)});
 let [y,m]=plan.first_due_month.split('-').map(Number);const [ty,tm,td]=today.split('-').map(Number);
 if(y*12+m<ty*12+tm||(y*12+m===ty*12+tm&&dueDay<=td)){y=ty;m=dueDay<=td?tm+1:tm}
 for(let i=1;i<=plan.installment_count;i++){if(m>12){m-=12;y++}rows.push({number:i,kind:'mensalidade',amount_cents:plan.installment_cents,due_on:`${y}-${pad(m)}-${pad(dueDay)}`});m++}
 return rows;
}

function person(raw:unknown,label:string,today:string):PersonIn{
 if(!raw||typeof raw!=='object')fail(`Preencha os dados ${label}.`);const r=raw as Row;
 const full_name=text(r.nome,5,120);if(!full_name||full_name.split(' ').length<2)fail(`Digite o nome completo ${label}.`);
 const cpf=validCpf(String(r.cpf||''));if(!cpf)fail(`Confira o CPF ${label}.`);
 const birth_date=String(r.nascimento||'');if(!isDate(birth_date)||birth_date>today||age(birth_date,today)>110)fail(`Confira a data de nascimento ${label}.`);
 const email=String(r.email||'').trim().toLowerCase();if(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email))fail(`Confira o e-mail ${label}.`);
 const phone=String(r.celular||'').replace(/\D/g,'');if(phone.length<10||phone.length>11)fail(`Confira o celular com DDD ${label}.`);
 const cep=String(r.cep||'').replace(/\D/g,'');if(cep.length!==8)fail(`Confira o CEP ${label}.`);
 const street=text(r.logradouro,3,150),number=text(r.numero,1,20),complement=text(r.complemento??'',0,80),district=text(r.bairro,2,80),city=text(r.cidade,2,80),state=String(r.uf||'').toUpperCase();
 if(!street||!number||complement===null||!district||!city||!UF.includes(state))fail(`Confira o endereço ${label}.`);
 return {full_name,cpf,birth_date,email,phone,cep,street,number,complement,district,city,state};
}
const masked=(p:PersonIn|Row)=>({...p,cpf:maskCpf(String(p.cpf||''))});

function audit(DB:D1Database,req:Request,staff:Staff|null,action:string,entity:string,entityId:string,detail:unknown){
 return DB.prepare('INSERT INTO audit_log(id,at,actor,role,action,entity,entity_id,detail,ip) VALUES(?,?,?,?,?,?,?,?,?)').bind(uuid(),nowIso(),staff?.email||'site',staff?.role||'publico',action,entity,entityId,JSON.stringify(detail),ip(req));
}
async function rateLimit(DB:D1Database,req:Request,scope:string,max:number){const hour=Math.floor(Date.now()/3600000);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope+':'+(ip(req)||'local')+':'+hour)))).map(x=>x.toString(16).padStart(2,'0')).join('');const r=await DB.prepare('INSERT INTO limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(hash,Date.now()+7200000).first<{count:number}>();if((r?.count||0)>max)fail('Muitas tentativas. Tente novamente mais tarde.',429)}

async function publicPlan(DB:D1Database,planId:unknown,classId?:unknown){
 const plan=await DB.prepare("SELECT p.* FROM plans p JOIN classes c ON c.id=p.class_id WHERE p.id=? AND p.active=1 AND c.public=1 AND c.status='aberta'").bind(String(planId||'')).first<PlanRow>();
 if(!plan||(classId!==undefined&&plan.class_id!==classId))fail('Escolha uma turma e um plano disponíveis.');
 return plan;
}
const total=(rows:{amount_cents:number}[])=>rows.reduce((s,r)=>s+r.amount_cents,0);

// Rotas públicas: /api/matricula/opcoes, /api/matricula/simular e /api/matricula.
export async function enrollmentPublic(req:Request,path:string,DB:D1Database,sync?:SheetSync):Promise<Response|null>{
 if(path==='matricula/opcoes'&&req.method==='GET'){
  const classes=(await DB.prepare("SELECT c.id,c.name,c.exam,c.unit,c.shift,c.course_id,c.schedule,c.starts_on,c.ends_on,c.seats,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=c.id AND e.status<>'cancelada') AS taken FROM classes c WHERE c.public=1 AND c.status='aberta' ORDER BY c.starts_on,c.name").all<Row>()).results;
  const plans=(await DB.prepare("SELECT p.id,p.class_id,p.name,p.enrollment_fee_cents,p.installment_count,p.installment_cents,p.due_days,p.methods FROM plans p JOIN classes c ON c.id=p.class_id WHERE p.active=1 AND c.public=1 AND c.status='aberta' ORDER BY p.installment_count").all<Row>()).results;
  return json({turmas:classes.map(({taken,seats,...c})=>({...c,vagas:!seats||taken<seats,planos:plans.filter(p=>p.class_id===c.id).map(p=>({...p,due_days:intList(p.due_days),methods:intList(p.methods).filter(m=>METHODS.includes(String(m)))}))})).filter(c=>c.planos.length)});
 }
 if(path==='matricula/simular'&&req.method==='POST'){
  const b=await readBody(req,1000),plan=await publicPlan(DB,b.plano),day=Number(b.vencimento);
  if(!intList(plan.due_days).includes(day))fail('Escolha um dia de vencimento.');
  const rows=schedule(plan,day,todaySP());return json({parcelas:rows,total_cents:total(rows)});
 }
 if(path==='matricula'&&req.method==='POST'){
  const b=await readBody(req,8000);if(b.website)return json({ok:true});
  const today=todaySP(),plan=await publicPlan(DB,b.plano,b.turma);
  const day=Number(b.vencimento);if(!intList(plan.due_days).includes(day))fail('Escolha um dia de vencimento.');
  const method=String(b.forma||'');if(!METHODS.includes(method)||!intList(plan.methods).includes(method))fail('Escolha a forma de pagamento.');
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
  const cls=await DB.prepare("SELECT seats,(SELECT COUNT(*) FROM enrollments e WHERE e.class_id=classes.id AND e.status<>'cancelada') AS taken FROM classes WHERE id=?").bind(plan.class_id).first<{seats:number;taken:number}>();
  if(cls&&cls.seats&&cls.taken>=cls.seats)fail('As vagas desta turma acabaram. Fale com a equipe.',409);
  await rateLimit(DB,req,'matricula',5);
  const now=nowIso(),insertPerson=(p:PersonIn)=>DB.prepare('INSERT OR IGNORE INTO people(id,full_name,cpf,birth_date,email,phone,cep,street,number,complement,district,city,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(uuid(),p.full_name,p.cpf,p.birth_date,p.email,p.phone,p.cep,p.street,p.number,p.complement,p.district,p.city,p.state,now,now);
  // Quem já está cadastrado não tem a ficha alterada pelo formulário público: os dados enviados ficam na matrícula para a equipe revisar.
  const inserted=await DB.batch([insertPerson(student),...(guardian?[insertPerson(guardian)]:[])]);
  const needsReview=inserted.some(r=>!r.meta.changes)?1:0;
  const idOf=async(cpf:string)=>(await DB.prepare('SELECT id FROM people WHERE cpf=?').bind(cpf).first<{id:string}>())!.id;
  const studentPerson=await idOf(student.cpf),guardianPerson=guardian?await idOf(guardian.cpf):null;
  await DB.prepare("INSERT OR IGNORE INTO students(id,person_id,status,biometrics_registered,created_at) VALUES(?,?,'ativo',0,?)").bind(uuid(),studentPerson,now).run();
  const studentId=(await DB.prepare('SELECT id FROM students WHERE person_id=?').bind(studentPerson).first<{id:string}>())!.id;
  // Envio repetido para a mesma turma não cria outra matrícula. A resposta é a mesma, para não revelar quem já está matriculado.
  const message='Matrícula recebida. A equipe vai enviar o contrato e a primeira cobrança para o e-mail informado.';
  if(await DB.prepare("SELECT 1 FROM enrollments WHERE student_id=? AND class_id=? AND status<>'cancelada'").bind(studentId,plan.class_id).first())return json({ok:true,message});
  const id=uuid(),rows=schedule(plan,day,today),payer=guardianPerson||studentPerson;
  const submitted={aluno:student,responsavel:guardian?{...guardian,parentesco:relationship}:null,menor:minor,forma:method,vencimento:day,recebida_em:now};
  const statements=[
   DB.prepare("INSERT INTO enrollments(id,student_id,class_id,plan_id,payer_person_id,status,due_day,payment_method,origin,submitted,needs_review,created_at,updated_at) VALUES(?,?,?,?,?,'aguardando_assinatura',?,?,'site',?,?,?,?)").bind(id,studentId,plan.class_id,plan.id,payer,day,method,JSON.stringify(submitted),needsReview,now,now),
   ...(guardianPerson?[DB.prepare('INSERT OR IGNORE INTO student_guardians(id,student_id,person_id,kind,relationship,created_at) VALUES(?,?,?,?,?,?)').bind(uuid(),studentId,guardianPerson,minor?'legal_financeiro':'financeiro',relationship,now)]:[]),
   ...[...new Set([studentPerson,payer])].map(p=>DB.prepare("INSERT INTO consents(id,person_id,enrollment_id,document,version,accepted_at,ip) VALUES(?,?,?,'politica_privacidade_e_termos_matricula',?,?,?)").bind(uuid(),p,id,CONSENT_VERSION,now,ip(req))),
   ...rows.map(r=>DB.prepare("INSERT INTO installments(id,enrollment_id,number,kind,amount_cents,due_on,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'aberta',?,?)").bind(uuid(),id,r.number,r.kind,r.amount_cents,r.due_on,now,now)),
   audit(DB,req,null,'matricula_recebida','enrollment',id,{turma:plan.class_id,plano:plan.id,parcelas:rows.length,total_cents:total(rows),revisar:!!needsReview}),
  ];
  await DB.batch(statements);
  await syncEnrollment(DB,sync,id);
  return json({ok:true,message});
 }
 return null;
}

export async function staffRole(DB:D1Database,email:string):Promise<Role>{const r=await DB.prepare('SELECT role FROM staff_roles WHERE email=?').bind(email.toLowerCase()).first<{role:Role}>();return r&&ROLES.includes(r.role)?r.role:'admin'}

// Rotas do painel: matrículas, turmas e planos, financeiro, equipe e registro. Cada rota confere o perfil.
export async function enrollmentAdmin(req:Request,path:string,DB:D1Database,staff:Staff,teamEmails:string[],sync?:SheetSync):Promise<Response|null>{
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
   revisar_cadastro:await n("SELECT COUNT(*) AS n FROM enrollments WHERE needs_review=1 AND status<>'cancelada'")};
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
  return json({matricula:{...enrollment,codigo:enrollmentCode(e.id)},aluno:await personOf(e.person_id),pagador:await personOf(e.payer_person_id),responsaveis:guardians,
   enviado:e.needs_review?JSON.parse(submitted):null,
   financeiro:['admin','financeiro'].includes(staff.role)?{parcelas:parcels.map(p=>({...p,payments:JSON.parse(p.payments||'[]')}))}:{em_dia:!overdue,vencidas:overdue}});
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
  const enrollments=(await DB.prepare('SELECT e.id,e.status,e.status_reason,e.created_at,e.contract_signed_at,e.due_day,e.payment_method,e.origin,c.name AS class_name,c.shift,c.starts_on,c.ends_on,pl.name AS plan_name,pl.enrollment_fee_cents+pl.installment_count*pl.installment_cents AS total_cents FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN plans pl ON pl.id=e.plan_id WHERE e.student_id=? ORDER BY e.created_at DESC').bind(s.id).all<Row>()).results;
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
   const max=await DB.prepare(`SELECT MAX(n) AS n FROM (SELECT CAST(ltrim(access_code,'0') AS INTEGER) AS n FROM students WHERE access_code GLOB '[0-9]*' UNION ALL SELECT CAST(ltrim(legacy_code,'0') AS INTEGER) FROM students WHERE legacy_code GLOB '[0-9]*')`).first<{n:number|null}>();
   numero=String(Math.max(1000,max?.n||0)+1);
  }
  const dono=await DB.prepare(`SELECT p.full_name FROM students s JOIN people p ON p.id=s.person_id WHERE s.id<>? AND ${CODE.replace(/access_code|legacy_code/g,m=>'s.'+m)}=?`).bind(s.id,numero).first<{full_name:string}>();
  if(dono)fail('O número '+numero+' já é de '+dono.full_name+'.',409);
  await DB.batch([DB.prepare('UPDATE students SET access_code=? WHERE id=?').bind(numero,s.id),audit(DB,req,staff,'numero_catraca','student',s.id,{antes:s.access_code||s.legacy_code||null,depois:numero})]);
  return json({ok:true,numero});
 }
 if(path==='admin/pessoas/editar'&&POST){
  can('admin','secretaria');const b=await readBody(req,4000);
  const before=await DB.prepare('SELECT * FROM people WHERE id=?').bind(String(b.id)).first<Row>();if(!before)fail('Cadastro não encontrado.',404);
  const p=person({...b.dados,cpf:before.cpf},'',today);
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
  const v={class_id:String(b.turma||''),name:text(b.nome,2,80),enrollment_fee_cents:cents(b.taxa_matricula),enrollment_fee_due_days:Number.isInteger(b.prazo_taxa)&&b.prazo_taxa>=0&&b.prazo_taxa<=60?b.prazo_taxa:null,installment_count:Number.isInteger(b.parcelas)&&b.parcelas>=1&&b.parcelas<=36?b.parcelas:null,installment_cents:cents(b.valor_parcela),first_due_month:b.primeiro_mes,due_days:JSON.stringify(days),methods:JSON.stringify(methods),active:b.ativo===false?0:1};
  if(!v.name)fail('Dê um nome ao plano.');if(v.enrollment_fee_cents===null||v.installment_cents===null||!v.installment_cents)fail('Confira os valores.');
  if(v.enrollment_fee_due_days===null)fail('Confira o prazo da taxa de matrícula.');if(v.installment_count===null)fail('Informe de 1 a 36 parcelas.');
  if(!isMonth(v.first_due_month))fail('Informe o mês da primeira mensalidade.');
  if(!days.length||days.some(d=>!Number.isInteger(d)||(d as number)<1||(d as number)>28))fail('Escolha os dias de vencimento, entre 1 e 28.');
  if(!methods.length||methods.some(m=>!METHODS.includes(String(m))))fail('Escolha as formas de pagamento.');
  if(!await DB.prepare('SELECT 1 FROM classes WHERE id=?').bind(v.class_id).first())fail('Turma não encontrada.',404);
  const id=b.id?String(b.id):uuid(),before=b.id?await DB.prepare('SELECT p.*,(SELECT COUNT(*) FROM enrollments e WHERE e.plan_id=p.id) AS used FROM plans p WHERE p.id=?').bind(id).first<Row>():null;
  if(b.id&&!before)fail('Plano não encontrado.',404);
  // Plano com matrícula não muda de valor: as parcelas já geradas seguem o que foi contratado.
  if(before&&before.used&&(['class_id','enrollment_fee_cents','enrollment_fee_due_days','installment_count','installment_cents','first_due_month','due_days','methods'] as const).some(k=>String(before[k])!==String(v[k])))fail('Este plano já tem matrículas. Para mudar valores, parcelas ou datas, crie um plano novo e desative este.',409);
  await DB.batch([before
   ?DB.prepare('UPDATE plans SET class_id=?,name=?,enrollment_fee_cents=?,enrollment_fee_due_days=?,installment_count=?,installment_cents=?,first_due_month=?,due_days=?,methods=?,active=?,updated_at=? WHERE id=?').bind(v.class_id,v.name,v.enrollment_fee_cents,v.enrollment_fee_due_days,v.installment_count,v.installment_cents,v.first_due_month,v.due_days,v.methods,v.active,now,id)
   :DB.prepare('INSERT INTO plans(id,class_id,name,enrollment_fee_cents,enrollment_fee_due_days,installment_count,installment_cents,first_due_month,due_days,methods,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,v.class_id,v.name,v.enrollment_fee_cents,v.enrollment_fee_due_days,v.installment_count,v.installment_cents,v.first_due_month,v.due_days,v.methods,v.active,now,now),
   audit(DB,req,staff,before?'editar_plano':'criar_plano','plan',id,{antes:before,depois:v})]);
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
