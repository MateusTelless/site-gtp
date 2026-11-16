(()=>{'use strict';
// Matrícula em 5 passos. O servidor refaz todas as validações e calcula as parcelas; aqui só guiamos a pessoa.
const $=s=>document.querySelector(s),form=$('#enroll'),errorBox=$('#enroll-error');
const money=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=d=>d.split('-').reverse().join('/');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const methodNames={pix:'Pix',cartao:'Cartão de crédito'};
const UF='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
let turmas=[],step=1,schedule=null;
const fields=[['nome','Nome completo','text','name',120],['cpf','CPF','text','off',14,'numeric'],['nascimento','Data de nascimento','date','bday'],['email','E-mail','email','email',254],['celular','Celular com DDD','tel','tel',16,'tel'],['cep','CEP','text','postal-code',9,'numeric'],['logradouro','Rua ou avenida','text','address-line1',150],['numero','Número','text','off',20],['complemento','Complemento (opcional)','text','address-line2',80],['bairro','Bairro','text','off',80],['cidade','Cidade','text','address-level2',80],['uf','Estado','select','address-level1']];
document.querySelectorAll('[data-person]').forEach(box=>{const who=box.dataset.person;box.innerHTML=fields.map(([k,label,type,auto,max,mode])=>`<label>${label}${type==='select'?`<select name="${who}.${k}" autocomplete="${auto}"><option value="">Selecione</option>${UF.map(u=>`<option${u==='SP'?' selected':''}>${u}</option>`).join('')}</select>`:`<input name="${who}.${k}" type="${type}" autocomplete="${who==='aluno'?auto:'off'}"${max?` maxlength="${max}"`:''}${mode?` inputmode="${mode}"`:''}${k==='complemento'?'':' required'}>`}</label>`).join('')});
const val=n=>(form.elements.namedItem(n)?.value||'').trim();
const person=who=>Object.fromEntries(fields.map(([k])=>[k,val(who+'.'+k)]));
const selected=()=>{const t=turmas.find(x=>x.id===val('turma'));return {turma:t,plano:t?.planos.find(p=>p.id===val('plano'))}};
function age(birth){if(!birth)return 99;const b=new Date(birth+'T12:00:00'),n=new Date();return n.getFullYear()-b.getFullYear()-((n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))?1:0)}
// A etapa do responsável financeiro só existe para aluno menor de 18 anos.
const minor=()=>age(val('aluno.nascimento'))<18,needsGuardian=minor;
function fail(text){errorBox.textContent=text;errorBox.hidden=false;errorBox.focus?.()}
async function api(path,data){const r=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Não foi possível concluir. Tente novamente.');return b}

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
  if(courseName){$('.guide-intro h1').textContent='Matrícula · '+courseName;title.textContent='Sua turma e o plano'}
  const open=turmas.filter(t=>t.vagas);
  if(!turmas.length){box.innerHTML=`<p>A matrícula pelo site${courseName?' para '+esc(courseName):''} ainda não está aberta. Fale com a equipe pelo <a href="${esc(whatsapp('Olá! Quero me matricular'+(courseName?' na turma de '+courseName:'')+'.'))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a> ou veja <a href="/matricula/">todas as turmas abertas</a>.</p>`;$('#next').hidden=true;return}
  if(turmas.length===1){const t=turmas[0];
   box.innerHTML=`<p class="enroll-chosen-label">Você está se matriculando em</p>`+classCard(t,`<input type="radio" name="turma" value="${esc(t.id)}"${t.vagas?' checked':' disabled'}>`).replace('enroll-option','enroll-option enroll-chosen');
   if(!t.vagas)box.innerHTML+=`<p>As vagas desta turma acabaram. Fale com a equipe pelo <a href="${esc(whatsapp('Olá! Quero entrar na lista de espera da turma '+t.name+'.'))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>.</p>`;
   drawPlans();return}
  title.textContent='Escolha o período e o plano';
  box.setAttribute('aria-label','Períodos');
  box.innerHTML=`<p class="enroll-chosen-label">Este curso tem ${turmas.length} períodos. Escolha o seu:</p>`+turmas.map(t=>classCard(t,`<input type="radio" name="turma" value="${esc(t.id)}"${t.vagas?'':' disabled'}>`,true)).join('');
  return;
 }
 box.innerHTML=turmas.length?turmas.map(t=>classCard(t,`<input type="radio" name="turma" value="${esc(t.id)}"${t.vagas?'':' disabled'}>`)).join(''):`<p>Nenhuma turma com matrícula aberta pelo site agora. Fale com a equipe pelo <a href="${esc(whatsapp('Olá! Quero informações para matrícula.'))}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>.</p>`;
}
function drawPlans(){const {turma}=selected();$('#plans').innerHTML=turma?'<h3>Plano de pagamento</h3>'+turma.planos.map(p=>`<label class="enroll-option"><input type="radio" name="plano" value="${esc(p.id)}"${turma.planos.length===1?' checked':''}><b>${esc(p.name)}</b><span>${p.enrollment_fee_cents?'Matrícula de '+money(p.enrollment_fee_cents)+' + ':''}${p.installment_count}x de ${money(p.installment_cents)}</span><span>Total: ${money(p.enrollment_fee_cents+p.installment_count*p.installment_cents)}</span></label>`).join(''):''}
function drawPayment(){const {plano}=selected();if(!plano)return;const day=val('vencimento');$('#due-day').innerHTML='<option value="">Selecione</option>'+plano.due_days.map(d=>`<option value="${d}"${String(d)===day?' selected':''}>Dia ${d}</option>`).join('');const m=form.querySelector('[name=forma]:checked')?.value;$('#methods').innerHTML=plano.methods.map(k=>`<label class="enroll-check"><input type="radio" name="forma" value="${k}"${k===m?' checked':''}> ${methodNames[k]||k}</label>`).join('')}
async function drawSchedule(){schedule=null;const {plano}=selected(),day=Number(val('vencimento'));if(!plano||!day){$('#schedule').innerHTML='<tr><td colspan="3">Escolha o dia de vencimento.</td></tr>';return}
 try{schedule=await api('matricula/simular',{plano:plano.id,vencimento:day});$('#schedule').innerHTML=schedule.parcelas.map(r=>`<tr><td>${r.kind==='matricula'?'Matrícula':r.number+'ª mensalidade'}</td><td>${date(r.due_on)}</td><td>${money(r.amount_cents)}</td></tr>`).join('')+`<tr><th colspan="2">Total</th><th>${money(schedule.total_cents)}</th></tr>`}catch(e){fail(e.message)}}
