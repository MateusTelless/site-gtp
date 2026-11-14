(()=>{
const campaignNow=()=>window.__GTEClock?window.__GTEClock.server+performance.now()-window.__GTEClock.started:Date.now();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{s=String(s||'').trim();return !/[<>"'\\\r\n]/.test(s)&&/^(https:\/\/|\/(?!\/)|#|[a-zA-Z0-9_-]+[.][a-zA-Z0-9]+)/.test(s)?s:''};
 if(typeof courses!=='undefined'){
  const originalCourses=JSON.parse(JSON.stringify(courses)),originalSlides=JSON.parse(JSON.stringify(slides)),originalBooklets=JSON.parse(JSON.stringify(booklets));
  window.GTEOriginal={courses:originalCourses,slides:originalSlides,booklets:originalBooklets};
  window.applyManagedContent=function(){let data;try{data=window.__GTECONTENT}catch{}if(!data?.__siteEditorVersion)return;
   const get=(r,k,fallback='')=>r.fields?.[k]??fallback;
   courses.splice(0,courses.length,...(data.cursos||[]).filter(r=>r.visible).map(r=>{const old=originalCourses.find(c=>c.id===r.id)||{type:'recorded',tone:'navy',symbol:'GTP'};return {...old,id:esc(r.id),name:esc(r.title),short:esc(get(r,'Nome curto',r.title)),description:esc(get(r,'Metodologia',old.description)),type:get(r,'Tipo de curso',old.type)==='live'?'live':'recorded',date:esc(get(r,'Início',old.date)),time:esc(get(r,'Dias e horários',old.time)),end:esc(get(r,'Encerramento',old.end)),image:safeUrl(get(r,'Imagem do produto'),true),imageAlt:esc(get(r,'Texto alternativo da imagem',r.title)),price:esc(get(r,'Preço e parcelamento')),hotmartUrl:get(r,'Link Hotmart',old.hotmartUrl||''),whatsapp:get(r,'WhatsApp de matrícula',old.whatsapp||''),inclusions:esc(get(r,'O que está incluído')),program:esc(get(r,'Programa de estudos')),freeVideo:safeUrl(get(r,'Link da aula gratuita'))};}));
   if(data.carrossel)slides.splice(0,slides.length,...data.carrossel.filter(r=>r.visible&&(!r.fields['Exibir a partir de']||campaignNow()>=Date.parse(r.fields['Exibir a partir de']+'-03:00'))&&(!r.fields['Exibir até']||campaignNow()<Date.parse(r.fields['Exibir até']+'-03:00'))).map(r=>({label:esc(get(r,'Chamada superior')),title:esc(r.title).replace(/\n/g,'<br>'),copy:esc(get(r,'Descrição')),action:esc(get(r,'Texto do botão')),href:safeUrl(get(r,'Destino do botão','#cursos')),image:safeUrl(get(r,'Imagem'),true),alt:esc(get(r,'Texto alternativo',r.title)),full:get(r,'Formato')==='banner'})));
   if(data.__storeCatalogV1&&data.apostilas)booklets.splice(0,booklets.length,...data.apostilas.filter(r=>r.visible).map(r=>[r.id,esc(r.title),{classId:get(r,'Turma',originalBooklets.find(b=>b[0]===r.id)?.[2]?.classId??(originalCourses.find(c=>c.type==='live'&&(r.id===c.id||r.id.startsWith(c.id+'-')))?.id||'')),image:safeUrl(get(r,'Imagem'),true),description:esc(get(r,'Descrição')),price:esc(get(r,'Preço e parcelamento')),url:safeUrl(get(r,'Link de compra','https://www.lojavirtualgetepe.com.br/cadernos'))}]));
   slide=slides.length?Math.min(slide,slides.length-1):0;
  };
  const originalRoute=route;window.removeEventListener('hashchange',originalRoute);
  route=function(){window.applyManagedContent();originalRoute();window.GTEVisual?.render(window.__GTECONTENT);};window.addEventListener('hashchange',route);
  if(new URLSearchParams(location.search).has('editorPreview')){carouselPaused=true;stopCarousel();}
  let campaignState='';setInterval(()=>{const rows=window.__GTECONTENT?.carrossel;if(!rows)return;const state=rows.map(r=>r.visible&&(!r.fields['Exibir a partir de']||campaignNow()>=Date.parse(r.fields['Exibir a partir de']+'-03:00'))&&(!r.fields['Exibir até']||campaignNow()<Date.parse(r.fields['Exibir até']+'-03:00'))).join(',');if(state!==campaignState){campaignState=state;route()}},1000);
  route();
 }
})();
