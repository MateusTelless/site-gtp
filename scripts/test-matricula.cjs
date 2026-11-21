// Matrícula pelo site e financeiro: roda o código real da API com node:sqlite em memória e as migrações de drizzle/.
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{stripTypeScriptTypes}=require('node:module');
const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){if(/^SELECT/i.test(sql))return {results:db.prepare(sql).all(...args)};const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}});
const DB={prepare:statement,async batch(list){db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
const strip=f=>stripTypeScriptTypes(fs.readFileSync(f,'utf8').replace(/export /g,''));
const enrollment=new Function(strip('app/enrollment.ts')+';return {enrollmentPublic,enrollmentAdmin,staffRole,docusealWebhook,pixSchedule,pixMax,validCpf,todaySP,cardOptions,nameKey,nameHash}')();
const backups=new Function(strip('app/backups.ts')+';return {makeBackup,listBackups,verifyBackup,recoverBackup,exportBackup}')();
let user=null;const team='owner@example.test,fin@example.test,sec@example.test,ver@example.test';const apiEnv={DB,BUCKET:{files:new Map(),async put(k,v,o){this.files.set(k,{bytes:v,type:o?.httpMetadata?.contentType,meta:o?.customMetadata})},async get(k){const x=this.files.get(k);return x?{body:x.bytes,httpMetadata:{contentType:x.type},customMetadata:x.meta}:null},async head(k){const x=this.files.get(k);return x?{customMetadata:x.meta}:null},async list(){return {objects:[],truncated:false}}},ADMIN_EMAILS:team};
let source=fs.readFileSync('app/api/[...path]/route.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export \{safe as GET,safe as POST,safe as PUT,safe as DELETE\};/,'');
const handle=new Function('env','seed','pageDefaults','getAdminIdentity','validateVisual','validateCampaigns','makeBackup','listBackups','verifyBackup','recoverBackup','exportBackup','enrollmentPublic','enrollmentAdmin','staffRole','makeDocVerifier','makeContractApi','webhookTokenOk','docusealWebhook',stripTypeScriptTypes(source)+'\nreturn safe;')(apiEnv,JSON.parse(fs.readFileSync('seed.json','utf8')),JSON.parse(fs.readFileSync('page-defaults.json','utf8')),async()=>user,x=>x,()=>{},...['makeBackup','listBackups','verifyBackup','recoverBackup','exportBackup'].map(k=>backups[k]),enrollment.enrollmentPublic,enrollment.enrollmentAdmin,enrollment.staffRole,()=>undefined,()=>globalThis.__contracts,async(t,k)=>!!k&&k.length>=24&&t===k,enrollment.docusealWebhook);
const call=(path,method='GET',data,origin='https://getepe.test')=>handle(new Request('https://getepe.test/api/'+path,{method,headers:{...(method!=='GET'?{origin}:{}),'Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:data===undefined?undefined:JSON.stringify(data)}));
const as=email=>{user=email?{userId:email,email,displayName:email}:null};
const ok=async(r,status=200)=>{const text=await r.text();assert.equal(r.status,status,text);return text?JSON.parse(text):{}};
// CPF fictício válido, gerado a partir de 9 dígitos.
function cpf(base){const d=String(base).padStart(9,'0').split('').map(Number);for(const n of [9,10]){let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);d.push((s*10)%11%10)}return d.join('')}
const iso=d=>d.toISOString().slice(0,10),yearsAgo=n=>{const d=new Date();d.setUTCFullYear(d.getUTCFullYear()-n);d.setUTCDate(d.getUTCDate()-2);return iso(d)};
const address={rg:'12.345.678-9',cep:'01504-001',logradouro:'Rua de Teste',numero:'100',complemento:'',bairro:'Centro',cidade:'São Paulo',uf:'SP'};
const adult={nome:'Pessoa Adulta Teste',cpf:cpf(123456780),nascimento:yearsAgo(20),email:'adulto@example.test',celular:'(11) 91234-5678',...address};

async function run(){
 // Regras puras: CPF e calendário de parcelas.
 assert.equal(enrollment.validCpf('111.111.111-11'),'');assert.equal(enrollment.validCpf(cpf(123456780)),cpf(123456780));assert.equal(enrollment.validCpf(cpf(123456780).slice(0,10)+'0')===cpf(123456780),false);
 // Pix: valor à vista dividido sem juros; os centavos que sobram vão na 1ª parcela; as outras no dia escolhido de cada mês seguinte.
 assert.deepEqual(enrollment.pixSchedule(100000,3,10,'2026-11-18').map(r=>[r.number,r.kind,r.amount_cents,r.due_on]),[[1,'mensalidade',33334,'2026-11-18'],[2,'mensalidade',33333,'2026-12-10'],[3,'mensalidade',33333,'2027-01-10']]);
 assert.deepEqual(enrollment.pixSchedule(480000,2,5,'2027-12-01').map(r=>r.due_on),['2027-12-01','2028-01-05'],'virada de ano');
 // Máximo de parcelas: do mês da 1ª parcela até o mês em que o curso termina (novembro a julho = 9x).
 assert.equal(enrollment.pixMax('2026-11-17','2027-07-27'),9);assert.equal(enrollment.pixMax('2026-11-17','2027-06-30'),8,'termina em junho, começa em novembro: até 8x');assert.equal(enrollment.pixMax('2026-12-01','2027-07-27'),8,'1ª parcela no mês seguinte');assert.equal(enrollment.pixMax('2027-08-01','2027-07-27'),1,'curso já terminou');

 // Sem login nada do painel abre; sem turma no site, a matrícula não tem opções.
 as(null);assert.equal((await call('admin/matriculas')).status,401);assert.equal((await call('admin/financeiro/resumo')).status,401);
 assert.deepEqual((await ok(await call('matricula/opcoes'))).turmas,[]);

 // Equipe cadastra turma e plano. Turma fora do site não aparece.
 as('owner@example.test');
 const turma={nome:'EsPCEx 2027 · Manhã',concurso:'EsPCEx',unidade:'São Paulo',turno:'Manhã',horario:'Segunda a sexta, 8h às 12h',inicio:'2027-01-12',fim:'2027-09-12',vagas:2,site:true,situacao:'aberta'};
 assert.equal((await call('admin/turmas','POST',{...turma,fim:'2026-01-01'})).status,400);
 const t1=(await ok(await call('admin/turmas','POST',turma))).id,t2=(await ok(await call('admin/turmas','POST',{...turma,nome:'Turma interna',site:false}))).id;
 const planBody={turma:t1,nome:'EsPCEx 2027',dias_vencimento:[5,10,15],formas:['pix','cartao'],valor_a_vista:480000,cartao_taxa:'1,5'};
 const plusDays=n=>{const d=new Date(enrollment.todaySP()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},notSunday=n=>{let d=plusDays(n);while([0,6].includes(new Date(d+'T12:00:00Z').getUTCDay()))d=plusDays(++n);return d},saturday=()=>{let n=1;while(new Date(plusDays(n)+'T12:00:00Z').getUTCDay()!==6)n++;return plusDays(n)};
 assert.equal((await call('admin/planos','POST',{...planBody,dias_vencimento:[31]})).status,400);assert.equal((await call('admin/planos','POST',{...planBody,formas:['cheque']})).status,400);assert.equal((await call('admin/planos','POST',{...planBody,formas:['pix','boleto']})).status,400,'boleto fora das formas do site');
 const p1=(await ok(await call('admin/planos','POST',planBody))).id,p2=(await ok(await call('admin/planos','POST',{...planBody,turma:t2}))).id;
 as(null);let options=(await ok(await call('matricula/opcoes'))).turmas;assert.equal(options.length,1);assert.equal(options[0].id,t1);assert.deepEqual(options[0].planos[0].due_days,[5,10,15]);assert.ok(!('taken' in options[0])&&!('seats' in options[0]));
 // Cartão: só o valor de cada parcela, nunca o total; números sem acréscimo cadastrado não aparecem.
 const co=options[0].planos[0].cartao;assert.deepEqual(co.map(o=>o.n),[1,2,3,4,5,6,7,8,9,10,11,12],'todas as opções de 1x a 12x');// Mesmos valores da tabela de parcelamento do GETEPE (R$ 4.800 a 1,5% por parcela a mais).
 assert.deepEqual([co[0],co[1],co[2],co[5],co[11]],[{n:1,parcela_cents:480000},{n:2,parcela_cents:243600},{n:3,parcela_cents:164836},{n:6,parcela_cents:86183},{n:12,parcela_cents:47118}]);
 assert.deepEqual(enrollment.cardOptions({cash_cents:480000,card_max:12,card_rate_bp:150,methods:'["cartao"]'}).map(o=>o.total_cents),[480000,487200,494508,501926,509455,517096,524853,532726,540716,548827,557060,565415],'totais da tabela');
 assert.deepEqual(enrollment.cardOptions({cash_cents:480000,card_max:12,card_rate_bp:150,methods:'["cartao"]'}).map(o=>o.parcela_cents),[480000,243600,164836,125481,101891,86183,74979,66591,60080,54883,50642,47118],'parcelas da tabela');
 as('owner@example.test');for(const t of ['11','-1','abc'])assert.equal((await call('admin/planos','POST',{...planBody,cartao_taxa:t})).status,400,'taxa inválida '+t);as(null);assert.ok(!JSON.stringify(options[0].planos[0]).includes('total_cents'));
 const sim=await ok(await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:4,vencimento:10,primeira_parcela:plusDays(2)}));assert.equal(sim.parcelas.length,4);assert.equal(sim.parcelas[0].due_on,plusDays(2),'primeira parcela na data escolhida');assert.equal(sim.total_cents,480000,'Pix: valor à vista sem juros');assert.deepEqual(sim.parcelas.map(r=>r.amount_cents),[120000,120000,120000,120000]);
 // Pix: opções de 1x até o mês em que a turma termina (fim em 12/09/2027); passar disso é recusado; 1x não pede dia de vencimento.
 const pixMaxHoje=enrollment.pixMax(plusDays(0),'2027-09-12'),po=options[0].planos[0].pix;
 assert.deepEqual(po.map(o=>o.n),Array.from({length:pixMaxHoje},(_,i)=>i+1));assert.deepEqual(po[0],{n:1,parcela_cents:480000});
 assert.equal((await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:pixMaxHoje+1,vencimento:10,primeira_parcela:plusDays(0)})).status,400,'Pix além do fim do curso');
 assert.equal((await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:0,vencimento:10,primeira_parcela:plusDays(0)})).status,400,'Pix sem número de parcelas');
 const sim1=await ok(await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:1,primeira_parcela:plusDays(1)}));assert.deepEqual(sim1.parcelas.map(r=>[r.amount_cents,r.due_on]),[[480000,plusDays(1)]]);
 assert.equal((await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:2,primeira_parcela:plusDays(1)})).status,400,'2x sem dia de vencimento');
 assert.equal((await call('matricula/simular','POST',{plano:p2,forma:'pix',parcelas_pix:4,vencimento:10,primeira_parcela:plusDays(0)})).status,400,'plano de turma fora do site');
 const simCard=await ok(await call('matricula/simular','POST',{plano:p1,forma:'cartao',parcelas_cartao:6,visita:notSunday(5)}));assert.deepEqual([simCard.cartao.n,simCard.cartao.parcela_cents],[6,86183]);assert.equal(simCard.parcelas[0].amount_cents,undefined);

 // Validação pública.
 const base={turma:t1,plano:p1,parcelas_pix:4,vencimento:10,primeira_parcela:plusDays(0),forma:'pix',aluno:adult,aceite:true};
 for(const [bad,why] of [[{aluno:{...adult,cpf:'123.456.789-00'}},'CPF'],[{aluno:{...adult,nome:'Ana'}},'nome'],[{aluno:{...adult,rg:'12'}},'RG curto'],[{aluno:{...adult,rg:''}},'sem RG'],[{aluno:{...adult,uf:'XX'}},'UF'],[{aluno:{...adult,nascimento:'2999-01-01'}},'nascimento'],[{aceite:false},'aceite'],[{vencimento:31},'dia'],[{primeira_parcela:plusDays(4)},'primeira parcela em até 3 dias'],[{primeira_parcela:plusDays(-1)},'primeira parcela no passado'],[{forma:'cartao',parcelas_cartao:13,visita:notSunday(2)},'13x não existe'],[{forma:'cartao',parcelas_cartao:6,visita:plusDays(31)},'visita depois de 30 dias'],[{forma:'cartao',parcelas_cartao:6},'sem visita'],[{forma:'cartao',parcelas_cartao:6,visita:saturday()},'sábado não é dia útil'],[{forma:'boleto'},'boleto não é aceito'],[{forma:'dinheiro'},'forma'],[{plano:p2},'plano de outra turma'],[{aluno:{...adult,nome:'<b>Pessoa</b> Teste'}},'HTML']])assert.equal((await call('matricula','POST',{...base,...bad})).status,400,why);
 assert.equal((await call('matricula','POST',base,'https://evil.test')).status,403);
 await ok(await call('matricula','POST',{...base,website:'spam'}));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n,0,'honeypot gravou');

 // Matrícula de adulto: pessoa, aluno, matrícula, aceite, parcelas e registro. Responsável enviado por adulto é ignorado.
 await ok(await call('matricula','POST',{...base,outroPagador:true,responsavel:{...adult,nome:'Outra Pessoa Teste',cpf:cpf(423456780),parentesco:'Tio'}}));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM people').get().n,1,'adulto não tem responsável');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM student_guardians').get().n,0);
 let e=db.prepare('SELECT * FROM enrollments').get();assert.equal(e.status,'aguardando_assinatura');assert.equal(e.needs_review,0);assert.equal(e.class_id,t1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installments WHERE enrollment_id=?').get(e.id).n,4);assert.equal(db.prepare('SELECT due_on FROM installments WHERE enrollment_id=? ORDER BY number LIMIT 1').get(e.id).due_on,plusDays(0));assert.equal(e.first_due_on,plusDays(0));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM consents').get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='matricula_recebida'").get().n,1);assert.equal(db.prepare('SELECT phone FROM people').get().phone,'11912345678');
 // Cartão: uma cobrança com o valor do parcelamento, no dia da visita.
 { const cardStudent={...adult,nome:'Pessoa Cartao Teste',cpf:cpf(623456780),email:'cartao@example.test'},visit=notSunday(3);db.exec('DELETE FROM limits');
  await ok(await call('matricula','POST',{...base,aluno:cardStudent,forma:'cartao',parcelas_cartao:6,visita:visit,vencimento:undefined,primeira_parcela:undefined}));
  const ce=db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(cardStudent.cpf);assert.deepEqual([ce.payment_method,ce.card_installments,ce.card_visit_on,ce.due_day],['cartao',6,visit,0]);
  const ci=db.prepare('SELECT kind,amount_cents,due_on FROM installments WHERE enrollment_id=?').all(ce.id);assert.deepEqual(ci.map(r=>[r.kind,r.amount_cents,r.due_on]),[['cartao',517096,visit]]);
  for(const q of ['DELETE FROM installments WHERE enrollment_id=?','DELETE FROM consents WHERE enrollment_id=?','DELETE FROM audit_log WHERE entity_id=?','DELETE FROM enrollments WHERE id=?'])db.prepare(q).run(ce.id);
  db.prepare('DELETE FROM students WHERE person_id=(SELECT id FROM people WHERE cpf=?)').run(cardStudent.cpf);db.prepare('DELETE FROM people WHERE cpf=?').run(cardStudent.cpf);db.exec('DELETE FROM limits') }
 // Envio repetido não duplica.
 await ok(await call('matricula','POST',base));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n,1);

 // Menor de idade: responsável obrigatório, maior de idade e com outro CPF; ele é o pagador.
 const minor={...adult,nome:'Aluno Menor Teste',cpf:cpf(223456780),nascimento:yearsAgo(15),email:'menor@example.test'},guardian={...adult,nome:'Responsavel Teste Silva',cpf:cpf(323456780),nascimento:yearsAgo(45),email:'resp@example.test',parentesco:'Mãe'};
 assert.equal((await call('matricula','POST',{...base,aluno:minor})).status,400);assert.equal((await call('matricula','POST',{...base,aluno:minor,responsavel:{...guardian,cpf:minor.cpf}})).status,400);
 assert.equal((await call('matricula','POST',{...base,aluno:minor,responsavel:{...guardian,nascimento:yearsAgo(16)}})).status,400);assert.equal((await call('matricula','POST',{...base,aluno:minor,responsavel:{...guardian,parentesco:''}})).status,400);
 await ok(await call('matricula','POST',{...base,aluno:minor,responsavel:guardian}));
 const minorEnrollment=db.prepare('SELECT e.*,p.cpf AS payer_cpf FROM enrollments e JOIN people p ON p.id=e.payer_person_id WHERE e.id<>?').get(e.id);assert.equal(minorEnrollment.payer_cpf,guardian.cpf);
 assert.equal(db.prepare('SELECT kind FROM student_guardians').get().kind,'legal_financeiro');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM consents WHERE enrollment_id=?').get(minorEnrollment.id).n,2);

 // Vagas esgotadas (2 vagas).
 assert.equal((await call('matricula','POST',{...base,aluno:{...adult,cpf:cpf(423456780),nome:'Terceira Pessoa Teste'}})).status,409);

 // Cadastro já existente: o formulário público não altera a ficha; a matrícula fica marcada para revisão.
 as('owner@example.test');const t3=(await ok(await call('admin/turmas','POST',{...turma,nome:'Turma Tarde',vagas:0}))).id,p3=(await ok(await call('admin/planos','POST',{...planBody,turma:t3}))).id;
 as(null);db.exec('DELETE FROM limits');await ok(await call('matricula','POST',{...base,turma:t3,plano:p3,aluno:{...adult,email:'outro@example.test'}}));
 assert.equal(db.prepare('SELECT email FROM people WHERE cpf=?').get(adult.cpf).email,'adulto@example.test');const review=db.prepare('SELECT * FROM enrollments WHERE class_id=?').get(t3);assert.equal(review.needs_review,1);
 // Limite de 5 envios por hora por IP.
 db.exec('DELETE FROM limits');for(let i=0;i<5;i++)await ok(await call('matricula','POST',{...base,turma:t3,plano:p3}));assert.equal((await call('matricula','POST',{...base,turma:t3,plano:p3})).status,429);

 // Perfis.
 as('owner@example.test');
 assert.equal((await call('admin/equipe','POST',{email:'fora@example.test',perfil:'consulta'})).status,400);
 for(const [email,perfil] of [['fin@example.test','financeiro'],['sec@example.test','secretaria'],['ver@example.test','consulta']])await ok(await call('admin/equipe','POST',{email,perfil}));
 assert.equal((await call('admin/equipe','POST',{email:'owner@example.test',perfil:'secretaria'})).status,400,'último administrador removido');
 assert.deepEqual((await ok(await call('admin/equipe'))).equipe.map(x=>x.role),['admin','financeiro','secretaria','consulta']);
 as('ver@example.test');let list=(await ok(await call('admin/matriculas'))).matriculas;assert.equal(list.length,3);assert.ok(list.every(r=>!('cpf' in r)&&!('overdue' in r)));
 assert.equal((await call('admin/matriculas/detalhe?id='+e.id)).status,403);assert.equal((await call('admin/state')).status,403);assert.equal((await call('admin/turmas','POST',turma)).status,403);
 as('sec@example.test');list=(await ok(await call('admin/matriculas?q=menor'))).matriculas;assert.equal(list.length,1);assert.match(list[0].cpf,/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
 let detail=await ok(await call('admin/matriculas/detalhe?id='+e.id));assert.equal(detail.aluno.cpf,adult.cpf);assert.ok(!('parcelas' in detail.financeiro));assert.equal(detail.financeiro.em_dia,true);
 assert.equal((await call('admin/financeiro/resumo')).status,403);assert.equal((await call('admin/financeiro/baixa','POST',{})).status,403);assert.equal((await call('admin/registro')).status,403);
 assert.equal((await ok(await call('admin/state'))).revision,0,'secretaria perdeu o conteúdo do site');
 assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='ver_dados' AND actor='sec@example.test'").get(),'visualização sem registro');
 // Revisão: dados enviados aparecem; edição do cadastro fica no registro com CPF mascarado.
 detail=await ok(await call('admin/matriculas/detalhe?id='+review.id));assert.equal(detail.enviado.aluno.email,'outro@example.test');
 await ok(await call('admin/pessoas/editar','POST',{id:detail.aluno.id,dados:{...adult,email:'outro@example.test'}}));await ok(await call('admin/matriculas/revisada','POST',{id:review.id}));
 assert.equal(db.prepare('SELECT email FROM people WHERE cpf=?').get(adult.cpf).email,'outro@example.test');const editLog=db.prepare("SELECT detail FROM audit_log WHERE action='editar_cadastro'").get().detail;assert.ok(!editLog.includes(adult.cpf)&&editLog.includes('***.'));
 // Cadastro antigo (importado sem CPF, nascimento e endereço): a secretaria salva só o que tem; o resto fica vazio.
 db.prepare("INSERT INTO people(id,full_name,cpf,birth_date,email,phone,cep,street,number,complement,district,city,state,created_at,updated_at,rg) VALUES('legado-1','Aluno Antigo Teste','PLANILHA-1','','','','','','','','','','','2026-01-01','2026-01-01','')").run();
 await ok(await call('admin/pessoas/editar','POST',{id:'legado-1',dados:{nome:'Aluno Antigo Teste',celular:'11999990000'}}));
 assert.deepEqual({...db.prepare("SELECT cpf,phone,birth_date,street FROM people WHERE id='legado-1'").get()},{cpf:'PLANILHA-1',phone:'11999990000',birth_date:'',street:''});
 assert.equal((await call('admin/pessoas/editar','POST',{id:'legado-1',dados:{nome:'Aluno Antigo Teste',cep:'01001000'}})).status,400,'endereço pela metade aceito');
 assert.equal((await call('admin/pessoas/editar','POST',{id:detail.aluno.id,dados:{nome:adult.nome}})).status,400,'cadastro completo aceitou dados faltando');
 // Situação e biometria.
 assert.equal((await call('admin/matriculas/situacao','POST',{id:e.id,situacao:'cancelada'})).status,400,'cancelar sem motivo');
 await ok(await call('admin/matriculas/situacao','POST',{id:e.id,situacao:'aguardando_pagamento'}));
 assert.ok(db.prepare('SELECT contract_signed_at FROM enrollments WHERE id=?').get(e.id).contract_signed_at,'sair de aguardando assinatura não efetivou');

 // Agenda e contagem por turma: só conta como efetivada a matrícula com contrato assinado.
 const today=enrollment.todaySP(),yesterday=iso(new Date(Date.parse(today+'T12:00:00Z')-86400000));
 let agenda=await ok(await call('admin/matriculas/agenda'));let c1=agenda.turmas.find(c=>c.id===t1);
 assert.deepEqual([c1.efetivadas,c1.aguardando_assinatura,c1.aguardando_pagamento,c1.vagas_livres],[1,1,1,0]);
 assert.deepEqual(agenda.dias.find(d=>d.dia===today),{dia:today,recebidas:3,efetivadas:1});
 assert.equal((await call('admin/matriculas/contrato','POST',{id:minorEnrollment.id,data:'2999-01-01'})).status,400,'assinatura no futuro');
 await ok(await call('admin/matriculas/contrato','POST',{id:minorEnrollment.id,data:yesterday}));
 const signedMinor=db.prepare('SELECT status,contract_signed_at FROM enrollments WHERE id=?').get(minorEnrollment.id);assert.equal(signedMinor.status,'aguardando_pagamento');
 assert.deepEqual((await ok(await call('admin/matriculas?por=efetivada&de='+yesterday))).matriculas.map(r=>r.id),[minorEnrollment.id],'filtro pelo dia da assinatura');
 assert.equal((await ok(await call('admin/matriculas?de='+today))).matriculas.length,3,'filtro pelo dia em que chegou');
 agenda=await ok(await call('admin/matriculas/agenda?mes='+yesterday.slice(0,7)));c1=agenda.turmas.find(c=>c.id===t1);assert.deepEqual([c1.efetivadas,c1.aguardando_assinatura],[2,0]);
 assert.equal(agenda.dias.find(d=>d.dia===yesterday).efetivadas,1);assert.equal((await call('admin/matriculas/agenda?mes=2026-13')).status,400);
 // Resumo do dia: matrículas em destaque; financeiro só para administrador e financeiro; atendimento do site só para administrador e secretaria.
 let daily=await ok(await call('admin/matriculas/resumo-dia'));assert.equal(daily.matriculas.recebidas,3);assert.equal(daily.matriculas.efetivadas,1);assert.equal(daily.matriculas.efetivadas_dia_anterior,1);
 assert.equal(daily.lista.length,3);assert.equal(daily.financeiro,null,'secretaria viu o financeiro');assert.equal(daily.site.aula_teste,0);assert.deepEqual(daily.turmas_quase_lotadas.map(c=>c.livres),[0]);
 daily=await ok(await call('admin/matriculas/resumo-dia?dia='+yesterday));assert.deepEqual([daily.matriculas.recebidas,daily.matriculas.efetivadas,daily.lista.length],[0,1,1]);
 assert.equal((await call('admin/matriculas/resumo-dia?dia=2999-01-01')).status,400);
 as('ver@example.test');assert.equal((await call('admin/matriculas/agenda')).status,200,'consulta vê a contagem');daily=await ok(await call('admin/matriculas/resumo-dia'));assert.equal(daily.financeiro,null);assert.equal(daily.site,null);assert.equal((await call('admin/matriculas/contrato','POST',{id:e.id})).status,403);as('sec@example.test');

 // Financeiro: baixa manual, conferência e cancelamento.
 as('fin@example.test');detail=await ok(await call('admin/matriculas/detalhe?id='+e.id));const first=detail.financeiro.parcelas[0];assert.equal(first.kind,'mensalidade');
 assert.equal((await call('admin/financeiro/baixa','POST',{parcela:first.id,valor:120000,forma:'pix',data:'2999-01-01'})).status,400,'data futura');
 await ok(await call('admin/financeiro/baixa','POST',{parcela:first.id,valor:120000,forma:'pix',data:enrollment.todaySP(),obs:'Comprovante conferido'}));
 assert.equal((await call('admin/financeiro/baixa','POST',{parcela:first.id,valor:120000,forma:'pix',data:enrollment.todaySP()})).status,409,'baixa em dobro');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(e.id).status,'aguardando_biometria');
 const second=detail.financeiro.parcelas[1];assert.equal((await call('admin/financeiro/cancelar-parcela','POST',{parcela:second.id,motivo:''})).status,400);await ok(await call('admin/financeiro/cancelar-parcela','POST',{parcela:second.id,motivo:'Bolsa parcial concedida'}));
 assert.equal((await call('admin/financeiro/cancelar-parcela','POST',{parcela:first.id,motivo:'Teste de parcela paga'})).status,409);
 // Parcela vencida entra no resumo e na lista de vencidas.
 db.prepare("UPDATE installments SET due_on='2020-01-10' WHERE enrollment_id=? AND number=3").run(e.id);
 const summary=await ok(await call('admin/financeiro/resumo'));assert.equal(summary.vencido.n,1);assert.equal(summary.vencido.cents,120000);assert.equal(summary.recebido_mes.cents,120000);assert.equal(summary.atraso[0].faixa,'mais_de_60');assert.ok(summary.projecao.length>0);
 const overdueList=(await ok(await call('admin/financeiro/parcelas?situacao=vencida'))).parcelas;assert.equal(overdueList.length,1);assert.equal(overdueList[0].situacao,'vencida');
 assert.equal((await ok(await call('admin/financeiro/parcelas?situacao=paga'))).parcelas[0].paid_method,'pix');
 assert.equal((await call('admin/matriculas/biometria','POST',{id:e.id,feito:true})).status,403,'financeiro marcou biometria');assert.equal((await call('admin/state')).status,403);
 as('sec@example.test');await ok(await call('admin/matriculas/biometria','POST',{id:e.id,feito:true}));assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(e.id).status,'ativa');
 detail=await ok(await call('admin/matriculas/detalhe?id='+e.id));assert.equal(detail.financeiro.em_dia,false);assert.equal(detail.financeiro.vencidas,1);

 // Plano com matrícula não muda de valor; o nome pode mudar.
 as('owner@example.test');assert.equal((await call('admin/planos','POST',{...planBody,id:p1,valor_a_vista:500000})).status,409);await ok(await call('admin/planos','POST',{...planBody,id:p1,nome:'12 parcelas (2027)'}));
 // Registro de alterações: só o administrador vê; não há rota para apagar.
 const log=(await ok(await call('admin/registro'))).registro;for(const action of ['criar_turma','criar_plano','mudar_perfil','baixa_manual','cancelar_parcela','biometria_cadastrada','mudar_situacao','ver_dados'])assert.ok(log.some(r=>r.action===action),action);
 assert.equal((await call('admin/registro','DELETE',{})).status,404);

 // Planilha do painel: o site envia o estado da matrícula a cada mudança, só com o código (sem nome, CPF ou contato).
 const realFetch=globalThis.fetch,sent=[];apiEnv.MATRICULAS_SHEET_URL='https://script.google.com/macros/s/AKfy-matriculas_1/exec';apiEnv.MATRICULAS_SHEET_SECRET='chave-de-teste';
 globalThis.fetch=async(url,opts)=>{sent.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}})};
 as(null);db.exec('DELETE FROM limits');const sheetStudent={...adult,nome:'Pessoa Planilha Teste',cpf:cpf(523456780),email:'planilha@example.test'};
 await ok(await call('matricula','POST',{...base,turma:t3,plano:p3,aluno:sheetStudent}));
 assert.equal(sent.length,1);assert.equal(sent[0].url,apiEnv.MATRICULAS_SHEET_URL);const row=sent[0].body;
 assert.match(row.codigo,/^[0-9A-F]{8}$/);assert.deepEqual([row.turma,row.plano,row.forma,row.situacao,row.contrato_assinado_em,row.valor_cents,row.vagas,row.secret],['Turma Tarde','EsPCEx 2027','Pix','Aguardando assinatura','',480000,0,'chave-de-teste']);
 const text=JSON.stringify(sent[0].body);for(const secret of [sheetStudent.cpf,sheetStudent.nome,sheetStudent.email,'11912345678','Rua de Teste'])assert.ok(!text.includes(secret),'dado pessoal enviado à planilha: '+secret);
 as('owner@example.test');const sheetEnrollment=db.prepare('SELECT e.id FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(sheetStudent.cpf);
 assert.equal((await ok(await call('admin/matriculas/detalhe?id='+sheetEnrollment.id))).matricula.codigo,row.codigo,'código do painel diferente do da planilha');
 assert.equal(row.alunos,undefined,'antes do contrato não vai nada para a planilha de alunos');
 await ok(await call('admin/turmas','POST',{...turma,id:t3,nome:'Turma Tarde',turno:'Tarde',vagas:0,codigo_planilha:'bset27',curso_site:'apmbb'}));
 // O botão "Matricule-se" do curso abre a matrícula filtrada pelo curso do site cadastrado na turma.
 assert.equal((await ok(await call('matricula/opcoes'))).turmas.find(t=>t.id===t3).course_id,'apmbb');
 assert.equal((await call('admin/turmas','POST',{...turma,id:t3,nome:'Turma Tarde',vagas:0,curso_site:'<x>'})).status,400);
 assert.equal((await call('admin/turmas','POST',{...turma,id:t3,nome:'Turma Tarde',vagas:0,codigo_planilha:'B SET'})).status,400);
 await ok(await call('admin/matriculas/contrato','POST',{id:sheetEnrollment.id}));assert.equal(sent.length,2);assert.deepEqual([sent[1].body.codigo,sent[1].body.situacao,sent[1].body.contrato_assinado_em],[row.codigo,'Aguardando pagamento',today]);
 // Contrato assinado: vai o bloco da planilha "Alunos 202X", no padrão dela, com o nome e sem CPF, e-mail, telefone ou endereço.
 const al=sent[1].body.alunos;assert.deepEqual([al.nome,al.escola,al.turma,al.situacao,al.total_cents,al.matriculado_em,al.parcelas.length],['PESSOA PLANILHA TESTE','BSET27','T','ATIVO',480000,today,4]);
 assert.deepEqual(al.parcelas[1],{vence:al.parcelas[1].vence,valor_cents:120000,pago_cents:0,forma:'PIX'});
 const text2=JSON.stringify(sent[1].body);for(const secret of [sheetStudent.cpf,sheetStudent.email,'11912345678','Rua de Teste'])assert.ok(!text2.includes(secret),'dado pessoal enviado à planilha de alunos: '+secret);
 // Baixa manual de uma parcela: a planilha de alunos recebe o valor pago e a forma.
 as('fin@example.test');const firstParcel=db.prepare("SELECT id,amount_cents FROM installments WHERE enrollment_id=? ORDER BY number LIMIT 1").get(sheetEnrollment.id);
 await ok(await call('admin/financeiro/baixa','POST',{parcela:firstParcel.id,valor:firstParcel.amount_cents,forma:'dinheiro',data:today}));
 assert.equal(sent.length,3);assert.deepEqual([sent[2].body.alunos.parcelas[0].pago_cents,sent[2].body.alunos.parcelas[0].forma],[firstParcel.amount_cents,'DINHEIRO']);
 as('owner@example.test');
 // Falha do Google não chega a quem usa o sistema; endereço fora do Apps Script não recebe nada.
 globalThis.fetch=async()=>{throw new TypeError('rede fora')};await ok(await call('admin/matriculas/situacao','POST',{id:sheetEnrollment.id,situacao:'aguardando_biometria'}));
 apiEnv.MATRICULAS_SHEET_URL='https://evil.test/coleta';globalThis.fetch=async(url,opts)=>{sent.push({url,body:JSON.parse(opts.body)});return new Response('{"ok":true}')};await ok(await call('admin/matriculas/situacao','POST',{id:sheetEnrollment.id,situacao:'ativa'}));assert.equal(sent.length,3,'enviou para endereço fora do Apps Script');
 // Alunos: busca por nome, CPF e código; a ficha respeita o perfil.
 as('owner@example.test');
 const byName=(await ok(await call('admin/alunos?q=planilha'))).alunos;assert.equal(byName.length,1);assert.equal(byName[0].full_name,sheetStudent.nome);assert.ok(!byName[0].cpf.includes(sheetStudent.cpf.slice(0,3)+sheetStudent.cpf.slice(3,6)),'CPF mascarado na lista');
 assert.equal((await ok(await call('admin/alunos?q='+sheetStudent.cpf))).alunos[0].id,byName[0].id);
 assert.equal((await ok(await call('admin/alunos?q='+row.codigo))).alunos[0].id,byName[0].id,'busca pelo código da matrícula');
 assert.equal((await ok(await call('admin/alunos?q='+byName[0].codigo))).alunos[0].id,byName[0].id,'busca pelo código do aluno');
 assert.equal((await ok(await call('admin/alunos?q=ninguem%25'))).alunos.length,0);
 const card=await ok(await call('admin/alunos/ficha?id='+byName[0].id));
 assert.equal(card.aluno.cpf,sheetStudent.cpf);assert.equal(card.matriculas.length,1);assert.equal(card.financeiro.parcelas.length,4);assert.equal(card.financeiro.resumo.pago_cents,firstParcel.amount_cents);assert.ok(card.historico.some(h=>h.action==='baixa_manual'));
 as('sec@example.test');const secCard=await ok(await call('admin/alunos/ficha?id='+byName[0].id));assert.equal(secCard.financeiro.parcelas,undefined);assert.equal(secCard.financeiro.resumo.pago_cents,undefined);assert.equal(secCard.historico,null);
 as('ver@example.test');const verList=(await ok(await call('admin/alunos?q=planilha'))).alunos;assert.equal(verList[0].cpf,undefined);assert.equal((await call('admin/alunos/ficha?id='+byName[0].id)).status,403);
 as('owner@example.test');
 // Desconto de 5%: ex-aluno é reconhecido pelo CPF e nascimento (já assinou contrato); não diz nada sem a data certa.
 as(null);db.exec('DELETE FROM limits');
 assert.deepEqual(await ok(await call('matricula/desconto','POST',{cpf:sheetStudent.cpf,nascimento:sheetStudent.nascimento})),{ex_aluno:true,pct:5});
 assert.equal((await ok(await call('matricula/desconto','POST',{cpf:sheetStudent.cpf,nascimento:'1990-01-01'}))).ex_aluno,false);
 assert.equal((await ok(await call('matricula/desconto','POST',{cpf:cpf(823456780),nascimento:'2000-01-01'}))).ex_aluno,false,'quem nunca assinou não é ex-aluno');
 const simEx=await ok(await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:4,vencimento:10,primeira_parcela:today,desconto:'ex_aluno',cpf:sheetStudent.cpf,nascimento:sheetStudent.nascimento}));assert.deepEqual([simEx.parcelas[0].amount_cents,simEx.parcelas[1].amount_cents,simEx.desconto.motivo],[114000,114000,'ex_aluno']);
 assert.equal((await ok(await call('matricula/simular','POST',{plano:p1,forma:'pix',parcelas_pix:4,vencimento:10,primeira_parcela:today,desconto:'ex_aluno',cpf:cpf(823456780),nascimento:'2000-01-01'}))).desconto,null,'desconto de ex-aluno não se finge');
 db.prepare("UPDATE classes SET seats=0 WHERE id=?").run(t1);
 await ok(await call('matricula','POST',{...base,primeira_parcela:today,aluno:sheetStudent}));
 const exE=db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=? AND e.class_id=?').get(sheetStudent.cpf,t1);
 assert.deepEqual([exE.discount_pct,exE.discount_reason,exE.discount_status],[5,'ex_aluno','aprovado']);
 assert.deepEqual(db.prepare('SELECT amount_cents FROM installments WHERE enrollment_id=? ORDER BY number LIMIT 2').all(exE.id).map(r=>r.amount_cents),[114000,114000]);
 // Ex-aluno do Lexus pelo nome completo: acento, maiúsculas e "da/de/dos" não atrapalham; o banco guarda só o hash e o RA.
 assert.equal(enrollment.nameKey('  José  da Silva dos Santos '),'JOSE SILVA SANTOS');assert.equal(await enrollment.nameHash('Ana'),'','nome de uma palavra não confere');
 assert.equal(await enrollment.nameHash('Maria de Lourdes Lexus'),await enrollment.nameHash('MARIA LOURDES LEXUS'));
 db.prepare('INSERT INTO lexus_ex_alunos(ra,name_hash,imported_at) VALUES(?,?,?)').run('4321',await enrollment.nameHash('Maria de Lourdes Lexus'),today);
 db.exec('DELETE FROM limits');
 assert.equal((await ok(await call('matricula/desconto','POST',{nome:'MARIA LOURDES LEXUS'}))).ex_aluno,true,'nome do Lexus');
 assert.equal((await ok(await call('matricula/desconto','POST',{nome:'Maria Lourdes Outra'}))).ex_aluno,false,'nome fora do Lexus');
 const lexusStudent={...adult,nome:'Maria Lourdes Lexus',cpf:cpf(314159265),email:'lexus@example.test'};
 await ok(await call('matricula','POST',{...base,primeira_parcela:today,aluno:lexusStudent}));
 const lxE=db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(lexusStudent.cpf);
 assert.deepEqual([lxE.discount_pct,lxE.discount_reason,lxE.discount_status,JSON.parse(lxE.discount_info).ra],[5,'ex_aluno','aprovado','4321'],'RA guardado para a equipe conferir');
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM lexus_ex_alunos').all()).includes('LOURDES'),'nome legível no banco');
 db.exec('DELETE FROM limits');
 // Militar: sem documento não tem desconto; com documento, 5% a conferir. Arquivo que não é PDF/imagem é recusado.
 const upload=(tipo,bytes,type,name='doc.pdf',parte='frente')=>{const fd=new FormData();fd.append('tipo',tipo);fd.append('parte',parte);fd.append('arquivo',new Blob([bytes],{type}),name);return handle(new Request('https://getepe.test/api/matricula/documento',{method:'POST',headers:{origin:'https://getepe.test','cf-connecting-ip':'203.0.113.9'},body:fd}))};
 assert.equal((await upload('militar',new TextEncoder().encode('<html>'),'application/pdf')).status,400,'arquivo falso');
 assert.equal((await upload('outro',new TextEncoder().encode('%PDF-1.4'),'application/pdf')).status,400,'tipo inválido');
 const mil={...adult,nome:'Pessoa Militar Teste',cpf:cpf(723456780),email:'militar@example.test'};
 assert.equal((await call('matricula','POST',{...base,primeira_parcela:today,aluno:mil,desconto:'militar',documento:'nao-existe'})).status,400,'sem documento');
 const pdf=new TextEncoder().encode('%PDF-1.4 teste');assert.equal((await upload('militar',pdf,'application/pdf','v.pdf','vinculo')).status,400,'militar não manda vínculo');
 const docId=(await ok(await upload('militar',pdf,'application/pdf'))).documento,versoId=(await ok(await upload('militar',pdf,'application/pdf','verso.pdf','verso'))).documento;
 assert.equal((await call('matricula','POST',{...base,primeira_parcela:today,aluno:mil,desconto:'militar',documentos:{frente:docId}})).status,400,'sem o verso');
 assert.ok([...apiEnv.BUCKET.files.keys()].some(k=>k.startsWith('privado/matriculas/')),'documento fora da rota pública');
 assert.equal((await call('matricula','POST',{...base,primeira_parcela:today,aluno:mil,desconto:'dependente_militar',documentos:{frente:docId,verso:versoId}})).status,400,'documento de outro tipo');
 await ok(await call('matricula','POST',{...base,primeira_parcela:today,aluno:mil,desconto:'militar',documentos:{frente:docId,verso:versoId}}));
 const mE=db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(mil.cpf);
 assert.deepEqual([mE.discount_pct,mE.discount_reason,mE.discount_status],[5,'militar','pendente']);assert.equal(db.prepare('SELECT enrollment_id FROM enrollment_documents WHERE id=?').get(docId).enrollment_id,mE.id);
 // A equipe vê e baixa o documento (fica registrado); financeiro e consulta não baixam.
 as('sec@example.test');const det=await ok(await call('admin/matriculas/detalhe?id='+mE.id));assert.deepEqual(det.matricula.documentos.map(x=>x.part),['frente','verso']);assert.equal(det.matricula.desconto_texto,'militar');
 const dl=await call('admin/matriculas/documento?id='+docId);assert.equal(dl.status,200);assert.match(dl.headers.get('Content-Disposition'),/attachment/);assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='ver_documento'").get());
 as('fin@example.test');assert.equal((await call('admin/matriculas/documento?id='+docId)).status,403);
 const key=[...apiEnv.BUCKET.files.keys()].find(k=>k.startsWith('privado/matriculas/'));as(null);assert.equal((await call('media/'+key)).status,404,'rota pública de mídia não serve o documento');as('fin@example.test');
 // Recusa: as parcelas em aberto voltam ao valor cheio.
 as('sec@example.test');assert.equal((await call('admin/matriculas/desconto','POST',{id:mE.id,decisao:'recusar'})).status,400,'recusa sem motivo');
 await ok(await call('admin/matriculas/desconto','POST',{id:mE.id,decisao:'recusar',motivo:'Documento ilegível'}));
 assert.deepEqual(db.prepare('SELECT amount_cents FROM installments WHERE enrollment_id=? ORDER BY number LIMIT 2').all(mE.id).map(r=>r.amount_cents),[120000,120000]);
 assert.deepEqual(Object.values(db.prepare('SELECT discount_pct,discount_status FROM enrollments WHERE id=?').get(mE.id)),[0,'recusado']);
 assert.equal((await call('admin/matriculas/desconto','POST',{id:mE.id,decisao:'aprovar'})).status,409,'já decidido');
 // Dependente com conferência automática: coerente e com cara de real, aprova sozinho; com incoerência, fica a conferir com o aviso no painel.
 as(null);db.exec('DELETE FROM limits');
 const pub=async(body,verify)=>{try{return await enrollment.enrollmentPublic(new Request('https://getepe.test/api/matricula',{method:'POST',headers:{origin:'https://getepe.test','Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:JSON.stringify(body)}),'matricula',DB,undefined,apiEnv.BUCKET,verify)}catch(err){return new Response(JSON.stringify({error:err.message}),{status:err.status||500})}};
 const seen=[];const depDocs=async()=>({frente:(await ok(await upload('dependente_militar',pdf,'application/pdf','f.pdf','frente'))).documento,verso:(await ok(await upload('dependente_militar',pdf,'application/pdf','v.pdf','verso'))).documento,vinculo:(await ok(await upload('dependente_militar',pdf,'application/pdf','c.pdf','vinculo'))).documento});
 const dep1={...adult,nome:'Pessoa Dependente Um',cpf:cpf(923456780),email:'dep1@example.test'},d1=await depDocs();
 assert.equal((await pub({...base,primeira_parcela:today,aluno:dep1,desconto:'dependente_militar',documentos:d1,parentesco:'Filho(a)'},async()=>null)).status,400,'sem o nome do militar');
 const r1=await pub({...base,primeira_parcela:today,aluno:dep1,desconto:'dependente_militar',documentos:d1,parentesco:'Filho(a)',nome_militar:'Militar Pai Teste'},async x=>{seen.push(x);return {parece_real:true,incoerencias:[],resumo:'Documentos coerentes.'}});assert.equal(r1.status,200);
 assert.deepEqual([seen[0].tipo,seen[0].aluno,seen[0].militar,seen[0].parentesco,seen[0].arquivos.map(a=>a.parte).join()],['dependente_militar',dep1.nome,'Militar Pai Teste','Filho(a)','frente,verso,vinculo']);
 const e1=db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(dep1.cpf);assert.equal(e1.discount_status,'aprovado','aprovado pela conferência automática');assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='desconto_aprovado_automatico' AND entity_id=?").get(e1.id));
 const dep2={...adult,nome:'Pessoa Dependente Dois',cpf:cpf(133456780),email:'dep2@example.test'},d2=await depDocs();
 await ok(await pub({...base,primeira_parcela:today,aluno:dep2,desconto:'dependente_militar',documentos:d2,parentesco:'Cônjuge',nome_militar:'Outro Militar Teste'},async()=>({parece_real:true,incoerencias:['O nome no documento militar não é o informado.'],resumo:'Nome diferente.'})));
 const e2=db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(dep2.cpf);assert.equal(e2.discount_status,'pendente');
 as('sec@example.test');const det2=await ok(await call('admin/matriculas/detalhe?id='+e2.id));assert.deepEqual(det2.matricula.discount_check.incoerencias,['O nome no documento militar não é o informado.']);assert.equal(det2.matricula.discount_info.parentesco,'Cônjuge');
 assert.equal((await ok(await call('admin/matriculas/resumo-dia'))).matriculas.desconto_com_incoerencia,1);
 // Conferência que falha não aprova nada: fica para a equipe.
 as(null);db.exec('DELETE FROM limits');const dep3={...adult,nome:'Pessoa Dependente Tres',cpf:cpf(143456780),email:'dep3@example.test'},d3=await depDocs();
 await ok(await pub({...base,primeira_parcela:today,aluno:dep3,desconto:'dependente_militar',documentos:d3,parentesco:'Outro',nome_militar:'Mais Um Militar'},async()=>{throw new Error('fora do ar')}));
 assert.equal(db.prepare('SELECT e.discount_status FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(dep3.cpf).discount_status,'pendente');
 as('owner@example.test');
 // Contrato pelo DocuSeal (falso): sai sozinho sem desconto a conferir; com desconto a conferir, espera a equipe; o aviso de assinado é conferido na API.
 const fake={sent:[],signed:new Set(),failNext:false,async send(d){if(this.failNext){this.failNext=false;throw new Error('DocuSeal fora')}this.sent.push(d);return String(5000+this.sent.length)},async signedAt(ref){return this.signed.has(ref)?'2026-11-17T18:00:00.000Z':null},async documentUrl(ref){return 'https://docuseal.test/doc/'+ref},async signedPdf(ref){if(this.pdfFails)throw new Error('DocuSeal fora');return new TextEncoder().encode('%PDF-1.7 contrato '+ref)}};
 globalThis.__contracts=fake;as(null);db.exec('DELETE FROM limits');apiEnv.RA_ULTIMO_LEXUS='9000';
 const byCpf=c=>db.prepare('SELECT e.* FROM enrollments e JOIN students s ON s.id=e.student_id JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(c);
 const ctA={...adult,nome:'Contrato Automatico Teste',cpf:cpf(161616161),email:'contrato@example.test'};
 await ok(await call('matricula','POST',{...base,primeira_parcela:today,aluno:ctA}));
 const cA=byCpf(ctA.cpf);assert.equal(cA.contract_ref,'5001','contrato enviado logo após a matrícula');assert.ok(cA.contract_sent_at);
 const sA=fake.sent[0];assert.deepEqual([sA.contratante.nome,sA.contratante.email,sA.codigo],[ctA.nome,ctA.email,(cA.id.replace(/-/g,'').slice(0,8)).toUpperCase()]);
 assert.equal(sA.campos.CPFResponsavel,ctA.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'));assert.match(sA.campos.FormaPagamento,/^Pix, em 4 parcelas sem acréscimo/);assert.equal(sA.campos.NomeResponsavel,ctA.nome);assert.equal(sA.campos.NomeCliente,ctA.nome);assert.match(sA.campos.ValorTotalContrato,/4\.800,00$/);assert.equal(sA.campos.RGResponsavel,'123456789');assert.match(sA.campos.ParcelasMatriculas,/^1ª parcela: /);assert.match(sA.campos.DatasMatriculas,/^\d{1,2} de [a-zç]+ de \d{4}$/);
 // RA: aluno novo recebe o próximo depois do último RA do Lexus (RA_ULTIMO_LEXUS); ex-aluno do Lexus usa o dele.
 assert.equal(sA.campos.RA,'9001');assert.equal(db.prepare('SELECT s.ra FROM students s JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(ctA.cpf).ra,'9001');
 assert.equal(db.prepare('SELECT s.ra FROM students s JOIN people p ON p.id=s.person_id WHERE p.cpf=?').get(cpf(314159265)).ra,'4321','ex-aluno do Lexus com o RA dele');
 // Menor: quem assina é o responsável.
 const ctMinor={...adult,nome:'Aluno Menor Contrato',cpf:cpf(171717171),nascimento:yearsAgo(16),email:'menor2@example.test'},ctGuard={...adult,nome:'Responsavel Contrato Teste',cpf:cpf(181818181),nascimento:yearsAgo(44),email:'resp2@example.test',parentesco:'Pai'};
 db.exec('DELETE FROM limits');await ok(await call('matricula','POST',{...base,primeira_parcela:today,aluno:ctMinor,responsavel:ctGuard}));
 assert.deepEqual([fake.sent[1].contratante.email,fake.sent[1].campos.NomeResponsavel,fake.sent[1].campos.NomeCliente,fake.sent[1].campos.RA],[ctGuard.email,ctGuard.nome,ctMinor.nome,'9002']);
 // Falha do DocuSeal não derruba a matrícula; fica registrada e a equipe reenvia.
 fake.failNext=true;db.exec('DELETE FROM limits');const ctF={...adult,nome:'Contrato Falha Teste',cpf:cpf(191919191),email:'falha@example.test'};
 await ok(await call('matricula','POST',{...base,primeira_parcela:today,aluno:ctF}));const cF=byCpf(ctF.cpf);assert.equal(cF.contract_ref,null);
 assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='contrato_envio_falhou' AND entity_id=?").get(cF.id));
 as('fin@example.test');assert.equal((await call('admin/matriculas/enviar-contrato','POST',{id:cF.id})).status,403,'financeiro não envia contrato');
 as('sec@example.test');await ok(await call('admin/matriculas/enviar-contrato','POST',{id:cF.id}));assert.equal(byCpf(ctF.cpf).contract_ref,'5003');
 // Militar com incoerência: não sai; o botão recusa enquanto o desconto está a conferir; ao aprovar, o contrato sai junto.
 as(null);db.exec('DELETE FROM limits');const ctM={...adult,nome:'Militar Contrato Teste',cpf:cpf(212121212),email:'milc@example.test'};
 const mDocs={frente:(await ok(await upload('militar',pdf,'application/pdf','f.pdf','frente'))).documento,verso:(await ok(await upload('militar',pdf,'application/pdf','v.pdf','verso'))).documento};
 const pubC=async(body,verify)=>enrollment.enrollmentPublic(new Request('https://getepe.test/api/matricula',{method:'POST',headers:{origin:'https://getepe.test','Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:JSON.stringify(body)}),'matricula',DB,undefined,apiEnv.BUCKET,verify,fake);
 await ok(await pubC({...base,primeira_parcela:today,aluno:ctM,desconto:'militar',documentos:mDocs},async()=>({parece_real:true,incoerencias:['Frente e verso de documentos diferentes.'],resumo:'Conferido.'})));
 const cM=byCpf(ctM.cpf);assert.deepEqual([cM.discount_status,cM.contract_ref],['pendente',null],'com incoerência o contrato espera a equipe');
 as('sec@example.test');assert.equal((await call('admin/matriculas/enviar-contrato','POST',{id:cM.id})).status,409);
 assert.equal((await ok(await call('admin/matriculas/desconto','POST',{id:cM.id,decisao:'aprovar'}))).contrato_enviado,true);assert.equal(byCpf(ctM.cpf).contract_ref,'5004');
 // Militar sem incoerência: aprovado pela conferência e contrato na hora.
 as(null);db.exec('DELETE FROM limits');const ctM2={...adult,nome:'Militar Coerente Teste',cpf:cpf(232323232),email:'milc2@example.test'};
 const mDocs2={frente:(await ok(await upload('militar',pdf,'application/pdf','f.pdf','frente'))).documento,verso:(await ok(await upload('militar',pdf,'application/pdf','v.pdf','verso'))).documento};
 await ok(await pubC({...base,primeira_parcela:today,aluno:ctM2,desconto:'militar',documentos:mDocs2},async()=>({parece_real:true,incoerencias:[],resumo:'Coerente.'})));
 assert.deepEqual([byCpf(ctM2.cpf).discount_status,byCpf(ctM2.cpf).contract_ref],['aprovado','5005']);assert.match(fake.sent[4].campos.ValorTotalContrato,/com 5% de desconto por ser militar/);
 // Aviso do DocuSeal: código errado é recusado; aviso de algo ainda não assinado na API não marca; assinado marca uma vez só.
 apiEnv.DOCUSEAL_WEBHOOK_TOKEN='token-de-teste-com-mais-de-24-caracteres';
 const hook=(token,body)=>handle(new Request('https://getepe.test/api/docuseal/webhook/'+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const evA={event_type:'form.completed',timestamp:'2026-11-17T18:00:00Z',data:{id:1,status:'completed',submission:{id:5001,status:'completed'}}};
 assert.equal((await hook('errado',evA)).status,401);
 await ok(await hook(apiEnv.DOCUSEAL_WEBHOOK_TOKEN,evA));assert.equal(byCpf(ctA.cpf).contract_signed_at,null,'sem confirmação na API não marca');
 fake.signed.add('5001');await ok(await hook(apiEnv.DOCUSEAL_WEBHOOK_TOKEN,evA));
 const cA2=byCpf(ctA.cpf);assert.deepEqual([cA2.status,cA2.contract_signed_at],['aguardando_pagamento','2026-11-17T18:00:00.000Z']);
 await ok(await hook(apiEnv.DOCUSEAL_WEBHOOK_TOKEN,{event_type:'submission.completed',data:{id:5001,status:'completed'}}));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='contrato_assinado' AND entity_id=?").get(cA.id).n,1,'aviso repetido não duplica');
 await ok(await hook(apiEnv.DOCUSEAL_WEBHOOK_TOKEN,{event_type:'form.viewed',data:{submission:{id:5002}}}));assert.equal(byCpf(ctMinor.cpf).contract_signed_at,null);
 // Contrato assinado no painel: link novo do DocuSeal; financeiro não abre.
 // Cópia do contrato assinado guardada no arquivo do GETEPE na hora do aviso, com o SHA-256 no registro.
 const keyA='privado/contratos/'+cA.id+'.pdf',keptA=apiEnv.BUCKET.files.get(keyA);assert.ok(keptA,'contrato assinado guardado no R2');assert.equal(keptA.type,'application/pdf');assert.equal(keptA.meta.contrato,'5001');assert.match(keptA.meta.sha256,/^[0-9a-f]{64}$/);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='contrato_guardado' AND entity_id=?").get(cA.id).n,1,'guardado uma vez, mesmo com aviso repetido');
 as('sec@example.test');const pdfKept=await call('admin/matriculas/contrato-pdf?id='+cA.id);assert.equal(pdfKept.status,200);assert.equal(pdfKept.headers.get('Content-Type'),'application/pdf');assert.match(pdfKept.headers.get('Content-Disposition'),/^attachment/);assert.match(new TextDecoder().decode(await pdfKept.arrayBuffer()),/^%PDF-1\.7 contrato 5001/);
 // Sem cópia e com o DocuSeal fora: cai no link do DocuSeal; a equipe não fica sem o contrato.
 apiEnv.BUCKET.files.delete(keyA);fake.pdfFails=true;const pdfLink=await call('admin/matriculas/contrato-pdf?id='+cA.id);assert.equal(pdfLink.status,302);assert.equal(pdfLink.headers.get('Location'),'https://docuseal.test/doc/5001');
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='contrato_guardar_falhou' AND entity_id=?").get(cA.id).n,1);
 // Completar os que faltam: só o administrador.
 assert.equal((await call('admin/matriculas/guardar-contratos','POST',{})).status,403);fake.pdfFails=false;
 as('owner@example.test');const keep=await (await call('admin/matriculas/guardar-contratos','POST',{})).json();assert.equal(keep.guardados,1);assert.equal(keep.faltam,0);assert.ok(apiEnv.BUCKET.files.get(keyA));
 const keep2=await (await call('admin/matriculas/guardar-contratos','POST',{})).json();assert.equal(keep2.guardados,0);assert.equal(keep2.ja_guardados,1);
 const detA=await (await call('admin/matriculas/detalhe?id='+cA.id)).json();assert.ok(detA.matricula.contrato_guardado_em,'ficha mostra a cópia guardada');
 as('fin@example.test');assert.equal((await call('admin/matriculas/contrato-pdf?id='+cA.id)).status,403);
 delete globalThis.__contracts;delete apiEnv.DOCUSEAL_WEBHOOK_TOKEN;delete apiEnv.RA_ULTIMO_LEXUS;as('owner@example.test');
 // Cliente do DocuSeal: lê o modelo, manda só os campos que existem, a parte do GETEPE já assinada e o contratante com e-mail.
 { const ds=new Function(stripTypeScriptTypes(fs.readFileSync('app/docuseal.ts','utf8').replace(/export /g,''))+';return {makeContractApi,webhookTokenOk}')();
  assert.equal(ds.makeContractApi({},async()=>null),undefined,'sem chave fica desligado');assert.equal(await ds.webhookTokenOk('curto','curto'),false);assert.equal(await ds.webhookTokenOk('x'.repeat(30),'x'.repeat(30)),true);assert.equal(await ds.webhookTokenOk('y'.repeat(30),'x'.repeat(30)),false);
  const calls=[];globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/submissions/docx'))return Response.json({id:9001,status:'pending',submitters:[]});if(url.endsWith('/submissions/9001'))return Response.json({status:'completed',completed_at:'2026-11-17T19:00:00Z',combined_document_url:'https://docuseal.com/file/x.pdf'});return new Response('{}',{status:404})};
  const semModelo=ds.makeContractApi({DOCUSEAL_API_KEY:'chave-falsa'},async()=>null);await assert.rejects(semModelo.send({codigo:'X',contratante:{nome:'A B',email:'a@example.test'},campos:{}}),/modelo do contrato/);
  const api=ds.makeContractApi({DOCUSEAL_API_KEY:'chave-falsa'},async()=>new Uint8Array([80,75,3,4]));
  assert.equal(await api.send({codigo:'ABCD1234',contratante:{nome:'Pessoa X',email:'x@example.test'},campos:{NomeResponsavel:'Pessoa X',RA:'9001'}}),'9001');
  const post=JSON.parse(calls[0].opts.body);assert.equal(calls[0].opts.headers['X-Auth-Token'],'chave-falsa');assert.equal(calls[0].url,'https://api.docuseal.com/submissions/docx');
  assert.deepEqual(post.variables,{NomeResponsavel:'Pessoa X',RA:'9001'});assert.deepEqual(post.documents,[{name:'Contrato GETEPE ABCD1234.docx',file:'UEsDBA=='}]);assert.equal(post.send_email,true);
  assert.deepEqual(post.submitters[0],{role:'GETEPE',name:'GETEPE - Curso General Telles Pires',completed:true,send_email:false,fields:[{name:'AssinaturaGETEPE',default_value:'GETEPE - Curso General Telles Pires',readonly:true}]});
  assert.deepEqual(post.submitters[1],{role:'Contratante',name:'Pessoa X',email:'x@example.test',external_id:'ABCD1234'});
  assert.equal(await api.signedAt('9001'),'2026-11-17T19:00:00Z');assert.equal(await api.documentUrl('9001'),'https://docuseal.com/file/x.pdf');
  // PDF final: baixa do link do DocuSeal e recusa o que não for PDF.
  const prevFetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>url==='https://docuseal.com/file/x.pdf'?new Response('%PDF-1.7 final'):prevFetch(url,opts);
  assert.equal(new TextDecoder().decode(await api.signedPdf('9001')),'%PDF-1.7 final');
  globalThis.fetch=async(url,opts)=>url==='https://docuseal.com/file/x.pdf'?new Response('<html>erro</html>'):prevFetch(url,opts);await assert.rejects(api.signedPdf('9001'),/não devolveu um PDF/);globalThis.fetch=prevFetch }
 // Modelo do contrato no painel: só o administrador envia; Word de verdade (zip); secretaria baixa; nada na rota pública.
 { globalThis.fetch=realFetch;const up=(name,bytes)=>{const fd=new FormData();fd.append('arquivo',new Blob([bytes]),name);return handle(new Request('https://getepe.test/api/admin/matriculas/modelo-contrato',{method:'POST',headers:{origin:'https://getepe.test'},body:fd}))};
  as('owner@example.test');assert.equal((await ok(await call('admin/matriculas/modelo-contrato'))).enviado,false);
  assert.equal((await up('contrato.pdf',new Uint8Array([37,80,68,70]))).status,400,'não é Word');assert.equal((await up('contrato.docx',new TextEncoder().encode('texto'))).status,400,'docx falso');
  await ok(await up('contrato.docx',new Uint8Array([80,75,3,4,1,2,3])));const info=await ok(await call('admin/matriculas/modelo-contrato'));assert.deepEqual([info.enviado,info.por],[true,'owner@example.test']);
  as('sec@example.test');assert.equal((await up('contrato.docx',new Uint8Array([80,75,3,4]))).status,403,'secretaria não troca o modelo');const dl=await call('admin/matriculas/modelo-contrato?baixar=1');assert.equal(dl.status,200);assert.deepEqual([...new Uint8Array(await dl.arrayBuffer())],[80,75,3,4,1,2,3]);
  as('fin@example.test');assert.equal((await call('admin/matriculas/modelo-contrato')).status,403);
  as(null);assert.equal((await call('media/privado/contrato/modelo.docx')).status,404);as('owner@example.test') }
 globalThis.fetch=realFetch;delete apiEnv.MATRICULAS_SHEET_URL;delete apiEnv.MATRICULAS_SHEET_SECRET;
 console.log('PASS: matrícula pública (validação, menor com responsável, vagas, duplicidade, revisão de cadastro existente, limite por IP, origem, honeypot), parcelas e vencimentos, contrato assinado, agenda por dia e contagem por turma, perfis (admin, secretaria, financeiro, consulta), baixa manual, cancelamento, resumo financeiro, biometria, registro de alterações e envio à planilha do painel sem dados pessoais.');db.close();
}
run().catch(e=>{console.error(e);process.exitCode=1});
