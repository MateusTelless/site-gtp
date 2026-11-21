(()=>{'use strict';
// Matrícula em 5 passos: turma, aluno, responsável (só menor), pagamento e confirmação.
// O servidor refaz todas as validações e calcula as parcelas; aqui só guiamos a pessoa.
const $=s=>document.querySelector(s),form=$('#enroll'),errorBox=$('#enroll-error');
const money=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=d=>d.split('-').reverse().join('/');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UF='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const WEEK=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
let turmas=[],step=1,schedule=null,meta={};
// Desconto de 5%: ex-aluno (o site confere pelo CPF e nascimento) ou militar/dependente com documento anexado. Não se somam.
const PCT=5,DISC_TEXT={ex_aluno:'ex-aluno do GETEPÊ',militar:'militar',dependente_militar:'dependente de militar'};
// Militar: frente e verso do documento. Dependente: também o documento do vínculo, o parentesco e o nome do militar.
let exAluno=false,exChecked='',proof={kind:'',docs:{},sending:'',kin:'',mil:''};
const KIN=['Filho(a)','Cônjuge','Companheiro(a)','Enteado(a)','Outro'];
const proofParts=()=>proof.kind==='dependente_militar'?['frente','verso','vinculo']:['frente','verso'];
const proofDone=()=>!!proof.kind&&proofParts().every(p=>proof.docs[p])&&(proof.kind!=='dependente_militar'||(KIN.includes(proof.kin)&&proof.mil.trim().split(/\s+/).length>1));
const discReason=()=>exAluno?'ex_aluno':proofDone()?proof.kind:'';
const off=c=>discReason()?Math.round(c*(100-PCT)/100):c;
const fields=[['nome','Nome completo','text','name',120],['cpf','CPF','text','off',14,'numeric'],['rg','RG','text','off',20],['nascimento','Data de nascimento','date','bday'],['email','E-mail','email','email',254],['celular','Celular com DDD','tel','tel',16,'tel'],['cep','CEP','text','postal-code',9,'numeric'],['logradouro','Rua ou avenida','text','address-line1',150],['numero','Número','text','off',20],['complemento','Complemento (opcional)','text','address-line2',80],['bairro','Bairro','text','off',80],['cidade','Cidade','text','address-level2',80],['uf','Estado','select','address-level1']];
document.querySelectorAll('[data-person]').forEach(box=>{const who=box.dataset.person;box.innerHTML=fields.map(([k,label,type,auto,max,mode])=>`<label>${label}${type==='select'?`<select name="${who}.${k}" autocomplete="${auto}"><option value="">Selecione</option>${UF.map(u=>`<option${u==='SP'?' selected':''}>${u}</option>`).join('')}</select>`:`<input name="${who}.${k}" type="${type}" autocomplete="${who==='aluno'?auto:'off'}"${max?` maxlength="${max}"`:''}${mode?` inputmode="${mode}"`:''}${k==='complemento'?'':' required'}>`}</label>`).join('')});
// Grupo de rádios devolve o marcado; um rádio sozinho só conta se estiver marcado.
const val=n=>{const el=form.elements.namedItem(n);if(!el)return '';if(el.type==='radio'&&!el.checked)return '';return String(el.value||'').trim()};
const person=who=>Object.fromEntries(fields.map(([k])=>[k,val(who+'.'+k)]));
const turma=()=>turmas.find(x=>x.id===val('turma'));
// Pix e cartão: o primeiro plano da turma com opções de cada forma.
const pixPlan=()=>(turma()?.planos||[]).find(p=>p.methods.includes('pix')&&p.pix.length);
const cardPlan=()=>(turma()?.planos||[]).find(p=>p.methods.includes('cartao')&&p.cartao.length);
const method=()=>val('forma');
const plano=()=>method()==='cartao'?cardPlan():pixPlan();
const dueDay=()=>val('vencimento')==='outro'?Number(val('vencimento_outro')):Number(val('vencimento'));
const cardOpt=()=>cardPlan()?.cartao.find(o=>String(o.n)===val('parcelas_cartao'));
// Pix: de 1x até o mês em que o curso termina, contando do mês da primeira parcela (se ela cair no mês seguinte, uma opção a menos).
const monthsTo=(from,to)=>{const [a,b]=from.split('-').map(Number),[c,d]=to.split('-').map(Number);return Math.max(1,(c*12+d)-(a*12+b)+1)};
const pixOpts=()=>{const p=pixPlan(),t=turma();if(!p||!t)return [];const max=monthsTo(val('primeira_parcela')||meta.hoje,t.ends_on);return p.pix.filter(o=>o.n<=max)};
const pixN=()=>Number(val('parcelas_pix'))||0;
function age(birth){if(!birth)return 99;const b=new Date(birth+'T12:00:00'),n=new Date();return n.getFullYear()-b.getFullYear()-((n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))?1:0)}
// A etapa do responsável financeiro só existe para aluno menor de 18 anos.
const minor=()=>age(val('aluno.nascimento'))<18,needsGuardian=minor;
function fail(text){errorBox.textContent=text;errorBox.hidden=false;errorBox.focus?.()}
async function api(path,data){const r=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Não foi possível concluir. Tente novamente.');return b}
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const weekday=d=>WEEK[new Date(d+'T12:00:00Z').getUTCDay()];

// Vindo do botão "Matricule-se" de um curso (?curso=apmbb): só as turmas desse curso. Com uma turma, ela já vem escolhida;
// com mais de uma (manhã e noite, por exemplo), a pessoa escolhe o período.
const params=new URLSearchParams(location.search),course=(params.get('curso')||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
const courseName=(params.get('nome')||'').slice(0,60),phoneParam=params.get('whatsapp')||'',phone=/^55\d{10,11}$/.test(phoneParam)?phoneParam:'5511971920102';
const whatsapp=text=>`https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
// Na escolha de período, o turno vem em destaque; nos outros casos, o nome da turma.
const classCard=(t,input,byShift)=>`<label class="enroll-option${t.vagas?'':' full'}">${input}<b>${esc(byShift?t.shift:t.name)}</b>${byShift?`<span>${esc(t.name)}</span>`:`<span>${esc(t.exam)} · ${esc(t.unit)} · ${esc(t.shift)}</span>`}<span>${esc(t.schedule)}</span><span>De ${date(t.starts_on)} a ${date(t.ends_on)}</span>${t.vagas?'':'<em>Vagas esgotadas</em>'}</label>`;
function drawClasses(){
 const box=$('#classes'),title=$('[data-step="1"] h2');
 if(course){
  turmas=turmas.filter(t=>t.course_id===course);
  if(courseName){$('.guide-intro h1').textContent='Matrícula · '+courseName;title.textContent='Sua turma'}
  if(!turmas.length){box.innerHTML=`<p>A matrícula pelo site${courseName?' para '+esc(courseName):''} ainda não está aberta. Fale com a equipe pelo <a href="${esc(whatsapp('Olá! Quero me matricular'+(courseName?' na turma de '+courseName:'')+'.'))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗︎</a> ou veja <a href="/matricula/">todas as turmas abertas</a>.</p>`;$('#next').hidden=true;return}
  if(turmas.length===1){const t=turmas[0];
   box.innerHTML=`<p class="enroll-chosen-label">Você está se matriculando em</p>`+classCard(t,`<input type="radio" name="turma" value="${esc(t.id)}"${t.vagas?' checked':' disabled'}>`).replace('enroll-option','enroll-option enroll-chosen');
   if(!t.vagas)box.innerHTML+=`<p>As vagas desta turma acabaram. Fale com a equipe pelo <a href="${esc(whatsapp('Olá! Quero entrar na lista de espera da turma '+t.name+'.'))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗︎</a>.</p>`;
   return}
  title.textContent='Escolha o período';
  box.setAttribute('aria-label','Períodos');
  box.innerHTML=`<p class="enroll-chosen-label">Este curso tem ${turmas.length} períodos. Escolha o seu:</p>`+turmas.map(t=>classCard(t,`<input type="radio" name="turma" value="${esc(t.id)}"${t.vagas?'':' disabled'}>`,true)).join('');
  return;
 }
 box.innerHTML=turmas.length?turmas.map(t=>classCard(t,`<input type="radio" name="turma" value="${esc(t.id)}"${t.vagas?'':' disabled'}>`)).join(''):`<p>Nenhuma turma com matrícula aberta pelo site agora. Fale com a equipe pelo <a href="${esc(whatsapp('Olá! Quero informações para matrícula.'))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗︎</a>.</p>`;
}

// Pagamento: primeiro Pix ou cartão; depois as escolhas de cada um.
const radio=(name,value,label,sub,checked)=>`<label class="enroll-option"><input type="radio" name="${name}" value="${esc(value)}"${checked?' checked':''}><b>${label}</b>${sub?`<span>${sub}</span>`:''}</label>`;
const chip=(name,value,label,checked)=>`<label class="enroll-chip"><input type="radio" name="${name}" value="${esc(value)}"${checked?' checked':''}><span>${label}</span></label>`;
function drawPayment(){
 const m=method(),pix=pixPlan(),card=cardPlan();
 // Forma escolhida: ao lado da opção, uma coluna com o número de vezes e o valor de cada parcela.
 drawDiscount();
 const ncolOf=(name,label,opts,sel,one)=>`<div class="enroll-ncol" role="radiogroup" aria-label="${label}"><p>Em quantas vezes?${discReason()?'<small class="enroll-off">já com 5% de desconto</small>':''}</p>${opts.map(o=>`<label class="enroll-nrow"><input type="radio" name="${name}" value="${o.n}"${String(o.n)===sel?' checked':''}><b>${o.n}x</b><span>${money(off(o.parcela_cents))}</span>${o.n===1?`<small>${one}</small>`:''}</label>`).join('')}</div>`;
 const pOpts=pixOpts();
 // Se a data da primeira parcela diminuiu o máximo do Pix, a escolha que passou do limite é desmarcada.
 if(pixN()>pOpts.length)form.querySelectorAll('[name=parcelas_pix]').forEach(i=>i.checked=false);
 const ncol=m==='cartao'&&card?ncolOf('parcelas_cartao','Em quantas vezes no cartão',card.cartao,val('parcelas_cartao'),'sem juros'):m==='pix'&&pix?ncolOf('parcelas_pix','Em quantas vezes no Pix',pOpts,val('parcelas_pix'),'à vista'):'';
 $('#methods').innerHTML=(pix?radio('forma','pix','Pix','Sem juros, de 1x até '+pOpts.length+'x (até o mês em que o curso termina). A primeira vence em até 3 dias.',m==='pix'):'')+(card?radio('forma','cartao','Cartão de crédito','À vista sem juros ou em até '+card.cartao[card.cartao.length-1].n+'x. Você passa o cartão na unidade, em dia útil.',m==='cartao'):'')+ncol;
 $('#methods').classList.toggle('with-ncol',!!ncol);
 $('#pay-pix').hidden=m!=='pix';$('#pay-card').hidden=m!=='cartao';
 if(m==='pix'){
  // Com uma parcela só, não há dia de vencimento mensal.
  const days=(pix?.due_days?.length?pix.due_days:[5,10,15]),d=val('vencimento');
  $('#pix-days-box').hidden=pixN()===1;
  $('#pix-days').innerHTML=days.map(x=>chip('vencimento',x,'Dia '+x,String(x)===d)).join('')+chip('vencimento','outro','Outro dia',d==='outro');
  $('#pix-other-wrap').hidden=d!=='outro';
  const f=val('primeira_parcela'),hoje=meta.hoje;
  $('#pix-first').innerHTML=[0,1,2,3].map(i=>{const x=addDays(hoje,i);return chip('primeira_parcela',x,(i===0?'Hoje':i===1?'Amanhã':weekday(x).replace(/^./,c=>c.toUpperCase()))+', '+date(x).slice(0,5),x===f)}).join('');
  drawSchedule();
 }
 if(m==='cartao'){
  // Só dias úteis (segunda a sexta) de hoje até 30 dias.
  const v=val('visita'),days=[];for(let i=0;addDays(meta.hoje,i)<=meta.visita_ate;i++){const x=addDays(meta.hoje,i),w=new Date(x+'T12:00:00Z').getUTCDay();if(w>0&&w<6)days.push(x)}
  form.elements.namedItem('visita').innerHTML='<option value="">Escolha o dia</option>'+days.map(x=>`<option value="${x}"${x===v?' selected':''}>${x===meta.hoje?'Hoje, ':''}${weekday(x)}, ${date(x).slice(0,5)}</option>`).join('');
 }
}
async function drawSchedule(){schedule=null;const p=plano(),n=pixN(),day=dueDay(),first=val('primeira_parcela');
 if(!p||!n||(n>1&&!(day>=1&&day<=28))||!first){$('#schedule').innerHTML='<tr><td colspan="3">Escolha em quantas vezes, '+(n===1?'':'o dia de vencimento e ')+'a data da primeira parcela.</td></tr>';return}
 try{schedule=await api('matricula/simular',{plano:p.id,forma:'pix',parcelas_pix:n,vencimento:n>1?day:undefined,primeira_parcela:first,...discBody()});$('#schedule').innerHTML=schedule.parcelas.map(r=>`<tr><td>${n===1?'Parcela única':r.number+'ª parcela'}</td><td>${date(r.due_on)}</td><td>${money(r.amount_cents)}</td></tr>`).join('')+`<tr><th colspan="2">Total${schedule.desconto?' (com 5% de desconto)':''}</th><th>${money(schedule.total_cents)}</th></tr>`;errorBox.hidden=true}catch(e){fail(e.message)}}
const discBody=()=>{const r=discReason();return r==='ex_aluno'?{desconto:'ex_aluno',cpf:val('aluno.cpf'),nascimento:val('aluno.nascimento'),nome:val('aluno.nome')}:r?{desconto:r}:{}};
// Quadro do desconto, no alto do pagamento: ex-aluno já reconhecido, ou a opção de militar/dependente com o documento.
function drawDiscount(){
 const box=$('#discount');
 if(exAluno){box.innerHTML=`<div class="enroll-disc ok"><b>Você tem 5% de desconto no valor total</b><span>porque é ex-aluno do GETEPÊ. Os valores abaixo já estão com o desconto.</span></div>`;return}
 const k=proof.kind,dep=k==='dependente_militar';
 const LBL={frente:'Frente do documento militar',verso:'Verso do documento militar',vinculo:'Documento que mostra o vínculo (certidão de nascimento ou casamento, ou RG com o nome dos pais)'};
 const fileRow=p=>{const d=proof.docs[p];return `<div class="enroll-filerow"><label class="enroll-file">${d?'✓ '+LBL[p]+': '+esc(d.name)+' <small>(trocar)</small>':LBL[p]+' — PDF ou foto, até 5 MB'}<input type="file" name="documento_${p}" data-part="${p}" accept="application/pdf,image/jpeg,image/png,image/webp"></label>${proof.sending===p?'<span class="enroll-note">Enviando…</span>':''}</div>`};
 box.innerHTML=`<fieldset class="enroll-disc"><legend>É militar ou dependente de militar? Você tem 5% de desconto no valor total.</legend><div class="enroll-chips">${[['','Não'],['militar','Sou militar'],['dependente_militar','Sou dependente de militar']].map(([v,l])=>`<label class="enroll-chip"><input type="radio" name="desconto_tipo" value="${v}"${v===k?' checked':''}><span>${l}</span></label>`).join('')}</div>`+
  (k?`<p class="enroll-note">Envie ${dep?'a frente e o verso do documento do militar (identidade militar) e o documento que mostra o vínculo':'a frente e o verso da sua identidade militar'}. Os documentos são conferidos; se algo não bater, a equipe confere antes do contrato.</p><p class="enroll-note enroll-lgpd">Usamos os documentos só para conferir o desconto: eles passam por leitura automática (Anthropic, EUA) e pela equipe do GETEPÊ.</p>`+
   (dep?`<div class="enroll-grid"><label>Seu vínculo com o militar<select name="parentesco_militar"><option value="">Selecione</option>${KIN.map(x=>`<option${x===proof.kin?' selected':''}>${x}</option>`).join('')}</select></label><label>Nome completo do militar<input name="nome_militar" maxlength="120" value="${esc(proof.mil)}" autocomplete="off"></label></div>`:'')+
   proofParts().map(fileRow).join('')+
   (proofDone()?'<p class="enroll-ok">✓ Tudo enviado. O desconto de 5% já está nos valores abaixo.</p>':'<p class="enroll-note">O desconto entra quando tudo acima estiver enviado.</p>'):'')+`</fieldset>`;
}
async function sendProof(file,part){
 if(!file||!part)return;if(file.size>5*1024*1024){delete proof.docs[part];drawPayment();return fail('O arquivo pode ter até 5 MB.')}
 proof.sending=part;delete proof.docs[part];drawPayment();
 try{const fd=new FormData();fd.append('tipo',proof.kind);fd.append('parte',part);fd.append('arquivo',file);const r=await fetch('/api/matricula/documento',{method:'POST',body:fd});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Não foi possível enviar o documento.');proof.docs[part]={id:b.documento,name:file.name.slice(0,60)};errorBox.hidden=true}
 catch(e){fail(e.message)}finally{proof.sending='';drawPayment()}
}
async function checkExAluno(){const cpf=val('aluno.cpf'),nasc=val('aluno.nascimento'),nome=val('aluno.nome'),k=cpf+'|'+nasc+'|'+nome;if(k===exChecked)return;exChecked=k;exAluno=false;
 try{const r=await api('matricula/desconto',{cpf,nascimento:nasc,nome});exAluno=!!r.ex_aluno}catch{exAluno=false}}
function drawGuardian(){$('#guardian-why').textContent='Como o aluno tem menos de 18 anos, o responsável legal preenche os dados dele, assina o contrato e recebe as cobranças.'}
// Confirmação: a turma em destaque (com a pergunta "é esta mesmo?") e tudo o que foi preenchido, com atalho para corrigir cada parte.
function drawReview(){const t=turma(),a=person('aluno'),g=needsGuardian()?person('responsavel'):null;
 const line=(k,v)=>v?`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`:'';
 const addr=p=>[p.logradouro+', '+p.numero+(p.complemento?' – '+p.complemento:''),p.bairro,p.cidade+'/'+p.uf,'CEP '+p.cep].join(' · ');
 const block=(title,step,body)=>`<div class="enroll-review-block"><div class="enroll-review-head"><h3>${title}</h3><button type="button" class="enroll-fix" data-go="${step}">Corrigir</button></div><dl class="guide-facts">${body}</dl></div>`;
 const personLines=p=>line('Nome',p.nome)+line('CPF',p.cpf)+line('Nascimento',p.nascimento?date(p.nascimento):'')+line('E-mail',p.email)+line('Celular',p.celular)+line('Endereço',addr(p));
 let pay;
 if(method()==='cartao'){const o=cardOpt(),v=val('visita');pay=line('Forma','Cartão de crédito')+line('Pagamento',o?(o.n===1?'À vista: '+money(off(o.parcela_cents))+' (sem juros)':o.n+'x de '+money(off(o.parcela_cents))):'')+line('Visita para passar o cartão',v?weekday(v)+', '+date(v):'')+line('Onde','Rua Vergueiro, 819 · Sobreloja 1 · Liberdade')}
 else{const n=pixN(),o=pixOpts().find(x=>x.n===n);pay=line('Forma','Pix (sem juros)')+line('Parcelas',o?(n===1?'À vista: '+money(off(o.parcela_cents)):n+'x de '+money(off(o.parcela_cents))):'')+(n>1?line('Vencimento','Dia '+dueDay()+' de cada mês'):'')+line('Primeira parcela',val('primeira_parcela')?date(val('primeira_parcela')):'')+(schedule?line('Total',money(schedule.total_cents)):'')}
 const dr=discReason();if(dr)pay=line('Desconto',PCT+'% no valor total por ser '+DISC_TEXT[dr]+(dr==='ex_aluno'?'':' (documento enviado; a equipe confere)'))+pay;
 $('#review').innerHTML=`<div class="enroll-turma-check"><p class="eyebrow">CONFIRA A TURMA</p><h3>${esc(t.name)}</h3><p>${esc(t.shift)} · ${esc(t.schedule)}<br>De ${date(t.starts_on)} a ${date(t.ends_on)} · ${esc(t.unit)}</p><p class="enroll-turma-ask">É esta a turma em que você quer estudar? Se não for, <button type="button" class="enroll-fix" data-go="1">troque aqui</button>${course?' ou <a href="/#cursos">volte aos cursos</a>':''}.</p></div>`
  +block('Aluno',2,personLines(a))
  +(g?block('Responsável financeiro',3,personLines(g)+line('Parentesco',val('responsavel.parentesco'))):'')
  +block('Pagamento',4,pay);
 $('#turma-ok-name').textContent=t.name}
function show(n){step=n;$('[data-step-label="3"]').hidden=!minor();document.querySelectorAll('[data-step]').forEach(s=>s.hidden=Number(s.dataset.step)!==n);document.querySelectorAll('[data-step-label]').forEach(li=>{li.classList.toggle('current',Number(li.dataset.stepLabel)===n);li.classList.toggle('done',Number(li.dataset.stepLabel)<n)});$('#back').hidden=n===1;$('#next').textContent=n===5?'Confirmar e enviar':'Continuar';errorBox.hidden=true;
 if(n===3)drawGuardian();if(n===4){drawPayment();checkExAluno().then(()=>{if(step===4)drawPayment()})}if(n===5)drawReview();form.querySelector(`[data-step="${n}"] h2`)?.scrollIntoView({behavior:'smooth',block:'start'})}
function check(n){
 if(n===1&&!turma())return 'Escolha a turma.';
 const missing=box=>[...box.querySelectorAll('[required]')].find(i=>!i.value.trim());
 if(n===2){const m=missing(form.querySelector('[data-step="2"]'));if(m)return 'Preencha: '+m.closest('label').firstChild.textContent+'.'}
 if(n===3){const m=missing($('#guardian-fields'));if(m)return 'Preencha: '+m.closest('label').firstChild.textContent+'.';if(!val('responsavel.parentesco'))return 'Informe o parentesco com o aluno.'}
 if(n===4){const m=method();if(!m)return 'Escolha Pix ou cartão de crédito.';if(proof.sending)return 'Espere o documento terminar de enviar.';if(!exAluno&&proof.kind&&!proofDone()){if(proof.kind==='dependente_militar'&&!KIN.includes(proof.kin))return 'Diga qual é o seu vínculo com o militar.';if(proof.kind==='dependente_militar'&&proof.mil.trim().split(/\s+/).length<2)return 'Digite o nome completo do militar.';return 'Envie '+(proof.kind==='dependente_militar'?'a frente, o verso e o documento do vínculo':'a frente e o verso do documento')+', ou marque Não no desconto de militar.'}
  if(m==='pix'){if(!pixN())return 'Escolha em quantas vezes no Pix.';const d=dueDay();if(pixN()>1&&!val('vencimento'))return 'Escolha o dia de vencimento.';if(pixN()>1&&!(d>=1&&d<=28))return 'Digite um dia de vencimento de 1 a 28.';if(!val('primeira_parcela'))return 'Escolha a data da primeira parcela.'}
  else{if(!cardOpt())return 'Escolha à vista ou em quantas vezes.';const v=val('visita');if(!v)return 'Escolha o dia da visita para passar o cartão.';if(v<meta.hoje||v>meta.visita_ate)return 'Escolha um dia de hoje até '+date(meta.visita_ate)+'.';if([0,6].includes(new Date(v+'T12:00:00Z').getUTCDay()))return 'O cartão só é passado em dia útil, de segunda a sexta. Escolha outro dia.'}}
 if(n===5&&!form.elements.namedItem('turma_ok').checked)return 'Confirme que a turma está certa.';
 if(n===5&&!form.elements.namedItem('aceite').checked)return 'Para enviar, aceite a política de privacidade.';
 return '';
}
// "Corrigir" volta para a etapa; ao avançar de novo, a pessoa passa pelas seguintes até a confirmação.
form.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){form.elements.namedItem('turma_ok').checked=false;show(Number(b.dataset.go))}});
form.addEventListener('change',e=>{const n=e.target.name;
 if(n==='turma'){schedule=null;form.querySelectorAll('[name=forma],[name=parcelas_pix],[name=parcelas_cartao]').forEach(i=>i.checked=false)}
 // A data da primeira parcela pode mudar o máximo de vezes do Pix: redesenha a coluna.
 if(n==='forma'||n==='parcelas_pix'||n==='vencimento'||n==='parcelas_cartao'||n==='primeira_parcela'){drawPayment()}
 if(n==='vencimento_outro')drawSchedule();
 if(n==='desconto_tipo'){proof={kind:e.target.value,docs:{},sending:'',kin:'',mil:''};drawPayment()}
 if(e.target.dataset&&e.target.dataset.part)sendProof(e.target.files&&e.target.files[0],e.target.dataset.part);
 if(n==='parentesco_militar'){proof.kin=e.target.value;drawPayment()}
 if(n==='nome_militar'){proof.mil=e.target.value;drawPayment()}
 errorBox.hidden=true});
