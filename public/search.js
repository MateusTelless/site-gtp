(()=>{
 const header=document.querySelector('body > header');
 if(!header)return;
 header.classList.add('search-header');
 const form=document.createElement('form');
 form.className='site-search';form.setAttribute('role','search');
 form.innerHTML='<div class="search-field"><input type="search" aria-label="Pesquisar no site" placeholder="O que você procura?" autocomplete="off" aria-controls="site-search-results" aria-expanded="false"><button type="submit" aria-label="Buscar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></div><div id="site-search-results" class="search-results" hidden><p class="search-status" role="status" aria-live="polite"></p><ul></ul></div>';
 header.querySelector('.brand').after(form);
 const input=form.querySelector('input'),panel=form.querySelector('.search-results'),status=form.querySelector('.search-status'),list=form.querySelector('ul');
 const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let index=[];
 const ready=fetch('/search-index.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{index=data}).catch(()=>{index=[{title:'Nossos cursos',url:'/#cursos',text:'Cursos ao vivo gravados presenciais online'},{title:'Apostilas',url:'/#apostilas',text:'Gramática cadernos material'},{title:'Contato',url:'/#contato',text:'Telefone WhatsApp atendimento'}]});
 const close=()=>{panel.hidden=true;input.setAttribute('aria-expanded','false')};
 async function search(){
  await ready;
  const query=normalize(input.value.trim());
  if(!query){close();return;}
  let items=index;
  if(typeof courses!=='undefined')items=[...index.filter(r=>r.kind!=='course'),...courses.map(c=>({title:c.name,url:'/#curso/'+c.id,text:c.description+' '+(c.type==='live'?'presencial online ao vivo':'online gravado'),kind:'course'}))];
  const words=query.split(/\s+/);
  const matches=items.filter(r=>words.every(w=>normalize(r.title+' '+r.text).includes(w))).sort((a,b)=>Number(normalize(b.title).includes(query))-Number(normalize(a.title).includes(query))).slice(0,8);
  list.replaceChildren();
  for(const r of matches){const li=document.createElement('li'),a=document.createElement('a'),label=document.createElement('small');a.href=r.url;a.textContent=r.title;label.textContent=r.kind==='course'?'Curso':'Página do site';a.append(label);li.append(a);list.append(li)}
  status.textContent=matches.length?'Resultados para “'+input.value.trim()+'”':'Nenhum resultado. Tente “APMBB”, “Gramática” ou “apostilas”.';
  panel.hidden=false;input.setAttribute('aria-expanded','true');
 }
 input.addEventListener('input',search);
 input.addEventListener('focus',()=>{if(input.value.trim())search()});
 form.addEventListener('submit',async e=>{e.preventDefault();await search();list.querySelector('a')?.focus()});
 form.addEventListener('keydown',e=>{if(e.key==='Escape'){close();input.focus();close()}if(e.key==='ArrowDown'||e.key==='ArrowUp'){const links=[...list.querySelectorAll('a')];if(panel.hidden||!links.length)return;e.preventDefault();const current=links.indexOf(document.activeElement);links[(current+(e.key==='ArrowDown'?1:-1)+links.length)%links.length].focus()}});
 list.addEventListener('click',close);
 document.addEventListener('click',e=>{if(!form.contains(e.target))close()});
 form.addEventListener('focusout',()=>setTimeout(()=>{if(!form.contains(document.activeElement))close()},0));
})();
