// Medição do site (Google Analytics 4 e Pixel da Meta), só depois que a pessoa aceita os cookies.
// Os IDs não ficam no código: vêm de /api/medicao (variáveis GA4_ID e META_PIXEL_ID no Cloudflare).
// Sem IDs configurados, nada aparece e nada é carregado.
(()=>{'use strict';
 const KEY='getepe_cookies_v1',W=window,D=document;
 let ids=null,ligado=false;
 const ler=()=>{try{return localStorage.getItem(KEY)}catch(e){return null}};
 const gravar=v=>{try{localStorage.setItem(KEY,v)}catch(e){}};
 // Eventos do site -> nomes do Google e da Meta.
 const MAPA={
  aula_teste:['generate_lead','Lead'],
  newsletter:['sign_up','CompleteRegistration'],
  whatsapp:['contato_whatsapp','Contact'],
  matricula_iniciada:['begin_checkout','InitiateCheckout'],
  matricula:['purchase','Purchase']
 };
 function carregar(src){const s=D.createElement('script');s.async=true;s.src=src;D.head.appendChild(s)}
 function ligar(){
  if(ligado||!ids)return;ligado=true;
  if(ids.ga4){
   W.dataLayer=W.dataLayer||[];W.gtag=function(){W.dataLayer.push(arguments)};
   W.gtag('js',new Date());W.gtag('config',ids.ga4,{anonymize_ip:true});
   carregar('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ids.ga4));
  }
  if(ids.pixel&&!W.fbq){
   const f=W.fbq=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments)};
   if(!W._fbq)W._fbq=f;f.push=f;f.loaded=true;f.version='2.0';f.queue=[];
   carregar('https://connect.facebook.net/en_US/fbevents.js');
   W.fbq('init',ids.pixel);W.fbq('track','PageView');
  }
 }
 // Uso: getepeTrack('aula_teste',{curso:'matematica'}). Sem aceite, não faz nada.
 W.getepeTrack=function(evento,dados){
  if(!ligado)return;const m=MAPA[evento];if(!m)return;const d=Object.assign({},dados||{});
  if(d.valor){d.value=Number(d.valor);d.currency='BRL';delete d.valor}
  try{if(W.gtag&&ids.ga4)W.gtag('event',m[0],d)}catch(e){}
  try{if(W.fbq&&ids.pixel)W.fbq('track',m[1],d.value?{value:d.value,currency:'BRL'}:{})}catch(e){}
 };
 function aviso(){
  if(D.getElementById('getepe-cookies'))return;
  const st=D.createElement('style');
  st.textContent='#getepe-cookies{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:660px;margin:0 auto;background:#061b35;color:#fff;border:1px solid rgba(216,180,106,.55);border-top:3px solid #d3b476;border-radius:14px;padding:16px 18px;box-shadow:0 12px 32px rgba(0,0,0,.35);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-wrap:wrap;gap:12px;align-items:center}#getepe-cookies p{margin:0;flex:1 1 280px;color:#fff}#getepe-cookies a{color:#d3b476}#getepe-cookies .b{display:flex;gap:8px;flex-wrap:wrap}#getepe-cookies button{font:inherit;font-weight:700;border-radius:8px;padding:9px 18px;cursor:pointer}#getepe-cookies .s{background:#d3b476;color:#061b35;border:1px solid #d3b476}#getepe-cookies .s:hover{background:#e6c886}#getepe-cookies .n{background:#fff;color:#061b35;border:1px solid #fff}#getepe-cookies .n:hover{background:#eef2f7}';
  D.head.appendChild(st);
  const box=D.createElement('div');box.id='getepe-cookies';box.setAttribute('role','dialog');box.setAttribute('aria-label','Aviso de cookies');
  box.innerHTML='<p>Usamos cookies para medir as visitas e melhorar nossos anúncios. Você pode recusar e continuar navegando normalmente. <a href="/privacidade/">Saiba mais</a>.</p><div class="b"><button type="button" class="n">Recusar</button><button type="button" class="s">Aceitar</button></div>';
  box.querySelector('.s').onclick=()=>{gravar('sim');box.remove();ligar()};
  box.querySelector('.n').onclick=()=>{gravar('nao');box.remove()};
  D.body.appendChild(box);
 }
 // Cliques em links do WhatsApp e início do formulário de matrícula.
 D.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(a&&/(^|\/\/)(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|(www\.)?whatsapp\.com)\//i.test(a.href))W.getepeTrack('whatsapp',{link:a.href.split('?')[0]})},true);
 let iniciou=false;D.addEventListener('input',e=>{if(iniciou||!location.pathname.startsWith('/matricula'))return;if(e.target.closest&&e.target.closest('form')){iniciou=true;W.getepeTrack('matricula_iniciada',{})}},true);
 // Permite reabrir o aviso (ex.: link "Preferências de cookies" no rodapé).
 W.getepeCookies=function(){try{localStorage.removeItem(KEY)}catch(e){}if(ids&&(ids.ga4||ids.pixel))aviso()};
 fetch('/api/medicao',{credentials:'omit'}).then(r=>r.ok?r.json():null).then(j=>{
  if(!j||!(j.ga4||j.pixel))return;ids=j;const v=ler();
  if(v==='sim')ligar();else if(v!=='nao'){D.readyState==='loading'?D.addEventListener('DOMContentLoaded',aviso):aviso()}
 }).catch(()=>{});
})();
