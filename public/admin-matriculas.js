(()=>{'use strict';
// Áreas de matrícula e financeiro do painel. Convive com admin-panel.js: os botões data-tab="mat-*" são desenhados aqui.
// O servidor confere o perfil em cada rota; esconder botões aqui é só para a tela ficar limpa.
const $=s=>document.querySelector(s),panel=$('#panel');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>((c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),day=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'—',when=d=>d?new Date(d).toLocaleString('pt-BR'):'—';
const toCents=s=>{s=String(s||'').replace(/[R$\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Math.round(parseFloat(s)*100);return Number.isFinite(n)?n:NaN};
const STATUS={aguardando_assinatura:'Aguardando assinatura',aguardando_pagamento:'Aguardando pagamento',aguardando_biometria:'Aguardando biometria',ativa:'Ativa',encerrada:'Encerrada',cancelada:'Cancelada'};
const PARCEL={aberta:'Em aberto',vencida:'Vencida',paga:'Paga',cancelada:'Cancelada'};
const METHOD={pix:'Pix',cartao:'Cartão',dinheiro:'Dinheiro',transferencia:'Transferência'};
const ROLE={admin:'Administrador',secretaria:'Secretaria',financeiro:'Financeiro',consulta:'Consulta'};
const AGING={ate_15:'Até 15 dias',de_16_a_30:'16 a 30 dias',de_31_a_60:'31 a 60 dias',mais_de_60:'Mais de 60 dias'};
let me=null,tab=null,classes=[];
const can=(...roles)=>me&&roles.includes(me.role);
async function api(path,data){const r=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Não foi possível concluir.');return b}
function message(text){const m=$('#message');m.textContent=text;m.hidden=false;clearTimeout(message.t);message.t=setTimeout(()=>m.hidden=true,6000)}
const heading=(title,copy)=>`<div data-mat><h1>${title}</h1><p class="sub">${copy}</p></div>`;
const pl=(n,one,many)=>`${n} ${n===1?one:many}`;
const options=(map,value,blank)=>(blank!==undefined?`<option value="">${blank}</option>`:'')+Object.entries(map).map(([k,v])=>`<option value="${k}"${k===value?' selected':''}>${esc(v)}</option>`).join('');
const classOptions=(value,blank='Todas as turmas')=>`<option value="">${blank}</option>`+classes.map(c=>`<option value="${esc(c.id)}"${c.id===value?' selected':''}>${esc(c.name)}</option>`).join('');
async function loadClasses(){classes=(await api('admin/turmas')).turmas}

// Matrículas: contagem por turma (só conta como efetivada quem assinou o contrato) e agenda por dia.
const spDay=iso=>iso?new Date(iso).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}):'';
const todaySP=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],WEEK=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const shiftMonth=(m,n)=>{let [y,mo]=m.split('-').map(Number);mo+=n;while(mo>12){mo-=12;y++}while(mo<1){mo+=12;y--}return y+'-'+String(mo).padStart(2,'0')};
const longDay=d=>new Date(d+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
const agenda={month:todaySP().slice(0,7),by:'recebida',day:''};
async function drawEnrollments(){
 await loadClasses();
 panel.innerHTML=heading('Matrículas','A agenda mostra as matrículas de cada dia. A contagem por turma só considera efetivada a matrícula com contrato assinado.')+`
  <h2>Contagem por turma</h2><div id="m-count"><p>Carregando…</p></div>
  <h2>Agenda</h2><div class="toolbar m-agenda-bar"><div class="actions"><button data-m-month="-1" aria-label="Mês anterior">‹</button><strong id="m-month-label"></strong><button data-m-month="1" aria-label="Próximo mês">›</button><button data-m-month="0">Hoje</button></div>
  <label>Mostrar no calendário<select id="m-by"><option value="recebida">Dia em que a matrícula chegou</option><option value="efetivada"${agenda.by==='efetivada'?' selected':''}>Dia em que o contrato foi assinado</option></select></label></div>
  <div id="m-cal" class="m-cal"></div>
  <div class="toolbar"><label>Situação<select id="m-status">${options(STATUS,'','Todas')}</select></label><label>Turma<select id="m-class">${classOptions('')}</select></label><label>Buscar pelo nome<input id="m-q" type="search" maxlength="80"></label><button data-m="search">Filtrar</button></div>
  <div id="m-agenda"></div><div id="m-detail"></div>`;
 await loadAgenda();
}
async function loadAgenda(){
 const data=await api('admin/matriculas/agenda?mes='+agenda.month);
 const [y,m]=agenda.month.split('-').map(Number);$('#m-month-label').textContent=MONTHS[m-1]+' de '+y;
 // Um retângulo por turma: efetivadas em destaque e a barra de vagas (efetivadas cheias, contratos pendentes em tom claro).
 const meter=c=>{if(!c.seats)return '<p class="m-delta">Sem limite de vagas</p>';const w=v=>Math.min(100,Math.round(v/c.seats*1000)/10),a=w(c.efetivadas),b=Math.min(w(c.aguardando_assinatura),100-a);
  return `<svg class="m-meter" focusable="false" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${c.efetivadas} efetivadas e ${c.aguardando_assinatura} aguardando assinatura, de ${c.seats} vagas"><rect width="100" height="8" rx="4" fill="#e3e9f0"/>${b?`<rect x="${a}" width="${b}" height="8" fill="#a9bccf"/>`:''}${a?`<rect width="${a}" height="8" rx="${a>=100?4:0}" fill="#082649"/>`:''}</svg><p class="m-delta">${c.vagas_livres===0?`<b>Lotada</b>, ${pl(c.seats,'vaga','vagas')}`:`${pl(c.vagas_livres,'vaga livre','vagas livres')} de ${c.seats}`}</p>`};
 $('#m-count').innerHTML=(data.turmas.length?`<div class="m-tiles">${data.turmas.map(c=>`<div class="m-tile m-class${c.status!=='aberta'?' closed':''}"><span class="m-label">${esc(c.name)}</span><span class="m-value">${c.efetivadas}</span><span class="m-delta">${c.efetivadas===1?'efetivada':'efetivadas'}, ${c.efetivadas_mes} em ${MONTHS[m-1]}</span>${meter(c)}<dl class="m-breakdown"><div><dt>Aguardando assinatura</dt><dd>${c.aguardando_assinatura}</dd></div><div><dt>Aguardando pagamento</dt><dd>${c.aguardando_pagamento}</dd></div><div><dt>Aguardando biometria</dt><dd>${c.aguardando_biometria}</dd></div><div><dt>Ativas</dt><dd>${c.ativas}</dd></div><div><dt>Canceladas</dt><dd>${c.canceladas}</dd></div></dl><span class="m-delta">${esc(c.status==='aberta'?'Turma aberta':c.status==='fechada'?'Turma fechada':'Turma encerrada')}, começa em ${day(c.starts_on)}</span></div>`).join('')}</div>`:'<p>Nenhuma turma cadastrada.</p>')+'<p class="sub"><span class="m-key dark"></span> efetivadas (contrato assinado) <span class="m-key light"></span> aguardando assinatura, que já seguram a vaga.</p>';
 const first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate(),today=todaySP(),key=agenda.by==='efetivada'?'efetivadas':'recebidas';
 let cells=WEEK.map(w=>`<div class="m-cal-head">${w}</div>`).join('')+'<div class="m-cal-empty"></div>'.repeat(first);
 for(let d=1;d<=days;d++){const iso=agenda.month+'-'+String(d).padStart(2,'0'),c=data.dias.find(x=>x.dia===iso),n=c?c[key]:0;
  cells+=`<button class="m-cal-day${iso===today?' today':''}${iso===agenda.day?' selected':''}${n?' has':''}" data-m-day="${iso}" aria-label="${d} de ${MONTHS[m-1]}: ${c?c.recebidas+' recebida(s), '+c.efetivadas+' efetivada(s)':'nenhuma matrícula'}"><span>${d}</span>${c?`<small>${c.recebidas?c.recebidas+' recebida'+(c.recebidas>1?'s':''):''}${c.recebidas&&c.efetivadas?'<br>':''}${c.efetivadas?c.efetivadas+' efetivada'+(c.efetivadas>1?'s':''):''}</small>`:''}</button>`}
 $('#m-cal').innerHTML=cells;
 await listEnrollments();
}
async function listEnrollments(){
 const [y,m]=agenda.month.split('-').map(Number),last=agenda.month+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0');
 const p=new URLSearchParams({situacao:$('#m-status').value,turma:$('#m-class').value,q:$('#m-q').value.trim(),por:agenda.by,de:agenda.day||agenda.month+'-01',ate:agenda.day||last});
 const rows=(await api('admin/matriculas?'+p)).matriculas,col=agenda.by==='efetivada'?'contract_signed_at':'created_at';
 const groups=[];for(const r of rows){const d=spDay(r[col]);let g=groups.find(x=>x.day===d);if(!g)groups.push(g={day:d,rows:[]});g.rows.push(r)}
 const head=`<tr><th>Aluno</th><th>Turma e plano</th><th>Situação</th><th>Contrato</th>${can('consulta')?'':'<th>Financeiro</th><th>Biometria</th>'}<th>Chegou às</th><th></th></tr>`;
 const line=r=>`<tr><td>${esc(r.full_name)}<small>Código ${esc(r.codigo)}${r.cpf?', CPF '+esc(r.cpf):''}</small></td><td>${esc(r.class_name)}${r.plan_name?`<small>${esc(r.plan_name)}</small>`:''}</td><td><span class="badge${r.status==='ativa'?'':' muted'}">${esc(STATUS[r.status]||r.status)}</span>${r.needs_review?'<small>Revisar cadastro</small>':''}</td><td>${r.contract_signed_at?'Assinado em '+day(spDay(r.contract_signed_at)):'Pendente'}</td>${can('consulta')?'':`<td>${r.overdue?`<span class="badge muted">${r.overdue} vencida(s)</span>`:'Em dia'}</td><td>${r.biometrics_registered?'Cadastrada':'Pendente'}</td>`}<td>${new Date(r.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td><td>${can('consulta')?'':`<button data-m-open="${esc(r.id)}">Abrir</button>`}</td></tr>`;
 const raw=agenda.day?longDay(agenda.day):MONTHS[Number(agenda.month.slice(5))-1]+' de '+agenda.month.slice(0,4),title=raw[0].toUpperCase()+raw.slice(1);
 $('#m-agenda').innerHTML=`<p><strong>${esc(title)}:</strong> ${pl(rows.length,'matrícula','matrículas')} ${agenda.by==='efetivada'?(rows.length===1?'efetivada':'efetivadas'):(rows.length===1?'recebida':'recebidas')}${agenda.day?' <button data-m-day="">Ver o mês inteiro</button>':''}</p>`+(groups.map(g=>`<h3 class="m-day-title">${esc(longDay(g.day))} (${g.rows.length})</h3><div class="table-wrap"><table><thead>${head}</thead><tbody>${g.rows.map(line).join('')}</tbody></table></div>`).join('')||'<p>Nenhuma matrícula neste período com esses filtros.</p>');
}
const fmtCpf=c=>String(c||'').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'),fmtPhone=p=>String(p||'').replace(/^(\d{2})(\d{4,5})(\d{4})$/,'($1) $2-$3'),fmtCep=c=>String(c||'').replace(/^(\d{5})(\d{3})$/,'$1-$2');
const personBlock=(title,p,extra='')=>p?`<div class="box"><h3>${title}</h3><p><b>${esc(p.full_name)}</b>${extra}<br>CPF ${esc(fmtCpf(p.cpf))} · nascimento ${day(p.birth_date)}<br>${esc(p.email)} · ${esc(fmtPhone(p.phone))}<br>${esc(p.street)}, ${esc(p.number)}${p.complement?' · '+esc(p.complement):''} · ${esc(p.district)} · ${esc(p.city)}/${esc(p.state)} · CEP ${esc(fmtCep(p.cep))}</p></div>`:'';
async function openEnrollment(id){
 const d=await api('admin/matriculas/detalhe?id='+encodeURIComponent(id)),m=d.matricula,edit=can('admin','secretaria');
 const fin=d.financeiro.parcelas?parcelTable(d.financeiro.parcelas,true):`<p>${d.financeiro.em_dia?'Em dia.':d.financeiro.vencidas+' parcela(s) vencida(s).'} O detalhe das parcelas fica com o financeiro.</p>`;
 const review=d.enviado?`<div class="hint"><b>Cadastro já existia.</b> O formulário público não altera a ficha. Confira os dados enviados nesta matrícula e aplique se estiverem certos.</div>${personBlock('Dados enviados pelo aluno',{...d.enviado.aluno,cpf:d.aluno.cpf})}${edit?`<div class="actions"><button data-m-apply="${esc(d.aluno.id)}">Aplicar dados enviados ao cadastro</button><button data-m-reviewed="${esc(m.id)}">Marcar como revisada</button></div>`:''}`:'';
 $('#m-detail').innerHTML=`<h2>${esc(d.aluno.full_name)}, ${esc(m.class_name)}</h2><p class="sub">Código da matrícula na planilha: <b>${esc(m.codigo)}</b></p><p>${esc(m.plan_name)} · vencimento dia ${m.due_day} · ${esc(METHOD[m.payment_method]||m.payment_method)} · recebida em ${when(m.created_at)}</p>${review}
  <div class="box"><h3>Contrato: ${m.contract_signed_at?'assinado em '+day(spDay(m.contract_signed_at))+' · matrícula efetivada':'aguardando assinatura'}</h3>${edit&&m.status!=='cancelada'?`<div class="toolbar"><label>${m.contract_signed_at?'Corrigir a data da assinatura':'Data em que o contrato foi assinado'}<input id="m-signed-on" type="date" max="${todaySP()}" value="${m.contract_signed_at?spDay(m.contract_signed_at):todaySP()}"></label><button data-m-signed="${esc(m.id)}">${m.contract_signed_at?'Salvar data':'Registrar contrato assinado'}</button></div><p class="sub">Enquanto não houver integração com a assinatura eletrônica, registre aqui. A matrícula passa a contar como efetivada na turma.</p>`:''}</div>
  <div class="box"><h3>Situação: ${esc(STATUS[m.status]||m.status)}</h3>${m.status_reason?`<p>Motivo: ${esc(m.status_reason)}</p>`:''}${edit?`<div class="toolbar"><label>Nova situação<select id="m-new-status">${options(STATUS,m.status)}</select></label><label>Motivo (obrigatório para cancelar ou encerrar)<input id="m-reason" maxlength="300"></label><button data-m-status="${esc(m.id)}">Salvar situação</button></div>`:''}
  <p>Biometria: <b>${m.biometrics_registered?'cadastrada em '+when(m.biometrics_at):'pendente'}</b> ${edit?`<button data-m-bio="${esc(m.id)}" data-done="${m.biometrics_registered?'0':'1'}">${m.biometrics_registered?'Desmarcar':'Marcar biometria cadastrada'}</button>`:''}</p></div>
  ${personBlock('Aluno',d.aluno)}${d.responsaveis.map(g=>personBlock('Responsável',g,` · ${esc(g.relationship)}`)).join('')}${d.pagador.id!==d.aluno.id&&!d.responsaveis.some(g=>g.id===d.pagador.id)?personBlock('Pagador',d.pagador):''}
  <div class="box"><h3>Financeiro</h3>${fin}</div>`;
 $('#m-detail').scrollIntoView({behavior:'smooth'});
 $('#m-detail').dataset.id=id;$('#m-detail').dataset.submitted=d.enviado?JSON.stringify(d.enviado.aluno):'';
}

// Parcelas (usada na matrícula e no financeiro)
function parcelTable(rows,inEnrollment){
 const actions=can('admin','financeiro');
 return `<div class="table-wrap"><table><thead><tr><th>Parcela</th>${inEnrollment?'':'<th>Pagador e turma</th>'}<th>Vencimento</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${rows.map(r=>{const sit=r.situacao||(r.status==='aberta'&&r.due_on<new Date().toISOString().slice(0,10)?'vencida':r.status);const paid=r.paid_on||(r.payments&&r.payments[0]?.paid_on);const how=r.paid_method||(r.payments&&r.payments[0]?.method);
  return `<tr><td>${r.kind==='matricula'?'Matrícula':r.number+'ª mensalidade'}</td>${inEnrollment?'':`<td>${esc(r.full_name)}<small>${esc(r.class_name)}</small></td>`}<td>${day(r.due_on)}</td><td>${money(r.amount_cents)}</td><td><span class="badge${sit==='paga'?'':' muted'}">${PARCEL[sit]||sit}</span>${paid?`<small>${day(paid)} · ${esc(METHOD[how]||how||'')}</small>`:''}${r.cancel_reason?`<small>${esc(r.cancel_reason)}</small>`:''}</td><td>${actions&&r.status==='aberta'?`<button data-m-pay="${esc(r.id)}" data-amount="${r.amount_cents}">Dar baixa</button> <button class="danger" data-m-cancel="${esc(r.id)}">Cancelar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="6">Nenhuma parcela.</td></tr>'}</tbody></table></div>`;
}
function payDialog(id,amount){
 let d=$('#m-pay-dialog');if(!d){d=document.createElement('dialog');d.id='m-pay-dialog';document.body.append(d)}
 d.innerHTML=`<form id="m-pay-form"><div class="dialog-top"><h2>Dar baixa manual</h2></div><p>Use para pagamento confirmado fora do serviço de cobrança (por exemplo, no balcão). Fica registrado com o seu e-mail.</p><label>Valor recebido (R$)<input name="valor" required value="${(amount/100).toFixed(2).replace('.',',')}"></label><label>Forma<select name="forma">${options(METHOD,'pix')}</select></label><label>Data do pagamento<input name="data" type="date" required value="${new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})}"></label><label>Observação<input name="obs" maxlength="300" placeholder="Ex.: comprovante conferido"></label><div class="actions"><button type="button" id="m-pay-back">Voltar</button><button class="primary" type="submit">Confirmar baixa</button></div></form>`;
 d.showModal();$('#m-pay-back').addEventListener('click',()=>d.close());
 $('#m-pay-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),valor=toCents(f.get('valor'));if(!(valor>0))return message('Valor inválido.');
  const btn=e.currentTarget.querySelector('[type=submit]');btn.disabled=true;
  try{await api('admin/financeiro/baixa',{parcela:id,valor,forma:f.get('forma'),data:f.get('data'),obs:f.get('obs')});d.close();message('Baixa registrada.');await refresh()}catch(err){message(err.message);btn.disabled=false}});
}

// Turmas e planos
async function drawClasses(){
 await loadClasses();const edit=can('admin','secretaria');
 panel.innerHTML=heading('Turmas e planos','Turmas marcadas para o site aparecem na página de matrícula com os planos ativos.')+(edit?`<div class="toolbar"><button data-m-class-form="">Nova turma</button></div>`:'')+`<div id="m-form"></div><div class="records">${classes.map(c=>`<article class="record"><div><h3>${esc(c.name)} <span class="badge${c.status==='aberta'?'':' muted'}">${esc(c.status)}</span> ${c.public?'<span class="badge">No site</span>':'<span class="badge muted">Fora do site</span>'}</h3><p>${esc(c.exam)} · ${esc(c.unit)} · ${esc(c.shift)} · ${esc(c.schedule)} · ${day(c.starts_on)} a ${day(c.ends_on)} · ${c.taken} matrícula(s)${c.seats?' de '+c.seats+' vagas':''}</p>${c.planos.map(p=>`<p>• <b>${esc(p.name)}</b>${p.active?'':' (inativo)'}: ${p.enrollment_fee_cents?'matrícula '+money(p.enrollment_fee_cents)+' + ':''}${p.installment_count}x ${money(p.installment_cents)} a partir de ${esc(p.first_due_month)} · dias ${p.due_days.join(', ')} · ${p.methods.map(m=>METHOD[m]).join(', ')}${edit?` <button data-m-plan-form="${esc(p.id)}" data-class="${esc(c.id)}">Editar plano</button>`:''}</p>`).join('')||'<p>Sem planos.</p>'}</div>${edit?`<div class="actions"><button data-m-class-form="${esc(c.id)}">Editar turma</button><button data-m-plan-form="" data-class="${esc(c.id)}">Novo plano</button></div>`:''}</article>`).join('')||'<p>Nenhuma turma cadastrada.</p>'}</div>`;
}
function classForm(id){const c=classes.find(x=>x.id===id)||{status:'aberta',seats:0,public:0};
 $('#m-form').innerHTML=`<form class="box" id="m-class"><h2>${id?'Editar turma':'Nova turma'}</h2><label>Nome<input name="nome" required maxlength="120" value="${esc(c.name)}"></label><label>Concurso<input name="concurso" required maxlength="80" value="${esc(c.exam)}"></label><label>Unidade<input name="unidade" required maxlength="80" value="${esc(c.unit||'São Paulo')}"></label><label>Turno<input name="turno" required maxlength="40" value="${esc(c.shift)}"></label><label>Curso do site (o botão "Matricule-se" desse curso abre esta turma)<select name="curso_site">${options({'':'Nenhum',apmbb:'APMBB · Barro Branco',epcar:'EPCAR / Colégio Naval',espcex:'EsPCEx',...(c.course_id&&!['apmbb','epcar','espcex'].includes(c.course_id)?{[c.course_id]:c.course_id}:{})},c.course_id||'')}</select></label><label>Código na planilha de alunos (coluna ESCOLA, ex.: BSET27)<input name="codigo_planilha" maxlength="20" pattern="[A-Za-z0-9]*" value="${esc(c.sheet_code||'')}"></label><label>Dias e horário<input name="horario" required maxlength="120" value="${esc(c.schedule)}"></label><label>Início<input name="inicio" type="date" required value="${esc(c.starts_on)}"></label><label>Fim (o acesso termina nesta data)<input name="fim" type="date" required value="${esc(c.ends_on)}"></label><label>Vagas (0 = sem limite)<input name="vagas" type="number" min="0" max="2000" value="${c.seats}"></label><label>Situação<select name="situacao">${options({aberta:'Aberta',fechada:'Fechada',encerrada:'Encerrada'},c.status)}</select></label><label class="check"><input type="checkbox" name="site"${c.public?' checked':''}> Aceitar matrícula pelo site</label><div class="actions"><button type="button" data-m-close>Cancelar</button><button class="primary">Salvar turma</button></div></form>`;
 $('#m-class').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('admin/turmas',{id:id||undefined,nome:f.get('nome'),concurso:f.get('concurso'),unidade:f.get('unidade'),turno:f.get('turno'),codigo_planilha:f.get('codigo_planilha'),curso_site:f.get('curso_site'),horario:f.get('horario'),inicio:f.get('inicio'),fim:f.get('fim'),vagas:Number(f.get('vagas')),situacao:f.get('situacao'),site:f.get('site')==='on'});message('Turma salva.');await drawClasses()}catch(err){message(err.message)}});
 $('#m-form').scrollIntoView({behavior:'smooth'});
}
function planForm(id,classId){const p=classes.flatMap(c=>c.planos).find(x=>x.id===id)||{enrollment_fee_cents:0,enrollment_fee_due_days:3,installment_count:12,installment_cents:0,due_days:[5,10,15],methods:['pix','cartao'],active:1};
 const locked=p.used>0;
 $('#m-form').innerHTML=`<form class="box" id="m-plan"><h2>${id?'Editar plano':'Novo plano'}</h2>${locked?'<p class="hint">Este plano já tem matrículas: só o nome e se está ativo podem mudar. Para outro valor ou outras datas, crie um plano novo e desative este.</p>':''}<label>Nome<input name="nome" required maxlength="80" value="${esc(p.name)}" placeholder="Ex.: 12 parcelas"></label><label>Taxa de matrícula (R$, 0 se não houver)<input name="taxa" value="${(p.enrollment_fee_cents/100).toFixed(2).replace('.',',')}"${locked?' disabled':''}></label><label>Prazo para pagar a taxa (dias após a matrícula)<input name="prazo" type="number" min="0" max="60" value="${p.enrollment_fee_due_days}"${locked?' disabled':''}></label><label>Número de mensalidades<input name="parcelas" type="number" min="1" max="36" value="${p.installment_count}"${locked?' disabled':''}></label><label>Valor de cada mensalidade (R$)<input name="valor" value="${(p.installment_cents/100).toFixed(2).replace('.',',')}"${locked?' disabled':''}></label><label>Mês da primeira mensalidade<input name="mes" type="month" required value="${esc(p.first_due_month)}"${locked?' disabled':''}></label><label>Dias de vencimento que o aluno pode escolher (1 a 28, separados por vírgula)<input name="dias" value="${p.due_days.join(', ')}"${locked?' disabled':''}></label><fieldset><legend>Formas de pagamento</legend>${['pix','cartao'].map(m=>`<label class="check"><input type="checkbox" name="forma" value="${m}"${p.methods.includes(m)?' checked':''}${locked?' disabled':''}> ${METHOD[m]}</label>`).join('')}</fieldset><label class="check"><input type="checkbox" name="ativo"${p.active?' checked':''}> Plano ativo</label><div class="actions"><button type="button" data-m-close>Cancelar</button><button class="primary">Salvar plano</button></div></form>`;
 $('#m-plan').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);
  const body=locked?{id,turma:p.class_id,nome:f.get('nome'),taxa_matricula:p.enrollment_fee_cents,prazo_taxa:p.enrollment_fee_due_days,parcelas:p.installment_count,valor_parcela:p.installment_cents,primeiro_mes:p.first_due_month,dias_vencimento:p.due_days,formas:p.methods,ativo:f.get('ativo')==='on'}
   :{id:id||undefined,turma:classId,nome:f.get('nome'),taxa_matricula:toCents(f.get('taxa')),prazo_taxa:Number(f.get('prazo')),parcelas:Number(f.get('parcelas')),valor_parcela:toCents(f.get('valor')),primeiro_mes:f.get('mes'),dias_vencimento:String(f.get('dias')).split(',').map(s=>Number(s.trim())).filter(Boolean),formas:f.getAll('forma'),ativo:f.get('ativo')==='on'};
  try{await api('admin/planos',body);message('Plano salvo.');await drawClasses()}catch(err){message(err.message)}});
 $('#m-form').scrollIntoView({behavior:'smooth'});
}

