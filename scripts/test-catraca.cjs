// API da ponte da catraca: roda app/catraca.ts com node:sqlite em memória e as migrações de drizzle/.
/* eslint-disable @typescript-eslint/no-require-imports -- script CommonJS executado direto pelo Node, como os demais testes */
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{stripTypeScriptTypes}=require('node:module');
const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}});
const DB={prepare:statement,async batch(list){db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
const todaySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const src=stripTypeScriptTypes(fs.readFileSync('app/catraca.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''));
const {catracaApi,catracaPainel,normalizarCodigo}=new Function('todaySP',src+';return {catracaApi,catracaPainel,normalizarCodigo}')(todaySP);

const TOKEN='token-de-teste-com-mais-de-24-chars';
const env={DB,CATRACA_TOKEN:TOKEN,CATRACA_TOLERANCIA_DIAS:'5'};
const call=async(path,method='GET',data,token=TOKEN,e=env)=>{
 const req=new Request('https://getepe.test/api/'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 try{return await catracaApi(req,path,e)}catch(err){return Response.json({error:err.message},{status:err.status||500})}
};
const ok=async(r,status=200)=>{const t=await r.text();assert.equal(r.status,status,t);return JSON.parse(t)};
const dia=n=>{const d=new Date(todaySP()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const now=new Date().toISOString();

// Alunos: em dia, atrasado além da tolerância, atrasado dentro da tolerância, matrícula não ativa, inativo, sem código, código repetido.
function aluno(id,nome,{codigo,legado=null,status='ativo',matricula='ativa',vencida=null}){
 db.prepare('INSERT INTO people(id,full_name,cpf,birth_date,email,phone,cep,street,number,district,city,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('p'+id,nome,'cpf'+id,'2000-01-01','a@x.test','1','0','r','1','b','c','SP',now,now);
 db.prepare('INSERT INTO students(id,person_id,status,access_code,legacy_code,created_at) VALUES(?,?,?,?,?,?)').run('s'+id,'p'+id,status,codigo,legado,now);
 db.prepare("INSERT INTO enrollments(id,student_id,class_id,plan_id,payer_person_id,status,due_day,payment_method,submitted,created_at,updated_at) VALUES(?,?,?,?,?,?,10,'pix','{}',?,?)").run('e'+id,'s'+id,'t','pl','p'+id,matricula,now,now);
 if(vencida!==null)db.prepare("INSERT INTO installments(id,enrollment_id,number,kind,amount_cents,due_on,status,created_at,updated_at) VALUES(?,?,1,'mensalidade',1000,?,'aberta',?,?)").run('i'+id,'e'+id,dia(vencida),now,now);
}
aluno(1,'Maria da Silva Souza',{codigo:'1042',vencida:10});
aluno(2,'João Lima',{codigo:'1043',vencida:-6});
aluno(3,'Ana Paula Reis',{codigo:'1044',vencida:-3});
aluno(4,'Bruno Alves',{codigo:'1045',matricula:'aguardando_biometria'});
aluno(5,'Carla Dias',{codigo:'1046',status:'inativo'});
aluno(6,'Sem Código',{codigo:null});
aluno(7,'Legado Secullum',{codigo:'',legado:'000777'});
aluno(8,'Repetido Um',{codigo:'2000'});
aluno(9,'Repetido Dois',{codigo:'02000'});

async function run(){
 // Autenticação: sem token, token errado, servidor sem token configurado.
 assert.equal((await call('catraca/liberados','GET',undefined,'')).status,401);
 assert.equal((await call('catraca/liberados','GET',undefined,'errado')).status,401);
 assert.equal((await call('catraca/liberados','GET',undefined,TOKEN,{DB})).status,503);
 assert.equal(await catracaApi(new Request('https://getepe.test/api/content'),'content',env),null,'não é rota da catraca');

 assert.equal(normalizarCodigo('00001042'),'1042');assert.equal(normalizarCodigo('0'),'0');assert.equal(normalizarCodigo('12a'),'');

 const lista=await ok(await call('catraca/liberados'));
 const por=Object.fromEntries(lista.pessoas.map(p=>[p.codigo,p]));
 assert.deepEqual(por['1042'],{codigo:'1042',nome:'MARIA SOUZA',liberado:true,mensagem:''});
 assert.equal(por['1043'].mensagem,'PROCURE A SECRETARIA','6 dias de atraso > 5 de tolerância');
 assert.equal(por['1044'].liberado,true,'3 dias de atraso dentro da tolerância');
 assert.equal(por['1045'].mensagem,'MATRICULA INATIVA');
 assert.equal(por['1046'].mensagem,'MATRICULA INATIVA');
 assert.equal(por['777'].liberado,true,'usa o código legado do Secullum, sem zeros');
 assert.equal(por['2000'].mensagem,'CODIGO DUPLICADO');
 assert.equal(lista.pessoas.filter(p=>p.codigo==='2000').length,2);
 assert.equal(lista.pessoas.length,8,'aluno sem código fica de fora');
 assert.equal(por['1043'].nome,'JOAO LIMA','sem acento');

 // Eventos: grava, liga ao aluno, ignora repetidos e descarta inválidos.
 const ev={id:'11111111-aaaa',codigo:'00001042',dataHora:'2026-11-16T07:42:11-03:00',resultado:'liberado',motivo:'',equipamento:1};
 const giro={...ev,id:'22222222-bbbb',codigo:'',resultado:'giro'};
 const r1=await ok(await call('catraca/eventos','POST',{eventos:[ev,giro,{...ev,id:'x'},{...ev,id:'33333333-cccc',resultado:'hackeado'},{...ev,id:'44444444-dddd',codigo:''}]}));
 assert.deepEqual(r1,{recebidos:2,descartados:3});
 await ok(await call('catraca/eventos','POST',{eventos:[ev]}));
 const linhas=db.prepare('SELECT * FROM catraca_acessos ORDER BY id').all();
 assert.equal(linhas.length,2,'reenvio não duplica');
 assert.equal(linhas[0].student_id,'s1');assert.equal(linhas[0].codigo,'1042');assert.equal(linhas[1].student_id,null);
 assert.equal((await call('catraca/eventos','POST',{eventos:'x'})).status,400);
 assert.equal((await call('catraca/eventos','POST',{eventos:Array(501).fill(ev)})).status,400);

 // Status da ponte.
 await ok(await call('catraca/status','POST',{equipamento:1,versao:'0.1.0',catracaConectada:true,ultimaLista:lista.geradoEm,eventosPendentes:3}));
 await ok(await call('catraca/status','POST',{equipamento:1,versao:'0.1.0',catracaConectada:false,ultimaLista:null,eventosPendentes:0}));
 const painel=await catracaPainel(DB);
 assert.equal(painel.pontes.length,1);assert.equal(painel.pontes[0].conectada,0);
 assert.equal(painel.acessos[0].full_name,null);assert.equal(painel.acessos.find(a=>a.codigo==='1042').full_name,'Maria da Silva Souza');

 assert.equal((await call('catraca/nada')).status,404);

 // Painel: número da catraca na ficha do aluno (app/enrollment.ts).
 const enr=new Function(stripTypeScriptTypes(fs.readFileSync('app/enrollment.ts','utf8').replace(/export /g,''))+';return {enrollmentAdmin}')();
 const adm=async(path,data,role='secretaria')=>{const req=new Request('https://getepe.test/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:data?JSON.stringify(data):undefined});
  try{return await enr.enrollmentAdmin(req,path.split('?')[0],DB,{email:role+'@x.test',role},[])}catch(err){return Response.json({error:err.message},{status:err.status||500})}};
 const g1=await ok(await adm('admin/alunos/catraca',{id:'s6'}));
 assert.equal(g1.numero,'2001','próximo depois do maior número já usado (02000)');
 assert.equal((await ok(await adm('admin/alunos/ficha?id=s6'))).aluno.catraca_numero,'2001');
 const fichaLegado=(await ok(await adm('admin/alunos/ficha?id=s7'))).aluno;
 assert.equal(fichaLegado.catraca_numero,'777');assert.equal(fichaLegado.catraca_legado,true);
 const dup=await adm('admin/alunos/catraca',{id:'s6',numero:'0001042'});assert.equal(dup.status,409);assert.match((await dup.json()).error,/Maria da Silva Souza/);
 assert.equal((await adm('admin/alunos/catraca',{id:'s6',numero:'12a'})).status,400);
 assert.equal((await adm('admin/alunos/catraca',{id:'s6',numero:'5555'},'financeiro')).status,403);
 assert.equal((await ok(await adm('admin/alunos/catraca',{id:'s6',numero:'05555'}))).numero,'5555');
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='numero_catraca'").get().n,2);
 assert.ok((await ok(await call('catraca/liberados'))).pessoas.some(p=>p.codigo==='5555'),'número novo entra na lista da catraca');
 console.log('Catraca: ok');
}
run().catch(e=>{console.error(e);process.exit(1)});