function drawGuardian(){$('#guardian-why').textContent='Como o aluno tem menos de 18 anos, o responsável legal preenche os dados dele, assina o contrato e recebe as cobranças.'}
// Confirmação: a turma em destaque (com a pergunta "é esta mesmo?") e tudo o que foi preenchido, com atalho para corrigir cada parte.
function drawReview(){const {turma,plano}=selected(),a=person('aluno'),g=needsGuardian()?person('responsavel'):null;
 const line=(k,v)=>v?`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`:'';
 const addr=p=>[p.logradouro+', '+p.numero+(p.complemento?' – '+p.complemento:''),p.bairro,p.cidade+'/'+p.uf,'CEP '+p.cep].join(' · ');
 const block=(title,step,body)=>`<div class="enroll-review-block"><div class="enroll-review-head"><h3>${title}</h3><button type="button" class="enroll-fix" data-go="${step}">Corrigir</button></div><dl class="guide-facts">${body}</dl></div>`;
 const personLines=p=>line('Nome',p.nome)+line('CPF',p.cpf)+line('Nascimento',p.nascimento?date(p.nascimento):'')+line('E-mail',p.email)+line('Celular',p.celular)+line('Endereço',addr(p));
 $('#review').innerHTML=`<div class="enroll-turma-check"><p class="eyebrow">CONFIRA A TURMA</p><h3>${esc(turma.name)}</h3><p>${esc(turma.shift)} · ${esc(turma.schedule)}<br>De ${date(turma.starts_on)} a ${date(turma.ends_on)} · ${esc(turma.unit)}</p><p class="enroll-turma-ask">É esta a turma em que você quer estudar? Se não for, <button type="button" class="enroll-fix" data-go="1">troque aqui</button>${course?' ou <a href="/#cursos">volte aos cursos</a>':''}.</p></div>`
  +block('Aluno',2,personLines(a))
  +(g?block('Responsável financeiro',3,personLines(g)+line('Parentesco',val('responsavel.parentesco'))):'')
  +block('Pagamento',4,line('Plano',plano.name)+line('Vencimento','Dia '+val('vencimento')+' de cada mês')+line('Forma de pagamento',methodNames[val('forma')]||'')+(schedule?line('Total',money(schedule.total_cents)+' em '+schedule.parcelas.length+' parcela(s)'):''));
 $('#turma-ok-name').textContent=turma.name}
