// Matrícula: oferece as apostilas da turma (loja virtual do GETEPÊ) enquanto a pessoa se matricula.
// A compra é feita na loja; nada daqui entra no formulário nem nos dados da matrícula.
(()=>{
 const box=document.getElementById('enroll-extras');if(!box)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const safeUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'?x.href:''}catch{return ''}};
 const names={apmbb:'APMBB · Barro Branco',espcex:'EsPCEx',epcar:'EPCAr / Colégio Naval','soldado-pm':'Soldado PMESP',portugues:'Gramática',gramatica:'Gramática',matematica:'Matemática',biologia:'Biologia'};
 const alias={portugues:'gramatica'};
 const params=new URLSearchParams(location.search);
 let course=(params.get('curso')||'').toLowerCase().replace(/[^a-z0-9-]/g,''),items=[],turmas=null;
 const draw=()=>{
  const key=alias[course]||course;
  const list=items.filter(r=>r.visible!==false&&String(r.fields?.Turma||'').toLowerCase()===key&&safeUrl(r.fields?.['Link de compra']));
  if(!list.length){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;
  box.innerHTML=`<p class="eyebrow">COMPLETE SUA PREPARAÇÃO</p><h2>Apostilas da turma ${esc(names[course]||'')}</h2><p>Garanta o material da sua turma na loja virtual do GETEPÊ. A compra é feita na loja, separada da matrícula.</p><div class="enroll-extras-grid">${list.map(r=>{const f=r.fields||{},img=safeUrl(f.Imagem);return `<a class="enroll-extra" href="${esc(safeUrl(f['Link de compra']))}" target="_blank" rel="noopener noreferrer">${img?`<img src="${esc(img)}" alt="${esc(f['Texto alternativo']||r.title||'')}" loading="lazy" width="120" height="120">`:''}<span><b>${esc(r.title||'Apostila')}</b><small>${esc(f.Descrição||'')}</small><em>Comprar na loja ↗︎</em></span></a>`}).join('')}</div>`;
 };
 fetch('/api/content',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{items=j?.data?.apostilas||[];draw()}).catch(()=>{});
 // Sem curso no endereço: usa o curso da turma escolhida.
 document.addEventListener('change',e=>{
  if(e.target?.name!=='turma'||params.get('curso'))return;
  const id=e.target.value;
  const pick=()=>{const t=(turmas||[]).find(t=>t.id===id);if(t?.course_id){course=String(t.course_id).toLowerCase();draw()}};
  if(turmas)return pick();
  fetch('/api/matricula/opcoes',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{turmas=j?.turmas||j?.data?.turmas||[];pick()}).catch(()=>{});
 });
})();