// Maior de idade pula a etapa 3 nos dois sentidos.
const skip=n=>n===3&&!minor();
$('#back').addEventListener('click',()=>show(skip(step-1)?step-2:step-1));
form.addEventListener('submit',async e=>{e.preventDefault();const problem=check(step);if(problem)return fail(problem);if(step<5)return show(skip(step+1)?step+2:step+1);
 const btn=$('#next');btn.disabled=true;btn.textContent='Enviando…';
 try{const m=method(),body={turma:turma().id,plano:plano().id,forma:m,aluno:person('aluno'),responsavel:needsGuardian()?{...person('responsavel'),parentesco:val('responsavel.parentesco')}:undefined,aceite:true,website:val('website')};
  if(!exAluno&&proofDone())Object.assign(body,{desconto:proof.kind,documentos:Object.fromEntries(Object.entries(proof.docs).map(([k,v])=>[k,v.id])),...(proof.kind==='dependente_militar'?{parentesco:proof.kin,nome_militar:proof.mil.trim()}:{})});
  if(m==='pix')Object.assign(body,{parcelas_pix:pixN(),vencimento:pixN()>1?dueDay():undefined,primeira_parcela:val('primeira_parcela')});else Object.assign(body,{parcelas_cartao:Number(val('parcelas_cartao')),visita:val('visita')});
  const r=await api('matricula',body);
  if(window.getepeTrack)window.getepeTrack('matricula',{forma:m});
  form.hidden=true;$('.enroll-steps').hidden=true;$('#done-message').textContent=r.message||'Matrícula recebida.';
  $('#done-pay').textContent=m==='cartao'?'No dia '+date(val('visita'))+', venha à unidade passar o cartão.':'Pague as parcelas por Pix; a primeira vence em '+date(val('primeira_parcela'))+'.';
  $('#done').hidden=false;$('#done').focus()}
 catch(err){fail(err.message);btn.disabled=false;btn.textContent='Confirmar e enviar'}});
$('[data-step-label="3"]').hidden=true;$('#back').hidden=true;
api('matricula/opcoes').then(r=>{turmas=r.turmas;meta={hoje:r.hoje,pix_primeira_ate:r.pix_primeira_ate,visita_ate:r.visita_ate};drawClasses()}).catch(e=>{$('#classes').innerHTML='<p>'+esc(e.message)+'</p>'});
})();