// Financeiro
async function drawFinance(){
 await loadClasses();
 panel.innerHTML=heading('Financeiro','Parcelas geradas pelas matrículas: o que vence, o que entrou e quem está em atraso.')+'<div id="f-summary"><p>Carregando…</p></div>'+`<h2>Parcelas</h2><div class="toolbar"><label>Situação<select id="f-status">${options({vencida:'Vencidas',aberta:'A vencer',paga:'Pagas',cancelada:'Canceladas'},'vencida','Todas')}</select></label><label>Mês do vencimento<input id="f-month" type="month"></label><label>Turma<select id="f-class">${classOptions('')}</select></label><button data-m="parcels">Filtrar</button><button data-m="csv">Exportar planilha</button></div><div id="f-parcels"></div>`;
 const s=await api('admin/financeiro/resumo');
 $('#f-summary').innerHTML=`<div class="cards"><div class="card"><span>A receber neste mês</span><strong>${money(s.a_receber_mes.cents)}</strong><span>${s.a_receber_mes.n} parcela(s)</span></div><div class="card"><span>Recebido neste mês</span><strong>${money(s.recebido_mes.cents)}</strong><span>${s.recebido_mes.n} pagamento(s)</span></div><div class="card"><span>Vencido</span><strong>${money(s.vencido.cents)}</strong><span>${s.vencido.n} parcela(s) · ${s.vencido.people} matrícula(s)</span></div></div>
  <div class="table-wrap"><table><caption>Atraso por tempo</caption><thead><tr><th>Faixa</th><th>Parcelas</th><th>Valor</th></tr></thead><tbody>${s.atraso.map(a=>`<tr><td>${AGING[a.faixa]}</td><td>${a.n}</td><td>${money(a.cents)}</td></tr>`).join('')||'<tr><td colspan="3">Nenhuma parcela vencida.</td></tr>'}</tbody></table></div>
  <div class="table-wrap"><table><caption>Projeção por mês de vencimento</caption><thead><tr><th>Mês</th><th>Previsto</th><th>Pago</th><th>Em aberto</th></tr></thead><tbody>${s.projecao.map(p=>`<tr><td>${p.mes.split('-').reverse().join('/')}</td><td>${money(p.previsto_cents)}</td><td>${money(p.pago_cents)}</td><td>${money(p.aberto_cents)}</td></tr>`).join('')||'<tr><td colspan="4">Sem parcelas futuras.</td></tr>'}</tbody></table></div>`;
 await listParcels();
}
let lastParcels=[];
async function listParcels(){const p=new URLSearchParams({situacao:$('#f-status').value,mes:$('#f-month').value,turma:$('#f-class').value});lastParcels=(await api('admin/financeiro/parcelas?'+p)).parcelas;$('#f-parcels').innerHTML=`<p>${lastParcels.length} parcela(s) · ${money(lastParcels.reduce((s,r)=>s+r.amount_cents,0))}</p>`+parcelTable(lastParcels,false)}
function csv(){const cell=v=>'"'+String(v??'').replace(/^(?:\s*[=+@\-]|[\t\r\n])/,"'$&").replace(/"/g,'""')+'"';const rows=[['Pagador','Turma','Parcela','Vencimento','Valor (R$)','Situação','Pago em','Forma'],...lastParcels.map(r=>[r.full_name,r.class_name,r.kind==='matricula'?'Matrícula':r.number,day(r.due_on),(r.amount_cents/100).toFixed(2).replace('.',','),PARCEL[r.situacao]||r.situacao,r.paid_on?day(r.paid_on):'',METHOD[r.paid_method]||''])];
 const u=URL.createObjectURL(new Blob(['﻿'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='getepe-parcelas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

// Alunos: busca e ficha do aluno (dados, matrículas, financeiro e histórico), no lugar da Central do Aluno do Lexus.
const student={q:'',late:false,id:'',view:'dados',data:null};
const ageOf=b=>{if(!b)return '';const [y,m,d]=b.split('-').map(Number),t=todaySP().split('-').map(Number);return t[0]-y-((t[1]<m||(t[1]===m&&t[2]<d))?1:0)};
async function drawStudents(){
 panel.innerHTML=heading('Alunos','Pesquise pelo nome, CPF ou código para ver a situação do aluno: dados, matrículas, financeiro e histórico.')+`
  <form class="toolbar" id="s-search"><label class="s-q">Nome, CPF ou código<input id="s-q" type="search" maxlength="80" value="${esc(student.q)}" placeholder="Ex.: Maria, 123.456.789-09 ou A1B2C3D4" autocomplete="off"></label><label class="check"><input type="checkbox" id="s-late"${student.late?' checked':''}> Só quem tem parcela vencida</label><button class="primary">Buscar</button></form>
  <div id="s-list"></div><div id="s-card"></div>`;
 $('#s-search').addEventListener('submit',e=>{e.preventDefault();student.q=$('#s-q').value.trim();student.late=$('#s-late').checked;listStudents().catch(err=>message(err.message))});
 await listStudents();if(student.id)await openStudent(student.id);
}
async function listStudents(){
 const rows=(await api('admin/alunos?'+new URLSearchParams({q:student.q,atraso:student.late?'1':''}))).alunos,showMoney=can('admin','financeiro');
 $('#s-list').innerHTML=`<p>${pl(rows.length,'aluno encontrado','alunos encontrados')}${rows.length===500?' (mostrando os 500 primeiros; refine a busca)':''}</p><div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Situação</th>${can('consulta')?'':'<th>Financeiro</th>'}<th></th></tr></thead><tbody>${rows.map(r=>`<tr${r.id===student.id?' class="s-current"':''}><td>${esc(r.full_name)}<small>Código ${esc(r.codigo)}${r.cpf?' · CPF '+esc(r.cpf):''}</small></td><td>${esc(r.turmas||'Sem matrícula ativa')}</td><td>${r.situacao?`<span class="badge${r.situacao==='ativa'?'':' muted'}">${esc(STATUS[r.situacao]||r.situacao)}</span>`:'—'}</td>${can('consulta')?'':`<td>${r.vencidas?`<span class="badge muted">${pl(r.vencidas,'parcela vencida','parcelas vencidas')}</span>${showMoney?`<small>${money(r.vencido_cents)} em atraso</small>`:''}`:'Em dia'}${showMoney&&r.aberto_cents?`<small>${money(r.aberto_cents)} a receber</small>`:''}</td>`}<td>${can('consulta')?'':`<button data-s-open="${esc(r.id)}">Abrir</button>`}</td></tr>`).join('')||`<tr><td colspan="5">Nenhum aluno encontrado${student.q?' para “'+esc(student.q)+'”':''}.</td></tr>`}</tbody></table></div>`;
}
async function openStudent(id){student.id=id;student.data=await api('admin/alunos/ficha?id='+encodeURIComponent(id));drawStudentCard();$('#s-card').scrollIntoView({behavior:'smooth'})}
function drawStudentCard(){
 const d=student.data,a=d.aluno,v=student.view,f=d.financeiro.resumo,showMoney=can('admin','financeiro');
 const field=(k,val)=>`<div class="s-field"><span>${k}</span><b>${esc(val||'—')}</b></div>`;
 const late=f.vencidas>0;
 const views={dados:'Dados do aluno',matriculas:'Matrículas',financeiro:'Financeiro',...(d.historico?{historico:'Histórico'}:{})};
 let body='';
 if(v==='dados')body=`<div class="s-grid">${field('Nome',a.full_name)}${field('Código do aluno',a.codigo)}${field('Data de cadastro',day(a.cadastrado_em))}${field('Situação',a.status==='ativo'?'Ativo':'Inativo')}
   ${field('Celular',fmtPhone(a.phone))}${field('E-mail',a.email)}${field('Nascimento',day(a.birth_date))}${field('Idade',a.birth_date?ageOf(a.birth_date)+' anos':'')}
   ${field('CPF',fmtCpf(a.cpf))}${field('CEP',fmtCep(a.cep))}${field('Endereço',a.street)}${field('Número',a.number)}${field('Complemento',a.complement)}${field('Bairro',a.district)}${field('Cidade',a.city)}${field('Estado',a.state)}
   ${field('Dia de vencimento das parcelas',d.matriculas.find(m=>m.status!=='cancelada')?.due_day?'Dia '+d.matriculas.find(m=>m.status!=='cancelada').due_day:'')}${field('Biometria',a.biometrics_registered?'Cadastrada em '+day(a.biometrics_at):'Pendente')}${field('Número na catraca',a.catraca_numero?a.catraca_numero+(a.catraca_legado?' (do Secullum)':''):'Não definido: o aluno ainda não passa na catraca')}</div>
   ${can('admin','secretaria')?`<div class="actions"><button data-s-edit="${esc(a.id)}">Editar dados</button>${a.catraca_numero?`<button data-s-catraca="${esc(a.id)}" data-atual="${esc(a.catraca_numero)}">Alterar número da catraca</button>`:`<button class="primary" data-s-catraca="${esc(a.id)}">Gerar número da catraca</button>`}</div><div id="s-edit"></div>`:''}
   ${d.responsaveis.map(g=>personBlock('Responsável',g,` · ${esc(g.relationship)}`)).join('')}`;
 if(v==='matriculas')body=`<div class="table-wrap"><table><thead><tr><th>Turma</th><th>Plano</th><th>Situação</th><th>Contrato</th><th>Recebida em</th><th></th></tr></thead><tbody>${d.matriculas.map(m=>`<tr><td>${esc(m.class_name)}<small>${esc(m.shift)} · ${day(m.starts_on)} a ${day(m.ends_on)}</small></td><td>${esc(m.plan_name)}${showMoney&&m.total_cents?`<small>${money(m.total_cents)} · dia ${m.due_day} · ${esc(METHOD[m.payment_method]||m.payment_method)}</small>`:''}</td><td><span class="badge${m.status==='ativa'?'':' muted'}">${esc(STATUS[m.status]||m.status)}</span>${m.status_reason?`<small>${esc(m.status_reason)}</small>`:''}</td><td>${m.contract_signed_at?'Assinado em '+day(spDay(m.contract_signed_at)):'Pendente'}</td><td>${when(m.created_at)}<small>Código ${esc(m.codigo)}</small></td><td><button data-s-enroll="${esc(m.id)}">Abrir matrícula</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhuma matrícula.</td></tr>'}</tbody></table></div><div id="m-detail"></div>`;
 if(v==='financeiro')body=showMoney?`<div class="cards"><div class="card"><span>Contratado</span><strong>${money(f.contratado_cents)}</strong></div><div class="card"><span>Pago</span><strong>${money(f.pago_cents)}</strong></div><div class="card"><span>A receber</span><strong>${money(f.aberto_cents)}</strong>${f.proxima?`<span>Próxima: ${day(f.proxima.due_on)}, ${money(f.proxima.amount_cents)}</span>`:''}</div><div class="card${late?' s-late':''}"><span>Vencido</span><strong>${money(f.vencido_cents)}</strong><span>${pl(f.vencidas,'parcela','parcelas')}</span></div></div>${parcelTable(d.financeiro.parcelas,false)}`
  :`<p>${late?pl(f.vencidas,'parcela vencida','parcelas vencidas')+'.':'Em dia.'} Os valores e as parcelas ficam com o financeiro.</p>`;
 if(v==='historico')body=`<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${d.historico.map(r=>`<tr><td>${when(r.at)}</td><td>${esc(r.actor)}<small>${esc(ROLE[r.role]||r.role)}</small></td><td>${esc(r.action.replace(/_/g,' '))}<small>${esc(r.entity)}</small></td><td><small>${esc(JSON.stringify(r.detail)).slice(0,300)}</small></td></tr>`).join('')||'<tr><td colspan="4">Nada registrado.</td></tr>'}</tbody></table></div>`;
 $('#s-card').innerHTML=`<section class="s-card"><h2>${esc(a.full_name)} <small>Código ${esc(a.codigo)}</small> <span class="badge${late?' muted':''}">${late?pl(f.vencidas,'parcela vencida','parcelas vencidas'):'Em dia'}</span></h2>
  <div class="s-tabs" role="tablist">${Object.entries(views).map(([k,t])=>`<button role="tab" aria-selected="${k===v}" data-s-view="${k}">${t}</button>`).join('')}</div>${body}</section>`;
}
function studentEditForm(){const a=student.data.aluno,i=(n,label,val,attrs='')=>`<label>${label}<input name="${n}" value="${esc(val||'')}" ${attrs}></label>`;
 $('#s-edit').innerHTML=`<form class="box" id="s-edit-form"><h3>Editar dados do aluno</h3><p class="sub">O CPF não muda por aqui. A alteração fica registrada com o seu e-mail.</p><div class="s-grid">${i('nome','Nome completo',a.full_name,'required maxlength="120"')}${i('nascimento','Nascimento',a.birth_date,'type="date" required')}${i('email','E-mail',a.email,'type="email" required maxlength="254"')}${i('celular','Celular com DDD',a.phone,'required maxlength="16"')}${i('cep','CEP',a.cep,'required maxlength="9"')}${i('logradouro','Endereço',a.street,'required maxlength="150"')}${i('numero','Número',a.number,'required maxlength="20"')}${i('complemento','Complemento',a.complement,'maxlength="80"')}${i('bairro','Bairro',a.district,'required maxlength="80"')}${i('cidade','Cidade',a.city,'required maxlength="80"')}${i('uf','Estado (UF)',a.state,'required maxlength="2"')}</div><div class="actions"><button type="button" data-s-edit-close>Cancelar</button><button class="primary">Salvar</button></div></form>`;
 $('#s-edit-form').addEventListener('submit',async e=>{e.preventDefault();const dados=Object.fromEntries(new FormData(e.currentTarget));try{await api('admin/pessoas/editar',{id:a.id,dados});message('Dados do aluno salvos.');await openStudent(student.id)}catch(err){message(err.message)}});
}

// Equipe e registro
async function drawTeam(){
 const [t,l]=await Promise.all([api('admin/equipe'),api('admin/registro?limite=200')]);
 panel.innerHTML=heading('Equipe e registro','Perfil de cada conta autorizada e o registro de tudo o que foi visto ou alterado nos dados de alunos e no financeiro.')+`<div class="hint">Administrador: tudo. Secretaria: site, matrículas, turmas e biometria, sem ver as parcelas. Financeiro: parcelas, baixas e matrículas, sem editar o site. Consulta: só nome, turma e situação.</div><div class="table-wrap"><table><thead><tr><th>Conta</th><th>Perfil</th><th></th></tr></thead><tbody>${t.equipe.map(x=>`<tr><td>${esc(x.email)}</td><td><select data-role-for="${esc(x.email)}">${options(ROLE,x.role)}</select></td><td><button data-m-role="${esc(x.email)}">Salvar</button></td></tr>`).join('')}</tbody></table></div><p class="sub">Para incluir ou remover uma conta do painel, altere a lista ADMIN_EMAILS na configuração do site.</p>
  <h2>Registro de alterações</h2><div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${l.registro.map(r=>`<tr><td>${when(r.at)}</td><td>${esc(r.actor)}<small>${esc(ROLE[r.role]||r.role)}</small></td><td>${esc(r.action.replace(/_/g,' '))}<small>${esc(r.entity)} ${esc(String(r.entity_id).slice(0,8))}</small></td><td><small>${esc(JSON.stringify(r.detail)).slice(0,300)}</small></td></tr>`).join('')||'<tr><td colspan="4">Nada registrado ainda.</td></tr>'}</tbody></table></div>`;
}

// Resumo do dia: entra no topo da Visão geral (administrador e secretaria) ou é a própria visão geral (financeiro e consulta).
let summaryDay=todaySP(),siteTab=new URLSearchParams(location.search).get('secao')||'overview';
const addDay=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const tile=(label,value,extra='',cls='')=>`<div class="m-tile ${cls}"><span class="m-label">${label}</span><span class="m-value">${value}</span>${extra}</div>`;
function delta(now,before,isMoney){const d=now-before;if(!d)return '<span class="m-delta">Igual ao dia anterior</span>';const up=d>0,v=isMoney?money(Math.abs(d)):Math.abs(d);return `<span class="m-delta ${up?'up':'down'}">${up?'▲':'▼'} ${v} ${up?'a mais':'a menos'} que no dia anterior</span>`}
// O boletim: os dois números de matrículas do dia, numa faixa só. É o único elemento com cor forte do painel.
const bulletin=(when,m)=>`<div class="m-bulletin"><div><span class="m-big">${m.recebidas}</span><span class="m-what">${m.recebidas===1?'matrícula recebida':'matrículas recebidas'} ${when}</span>${delta(m.recebidas,m.recebidas_dia_anterior)}</div><div><span class="m-big">${m.efetivadas}</span><span class="m-what">${m.efetivadas===1?'matrícula efetivada':'matrículas efetivadas'} ${when}, com contrato assinado</span>${delta(m.efetivadas,m.efetivadas_dia_anterior)}</div></div>`;
function summaryHtml(s){
 const isToday=s.dia===s.hoje,when=isToday?'hoje':'no dia',m=s.matriculas,f=s.financeiro,alerts=[];
 if(m.assinatura_ha_mais_de_3_dias)alerts.push(`${pl(m.assinatura_ha_mais_de_3_dias,'contrato aguarda','contratos aguardam')} assinatura há mais de 3 dias.`);
 if(m.revisar_cadastro)alerts.push(`${pl(m.revisar_cadastro,'matrícula tem','matrículas têm')} cadastro para revisar.`);
 for(const c of s.turmas_quase_lotadas)alerts.push(`${esc(c.turma)} ${c.livres?'tem só '+pl(c.livres,'vaga livre','vagas livres')+' de '+c.vagas:'está lotada, com '+pl(c.vagas,'vaga','vagas')}.`);
 if(f&&f.vencido_hoje.n)alerts.push(`${money(f.vencido_hoje.cents)} vencidos em ${pl(f.matriculas_em_atraso,'matrícula','matrículas')}.`);
 const list=s.lista.length?`<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Turma</th><th>${when==='hoje'?'Hoje':'No dia'}</th><th>Situação</th></tr></thead><tbody>${s.lista.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(r.class_name)}</td><td>${r.efetivada_no_dia?'<span class="m-flag signed">Efetivada</span>':''}${r.recebida_no_dia?'<span class="m-flag new">Recebida</span>':''}</td><td>${esc(STATUS[r.status]||r.status)}</td></tr>`).join('')}</tbody></table></div>`:`<p class="sub">Nenhuma matrícula recebida ou efetivada ${when}.</p>`;
 return `<div class="m-summary-top"><h2>Resumo do dia</h2><div class="m-daynav"><button data-m-sday="-1" aria-label="Dia anterior">‹</button><strong>${esc(longDay(s.dia))}</strong><button data-m-sday="1" aria-label="Próximo dia"${isToday?' disabled':''}>›</button>${isToday?'':'<button data-m-sday="0">Hoje</button>'}</div></div>
  ${bulletin(when,m)}
  ${alerts.length?`<div class="m-alerts"><h3>Precisa de ação</h3><ul>${alerts.map(a=>`<li>${a}</li>`).join('')}</ul></div>`:''}
  <h3 class="m-group">Andamento das matrículas</h3>
  <div class="m-tiles">${tile('Aguardando assinatura',m.aguardando_assinatura,`<span class="m-delta">${m.assinatura_ha_mais_de_3_dias?pl(m.assinatura_ha_mais_de_3_dias,'parada','paradas')+' há mais de 3 dias':'Nenhuma parada há mais de 3 dias'}</span>`,m.assinatura_ha_mais_de_3_dias?'warn':'')}${tile('Aguardando biometria',m.aguardando_biometria,'<span class="m-delta">Pagamento confirmado, falta a digital</span>')}${tile('Cadastros para revisar',m.revisar_cadastro,`<span class="m-delta">${m.revisar_cadastro?'Dados enviados diferentes da ficha':'Nada para revisar'}</span>`,m.revisar_cadastro?'warn':'')}</div>
  ${list}${can('consulta')?'':`<p><button data-m-goto-agenda="${s.dia}">Abrir este dia na agenda</button></p>`}
  ${f?`<h3 class="m-group">Financeiro</h3><div class="m-tiles">${tile(`Recebido ${when}`,money(f.recebido.cents),`<span class="m-delta">${pl(f.recebido.n,'pagamento','pagamentos')}</span>`+delta(f.recebido.cents,f.recebido_dia_anterior.cents,true))}${tile(`Vence ${when}`,money(f.vence_no_dia.cents),`<span class="m-delta">${pl(f.vence_no_dia.n,'parcela em aberto','parcelas em aberto')}</span>`)}${tile('Vencido até hoje',money(f.vencido_hoje.cents),`<span class="m-delta">${f.vencido_hoje.n?pl(f.vencido_hoje.n,'parcela','parcelas')+' de '+pl(f.matriculas_em_atraso,'matrícula','matrículas'):'Ninguém em atraso'}</span>`,f.vencido_hoje.n?'warn':'')}</div>`:''}
  ${s.site?`<h3 class="m-group">Pelo site</h3><div class="m-tiles">${tile(`Pedidos de aula teste ${when}`,s.site.aula_teste)}${tile(`Cadastros na newsletter ${when}`,s.site.newsletter)}</div>`:''}`;
}
async function renderSummary(){const box=panel.querySelector('[data-mat-summary]');if(!box)return;try{const s=await api('admin/matriculas/resumo-dia?dia='+summaryDay);box.innerHTML=summaryHtml(s)}catch(e){box.innerHTML='<p>'+esc(e.message)+'</p>'}}
function ensureSummary(){if(tab||siteTab!=='overview'||!can('admin','secretaria')||panel.querySelector('[data-mat-summary]'))return;const cards=panel.querySelector('.cards');if(!cards)return;const box=document.createElement('section');box.className='m-summary';box.dataset.matSummary='';box.innerHTML='<p>Carregando o resumo do dia…</p>';cards.before(box);renderSummary()}
async function drawSummaryTab(){panel.innerHTML=heading('Visão geral','O que aconteceu no dia, com as matrículas em destaque.')+'<section class="m-summary" data-mat-summary><p>Carregando…</p></section>';await renderSummary()}

// Catraca: situação da ponte no PC do curso e últimas passagens, pelo nome do aluno.
// O visor mostra só "VER NA RECEPCAO"; o motivo aparece aqui, para a recepção saber o que resolver.
const MOTIVO={pagamento_atrasado:'Pagamento em atraso',matricula_inativa:'Sem matrícula ativa',codigo_duplicado:'Número repetido em dois alunos',nao_cadastrado:'Número sem aluno no painel'};
const PASSAGEM={liberado:['Liberado',''],giro:['Passou',''],negado:['Bloqueado','muted'],nao_cadastrado:['Não cadastrado','muted'],desistencia:['Liberado, não passou','muted']};
async function drawCatraca(){
 const d=await api('admin/catraca'),agora=Date.parse(d.agora);
 const ponte=p=>{const visto=Date.parse(p.visto_em),online=agora-visto<3*60000&&p.conectada;return `<div class="card${online?'':' s-late'}"><span>Catraca ${p.equipamento}</span><strong>${online?'Funcionando':agora-visto>=3*60000?'Sem sinal':'Ponte sem catraca'}</strong><span>Último sinal: ${when(p.visto_em)}</span>${p.pendentes?`<span>${pl(p.pendentes,'passagem','passagens')} esperando envio</span>`:''}</div>`};
 panel.innerHTML=heading('Catraca','Quem passou, quem foi bloqueado e se a catraca está conectada. A liberação segue a matrícula e o financeiro: quem fica em dia volta a passar em até 1 minuto.')+`
  <div class="cards">${d.pontes.map(ponte).join('')||'<div class="card s-late"><span>Catraca</span><strong>Ainda não conectada</strong><span>A ponte no PC do curso ainda não deu sinal.</span></div>'}</div>
  <div class="toolbar"><button data-m="catraca">Atualizar</button></div>
  <div class="table-wrap"><table><thead><tr><th>Quando</th><th>Aluno</th><th>Resultado</th></tr></thead><tbody>${d.acessos.map(r=>{const [t,cls]=PASSAGEM[r.resultado]||[r.resultado,'muted'];return `<tr><td>${when(r.data_hora)}</td><td>${r.full_name?esc(r.full_name):r.codigo?'Sem aluno com este número':'—'}${r.codigo?`<small>Nº ${esc(r.codigo)}</small>`:''}</td><td><span class="badge ${cls}">${t}</span>${r.motivo&&['negado','nao_cadastrado'].includes(r.resultado)?`<small>${esc(MOTIVO[r.motivo]||r.motivo)}</small>`:''}</td></tr>`}).join('')||'<tr><td colspan="3">Nenhuma passagem registrada ainda.</td></tr>'}</tbody></table></div>`;
}

const draws={'mat-resumo':drawSummaryTab,'mat-catraca':drawCatraca,'mat-matriculas':drawEnrollments,'mat-alunos':drawStudents,'mat-turmas':drawClasses,'mat-financeiro':drawFinance,'mat-equipe':drawTeam};
async function open(name){tab=name;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));try{await draws[name]()}catch(e){panel.innerHTML=heading('Não foi possível abrir',esc(e.message))}}
async function refresh(){if(tab==='mat-financeiro'){await drawFinance();return}
 if(tab==='mat-alunos'&&student.id){const open=$('#m-detail')?.dataset.id;await openStudent(student.id);if(open&&student.view==='matriculas')await openEnrollment(open);return}const id=$('#m-detail')?.dataset.id;if(tab==='mat-matriculas'){await loadAgenda();if(id)await openEnrollment(id)}}
// Se o painel do site redesenhar a área enquanto uma aba daqui está aberta (por exemplo, a mensagem de acesso negado), desenha de novo.
new MutationObserver(()=>{if(tab&&!panel.querySelector('[data-mat]'))open(tab);else ensureSummary()}).observe(panel,{childList:true});
// Fase de captura: marca a troca para uma aba do site antes de admin-panel.js redesenhar, para o observador acima não reabrir a aba anterior.
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.tab&&!draws[b.dataset.tab]){siteTab=b.dataset.tab;tab=null}},true);
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.mSday!==undefined){const n=Number(b.dataset.mSday),t=todaySP();summaryDay=n?addDay(summaryDay,n):t;if(summaryDay>t)summaryDay=t;await renderSummary()}
 if(b.dataset.mGotoAgenda){agenda.month=b.dataset.mGotoAgenda.slice(0,7);agenda.day=b.dataset.mGotoAgenda;agenda.by='recebida';await open('mat-matriculas')}
});
document.addEventListener('change',e=>{if(e.target.id==='m-by'&&tab==='mat-matriculas'){agenda.by=e.target.value;agenda.day='';loadAgenda().catch(err=>message(err.message))}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.tab){if(draws[b.dataset.tab])open(b.dataset.tab);else tab=null;return}
 if(!tab)return;
 try{
  if(b.dataset.m==='search')await listEnrollments();
  if(b.dataset.sOpen){student.view='dados';await openStudent(b.dataset.sOpen);await listStudents()}
  if(b.dataset.sView){student.view=b.dataset.sView;drawStudentCard()}
  if(b.dataset.sEnroll)await openEnrollment(b.dataset.sEnroll);
  if(b.dataset.sEdit)studentEditForm();
  if(b.dataset.sCatraca){let numero='';if(b.dataset.atual){numero=prompt('Novo número na catraca (só números). Deixe em branco para gerar o próximo livre.\nAtenção: a digital já gravada na catraca continua com o número antigo.',b.dataset.atual);if(numero===null)return}
   const r=await api('admin/alunos/catraca',{id:b.dataset.sCatraca,numero:numero.trim()});message('Número na catraca: '+r.numero+'. Use este número ao cadastrar a digital.');await openStudent(student.id)}
  if(b.dataset.m==='catraca')await drawCatraca();
  if('sEditClose' in b.dataset)$('#s-edit').innerHTML='';
  if(b.dataset.mMonth!==undefined){const n=Number(b.dataset.mMonth);agenda.month=n?shiftMonth(agenda.month,n):todaySP().slice(0,7);agenda.day='';await loadAgenda()}
  if(b.dataset.mDay!==undefined){agenda.day=b.dataset.mDay===agenda.day?'':b.dataset.mDay;await loadAgenda();$('#m-agenda').scrollIntoView({behavior:'smooth'})}
  if(b.dataset.mSigned){await api('admin/matriculas/contrato',{id:b.dataset.mSigned,data:$('#m-signed-on').value});message('Contrato registrado. A matrícula conta como efetivada na turma.');await refresh()}
  if(b.dataset.m==='parcels')await listParcels();
  if(b.dataset.m==='csv')csv();
  if(b.dataset.mOpen)await openEnrollment(b.dataset.mOpen);
  if(b.dataset.mStatus){await api('admin/matriculas/situacao',{id:b.dataset.mStatus,situacao:$('#m-new-status').value,motivo:$('#m-reason').value});message('Situação salva.');await refresh()}
  if(b.dataset.mBio){await api('admin/matriculas/biometria',{id:b.dataset.mBio,feito:b.dataset.done==='1'});message('Biometria atualizada.');await refresh()}
  if(b.dataset.mApply){await api('admin/pessoas/editar',{id:b.dataset.mApply,dados:JSON.parse($('#m-detail').dataset.submitted)});message('Cadastro atualizado com os dados enviados.');await refresh()}
  if(b.dataset.mReviewed){await api('admin/matriculas/revisada',{id:b.dataset.mReviewed});message('Matrícula marcada como revisada.');await refresh()}
  if(b.dataset.mPay)payDialog(b.dataset.mPay,Number(b.dataset.amount));
  if(b.dataset.mCancel){const motivo=prompt('Motivo do cancelamento desta parcela (fica registrado):');if(motivo){await api('admin/financeiro/cancelar-parcela',{parcela:b.dataset.mCancel,motivo});message('Parcela cancelada.');await refresh()}}
  if('mClassForm' in b.dataset)classForm(b.dataset.mClassForm);
  if('mPlanForm' in b.dataset)planForm(b.dataset.mPlanForm,b.dataset.class);
  if('mClose' in b.dataset)$('#m-form').innerHTML='';
  if(b.dataset.mRole){await api('admin/equipe',{email:b.dataset.mRole,perfil:document.querySelector(`[data-role-for="${CSS.escape(b.dataset.mRole)}"]`).value});message('Perfil salvo.');await drawTeam()}
 }catch(err){message(err.message)}
});
// Mostra só as áreas do perfil. Financeiro e consulta não editam o site, então abrem direto nas áreas novas.
api('admin/equipe/eu').then(r=>{me=r;const site=can('admin','secretaria');
 document.querySelectorAll('#nav [data-tab]').forEach(b=>{const t=b.dataset.tab;b.hidden=t==='mat-resumo'?site:t==='mat-financeiro'?!can('admin','financeiro'):t==='mat-equipe'?!can('admin'):t==='mat-catraca'?!site:t==='mat-turmas'?can('financeiro'):t.startsWith('mat-')?false:!site});
 if(!site)open('mat-resumo');else ensureSummary();
}).catch(()=>{});
})();