function show(n){step=n;$('[data-step-label="3"]').hidden=!minor();document.querySelectorAll('[data-step]').forEach(s=>s.hidden=Number(s.dataset.step)!==n);document.querySelectorAll('[data-step-label]').forEach(li=>{li.classList.toggle('current',Number(li.dataset.stepLabel)===n);li.classList.toggle('done',Number(li.dataset.stepLabel)<n)});$('#back').hidden=n===1;$('#next').textContent=n===5?'Enviar matrícula':'Continuar';errorBox.hidden=true;
 if(n===3)drawGuardian();if(n===4){drawPayment();drawSchedule()}if(n===5)drawReview();form.querySelector(`[data-step="${n}"] h2`)?.scrollIntoView({behavior:'smooth',block:'start'})}
function check(n){
 if(n===1&&!selected().plano)return 'Escolha a turma e o plano.';
 const missing=box=>[...box.querySelectorAll('[required]')].find(i=>!i.value.trim());
 if(n===2){const m=missing(form.querySelector('[data-step="2"]'));if(m)return 'Preencha: '+m.closest('label').firstChild.textContent+'.'}
 if(n===3){const m=missing($('#guardian-fields'));if(m)return 'Preencha: '+m.closest('label').firstChild.textContent+'.';if(!val('responsavel.parentesco'))return 'Informe o parentesco com o aluno.'}
 if(n===4){if(!val('vencimento'))return 'Escolha o dia de vencimento.';if(!form.querySelector('[name=forma]:checked'))return 'Escolha a forma de pagamento.'}
 if(n===5&&!form.elements.namedItem('turma_ok').checked)return 'Confirme que a turma está certa.';
 if(n===5&&!form.elements.namedItem('aceite').checked)return 'Para enviar, aceite a política de privacidade.';
 return '';
}
// "Corrigir" volta para a etapa; ao avançar de novo, a pessoa passa pelas seguintes até a confirmação.
form.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){form.elements.namedItem('turma_ok').checked=false;show(Number(b.dataset.go))}});
form.addEventListener('change',e=>{if(e.target.name==='turma'){drawPlans()}if(e.target.name==='vencimento')drawSchedule();errorBox.hidden=true});
// Maior de idade pula a etapa 3 nos dois sentidos.
const skip=n=>n===3&&!minor();
$('#back').addEventListener('click',()=>show(skip(step-1)?step-2:step-1));
form.addEventListener('submit',async e=>{e.preventDefault();const problem=check(step);if(problem)return fail(problem);if(step<5)return show(skip(step+1)?step+2:step+1);
 const btn=$('#next');btn.disabled=true;btn.textContent='Enviando…';
 try{const {turma,plano}=selected(),r=await api('matricula',{turma:turma.id,plano:plano.id,vencimento:Number(val('vencimento')),forma:val('forma'),aluno:person('aluno'),responsavel:needsGuardian()?{...person('responsavel'),parentesco:val('responsavel.parentesco')}:undefined,aceite:true,website:val('website')});
  form.hidden=true;$('.enroll-steps').hidden=true;$('#done-message').textContent=r.message||'Matrícula recebida.';$('#done').hidden=false;$('#done').focus()}
 catch(err){fail(err.message);btn.disabled=false;btn.textContent='Enviar matrícula'}});
$('[data-step-label="3"]').hidden=true;$('#back').hidden=true;
api('matricula/opcoes').then(r=>{turmas=r.turmas;drawClasses()}).catch(e=>{$('#classes').innerHTML='<p>'+esc(e.message)+'</p>'});
})();
