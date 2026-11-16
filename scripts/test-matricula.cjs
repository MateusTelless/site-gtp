// Matrícula pelo site e financeiro: roda o código real da API com node:sqlite em memória e as migrações de drizzle/.
/* eslint-disable @typescript-eslint/no-require-imports -- script CommonJS executado direto pelo Node, como os demais testes */
const assert=require('node:assert/strict'),fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{stripTypeScriptTypes}=require('node:module');
const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const statement=(sql,args=[])=>({bind(...values){return statement(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){if(/^SELECT/i.test(sql))return {results:db.prepare(sql).all(...args)};const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}});
const DB={prepare:statement,async batch(list){db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
const strip=f=>stripTypeScriptTypes(fs.readFileSync(f,'utf8').replace(/export /g,''));
const enrollment=new Function(strip('app/enrollment.ts')+';return {enrollmentPublic,enrollmentAdmin,staffRole,schedule,validCpf,todaySP}')();
const backups=new Function(strip('app/backups.ts')+';return {makeBackup,listBackups,verifyBackup,recoverBackup,exportBackup}')();
let user=null;const team='owner@example.test,fin@example.test,sec@example.test,ver@example.test';const apiEnv={DB,BUCKET:{async put(){},async get(){},async head(){},async list(){return {objects:[],truncated:false}}},ADMIN_EMAILS:team};
let source=fs.readFileSync('app/api/[...path]/route.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export \{safe as GET,safe as POST,safe as PUT,safe as DELETE\};/,'');
const handle=new Function('env','seed','pageDefaults','getAdminIdentity','validateVisual','validateCampaigns','makeBackup','listBackups','verifyBackup','recoverBackup','exportBackup','enrollmentPublic','enrollmentAdmin','staffRole',stripTypeScriptTypes(source)+'\nreturn safe;')(apiEnv,JSON.parse(fs.readFileSync('seed.json','utf8')),JSON.parse(fs.readFileSync('page-defaults.json','utf8')),async()=>user,x=>x,()=>{},...['makeBackup','listBackups','verifyBackup','recoverBackup','exportBackup'].map(k=>backups[k]),enrollment.enrollmentPublic,enrollment.enrollmentAdmin,enrollment.staffRole);
const call=(path,method='GET',data,origin='https://getepe.test')=>handle(new Request('https://getepe.test/api/'+path,{method,headers:{...(method!=='GET'?{origin}:{}),'Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:data===undefined?undefined:JSON.stringify(data)}));
const as=email=>{user=email?{userId:email,email,displayName:email}:null};
const ok=async(r,status=200)=>{const text=await r.text();assert.equal(r.status,status,text);return text?JSON.parse(text):{}};
// CPF fictício válido, gerado a partir de 9 dígitos.
function cpf(base){const d=String(base).padStart(9,'0').split('').map(Number);for(const n of [9,10]){let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);d.push((s*10)%11%10)}return d.join('')}
const iso=d=>d.toISOString().slice(0,10),yearsAgo=n=>{const d=new Date();d.setUTCFullYear(d.getUTCFullYear()-n);d.setUTCDate(d.getUTCDate()-2);return iso(d)};
const address={cep:'01504-001',logradouro:'Rua de Teste',numero:'100',complemento:'',bairro:'Centro',cidade:'São Paulo',uf:'SP'};
const adult={nome:'Pessoa Adulta Teste',cpf:cpf(123456780),nascimento:yearsAgo(20),email:'adulto@example.test',celular:'(11) 91234-5678',...address};

async function run(){
 // Regras puras: CPF e calendário de parcelas.
 assert.equal(enrollment.validCpf('111.111.111-11'),'');assert.equal(enrollment.validCpf(cpf(123456780)),cpf(123456780));assert.equal(enrollment.validCpf(cpf(123456780).slice(0,10)+'0')===cpf(123456780),false);
 const plan={enrollment_fee_cents:20000,enrollment_fee_due_days:3,installment_count:3,installment_cents:60000,first_due_month:'2027-01'};
 assert.deepEqual(enrollment.schedule(plan,10,'2026-11-15').map(r=>[r.number,r.kind,r.amount_cents,r.due_on]),[[0,'matricula',20000,'2026-11-18'],[1,'mensalidade',60000,'2027-01-10'],[2,'mensalidade',60000,'2027-02-10'],[3,'mensalidade',60000,'2027-03-10']]);
 assert.deepEqual(enrollment.schedule({...plan,enrollment_fee_cents:0},10,'2027-01-20').map(r=>r.due_on),['2027-02-10','2027-03-10','2027-04-10'],'mês inicial já vencido');
 assert.deepEqual(enrollment.schedule({...plan,enrollment_fee_cents:0,installment_count:2},5,'2027-12-01').map(r=>r.due_on),['2027-12-05','2028-01-05'],'virada de ano');

 // Sem login nada do painel abre; sem turma no site, a matrícula não tem opções.
 as(null);assert.equal((await call('admin/matriculas')).status,401);assert.equal((await call('admin/financeiro/resumo')).status,401);
 assert.deepEqual((await ok(await call('matricula/opcoes'))).turmas,[]);

 // Equipe cadastra turma e plano. Turma fora do site não aparece.
 as('owner@example.test');
 const turma={nome:'EsPCEx 2027 · Manhã',concurso:'EsPCEx',unidade:'São Paulo',turno:'Manhã',horario:'Segunda a sexta, 8h às 12h',inicio:'2027-01-12',fim:'2027-09-12',vagas:2,site:true,situacao:'aberta'};
 assert.equal((await call('admin/turmas','POST',{...turma,fim:'2026-01-01'})).status,400);
 const t1=(await ok(await call('admin/turmas','POST',turma))).id,t2=(await ok(await call('admin/turmas','POST',{...turma,nome:'Turma interna',site:false}))).id;
 const planBody={turma:t1,nome:'12 parcelas',taxa_matricula:20000,prazo_taxa:3,parcelas:12,valor_parcela:60000,primeiro_mes:'2027-01',dias_vencimento:[5,10,15],formas:['pix','cartao']};
 assert.equal((await call('admin/planos','POST',{...planBody,dias_vencimento:[31]})).status,400);assert.equal((await call('admin/planos','POST',{...planBody,formas:['cheque']})).status,400);assert.equal((await call('admin/planos','POST',{...planBody,formas:['pix','boleto']})).status,400,'boleto fora das formas do site');
 const p1=(await ok(await call('admin/planos','POST',planBody))).id,p2=(await ok(await call('admin/planos','POST',{...planBody,turma:t2}))).id;
 as(null);let options=(await ok(await call('matricula/opcoes'))).turmas;assert.equal(options.length,1);assert.equal(options[0].id,t1);assert.deepEqual(options[0].planos[0].due_days,[5,10,15]);assert.ok(!('taken' in options[0])&&!('seats' in options[0]));
 const sim=await ok(await call('matricula/simular','POST',{plano:p1,vencimento:10}));assert.equal(sim.parcelas.length,13);assert.equal(sim.total_cents,20000+12*60000);
 assert.equal((await call('matricula/simular','POST',{plano:p2,vencimento:10})).status,400,'plano de turma fora do site');

 // Validação pública.
 const base={turma:t1,plano:p1,vencimento:10,forma:'pix',aluno:adult,aceite:true};
 for(const [bad,why] of [[{aluno:{...adult,cpf:'123.456.789-00'}},'CPF'],[{aluno:{...adult,nome:'Ana'}},'nome'],[{aluno:{...adult,uf:'XX'}},'UF'],[{aluno:{...adult,nascimento:'2999-01-01'}},'nascimento'],[{aceite:false},'aceite'],[{vencimento:20},'dia'],[{forma:'boleto'},'boleto não é aceito'],[{forma:'dinheiro'},'forma'],[{plano:p2},'plano de outra turma'],[{aluno:{...adult,nome:'<b>Pessoa</b> Teste'}},'HTML']])assert.equal((await call('matricula','POST',{...base,...bad})).status,400,why);
 assert.equal((await call('matricula','POST',base,'https://evil.test')).status,403);
 await ok(await call('matricula','POST',{...base,website:'spam'}));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n,0,'honeypot gravou');

 // Matrícula de adulto: pessoa, aluno, matrícula, aceite, parcelas e registro. Responsável enviado por adulto é ignorado.
 await ok(await call('matricula','POST',{...base,outroPagador:true,responsavel:{...adult,nome:'Outra Pessoa Teste',cpf:cpf(423456780),parentesco:'Tio'}}));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM people').get().n,1,'adulto não tem responsável');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM student_guardians').get().n,0);
 let e=db.prepare('SELECT * FROM enrollments').get();assert.equal(e.status,'aguardando_assinatura');assert.equal(e.needs_review,0);assert.equal(e.class_id,t1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installments WHERE enrollment_id=?').get(e.id).n,13);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM consents').get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='matricula_recebida'").get().n,1);assert.equal(db.prepare('SELECT phone FROM people').get().phone,'11912345678');
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
 as('fin@example.test');detail=await ok(await call('admin/matriculas/detalhe?id='+e.id));const first=detail.financeiro.parcelas[0];assert.equal(first.kind,'matricula');
 assert.equal((await call('admin/financeiro/baixa','POST',{parcela:first.id,valor:20000,forma:'pix',data:'2999-01-01'})).status,400,'data futura');
 await ok(await call('admin/financeiro/baixa','POST',{parcela:first.id,valor:20000,forma:'pix',data:enrollment.todaySP(),obs:'Comprovante conferido'}));
 assert.equal((await call('admin/financeiro/baixa','POST',{parcela:first.id,valor:20000,forma:'pix',data:enrollment.todaySP()})).status,409,'baixa em dobro');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payments').get().n,1);assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(e.id).status,'aguardando_biometria');
 const second=detail.financeiro.parcelas[1];assert.equal((await call('admin/financeiro/cancelar-parcela','POST',{parcela:second.id,motivo:''})).status,400);await ok(await call('admin/financeiro/cancelar-parcela','POST',{parcela:second.id,motivo:'Bolsa parcial concedida'}));
 assert.equal((await call('admin/financeiro/cancelar-parcela','POST',{parcela:first.id,motivo:'Teste de parcela paga'})).status,409);
 // Parcela vencida entra no resumo e na lista de vencidas.
 db.prepare("UPDATE installments SET due_on='2020-01-10' WHERE enrollment_id=? AND number=3").run(e.id);
 const summary=await ok(await call('admin/financeiro/resumo'));assert.equal(summary.vencido.n,1);assert.equal(summary.vencido.cents,60000);assert.equal(summary.recebido_mes.cents,20000);assert.equal(summary.atraso[0].faixa,'mais_de_60');assert.ok(summary.projecao.length>0);
 const overdueList=(await ok(await call('admin/financeiro/parcelas?situacao=vencida'))).parcelas;assert.equal(overdueList.length,1);assert.equal(overdueList[0].situacao,'vencida');
 assert.equal((await ok(await call('admin/financeiro/parcelas?situacao=paga'))).parcelas[0].paid_method,'pix');
 assert.equal((await call('admin/matriculas/biometria','POST',{id:e.id,feito:true})).status,403,'financeiro marcou biometria');assert.equal((await call('admin/state')).status,403);
 as('sec@example.test');await ok(await call('admin/matriculas/biometria','POST',{id:e.id,feito:true}));assert.equal(db.prepare('SELECT status FROM enrollments WHERE id=?').get(e.id).status,'ativa');
 detail=await ok(await call('admin/matriculas/detalhe?id='+e.id));assert.equal(detail.financeiro.em_dia,false);assert.equal(detail.financeiro.vencidas,1);

 // Plano com matrícula não muda de valor; o nome pode mudar.
 as('owner@example.test');assert.equal((await call('admin/planos','POST',{...planBody,id:p1,valor_parcela:65000})).status,409);await ok(await call('admin/planos','POST',{...planBody,id:p1,nome:'12 parcelas (2027)'}));
 // Registro de alterações: só o administrador vê; não há rota para apagar.
 const log=(await ok(await call('admin/registro'))).registro;for(const action of ['criar_turma','criar_plano','mudar_perfil','baixa_manual','cancelar_parcela','biometria_cadastrada','mudar_situacao','ver_dados'])assert.ok(log.some(r=>r.action===action),action);
 assert.equal((await call('admin/registro','DELETE',{})).status,404);

 // Planilha do painel: o site envia o estado da matrícula a cada mudança, só com o código (sem nome, CPF ou contato).
 const realFetch=globalThis.fetch,sent=[];apiEnv.MATRICULAS_SHEET_URL='https://script.google.com/macros/s/AKfy-matriculas_1/exec';apiEnv.MATRICULAS_SHEET_SECRET='chave-de-teste';
 globalThis.fetch=async(url,opts)=>{sent.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}})};
 as(null);db.exec('DELETE FROM limits');const sheetStudent={...adult,nome:'Pessoa Planilha Teste',cpf:cpf(523456780),email:'planilha@example.test'};
 await ok(await call('matricula','POST',{...base,turma:t3,plano:p3,aluno:sheetStudent}));
 assert.equal(sent.length,1);assert.equal(sent[0].url,apiEnv.MATRICULAS_SHEET_URL);const row=sent[0].body;
 assert.match(row.codigo,/^[0-9A-F]{8}$/);assert.deepEqual([row.turma,row.plano,row.forma,row.situacao,row.contrato_assinado_em,row.valor_cents,row.vagas,row.secret],['Turma Tarde','12 parcelas','Pix','Aguardando assinatura','',20000+12*60000,0,'chave-de-teste']);
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
 const al=sent[1].body.alunos;assert.deepEqual([al.nome,al.escola,al.turma,al.situacao,al.total_cents,al.matriculado_em,al.parcelas.length],['PESSOA PLANILHA TESTE','BSET27','T','ATIVO',20000+12*60000,today,13]);
 assert.deepEqual(al.parcelas[1],{vence:al.parcelas[1].vence,valor_cents:60000,pago_cents:0,forma:'PIX'});
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
 assert.equal(card.aluno.cpf,sheetStudent.cpf);assert.equal(card.matriculas.length,1);assert.equal(card.financeiro.parcelas.length,13);assert.equal(card.financeiro.resumo.pago_cents,firstParcel.amount_cents);assert.ok(card.historico.some(h=>h.action==='baixa_manual'));
 as('sec@example.test');const secCard=await ok(await call('admin/alunos/ficha?id='+byName[0].id));assert.equal(secCard.financeiro.parcelas,undefined);assert.equal(secCard.financeiro.resumo.pago_cents,undefined);assert.equal(secCard.historico,null);
 as('ver@example.test');const verList=(await ok(await call('admin/alunos?q=planilha'))).alunos;assert.equal(verList[0].cpf,undefined);assert.equal((await call('admin/alunos/ficha?id='+byName[0].id)).status,403);
 as('owner@example.test');
 globalThis.fetch=realFetch;delete apiEnv.MATRICULAS_SHEET_URL;delete apiEnv.MATRICULAS_SHEET_SECRET;
 console.log('PASS: matrícula pública (validação, menor com responsável, vagas, duplicidade, revisão de cadastro existente, limite por IP, origem, honeypot), parcelas e vencimentos, contrato assinado, agenda por dia e contagem por turma, perfis (admin, secretaria, financeiro, consulta), baixa manual, cancelamento, resumo financeiro, biometria, registro de alterações e envio à planilha do painel sem dados pessoais.');db.close();
}
run().catch(e=>{console.error(e);process.exitCode=1});
