// Campanha Black Friday do APMBB online. Fora do período (inicio/fim, horário de Brasília) nada aparece e o
// curso volta sozinho para o link normal da Hotmart. app.js usa GTP_CAMPANHA.linkDe() para trocar o link.
(function(){
 const C={
  id:'bf-apmbb-online-2026',
  curso:'apmbb',
  inicio:Date.parse('2026-11-23T00:00:00-03:00'),
  fim:Date.parse('2026-11-30T23:59:59-03:00'),
  url:'https://pay.hotmart.com/X108370961U?off=ynyxrea2',
  avista:'R$ 597',
  parcelado:'ou 12x de R$ 61,74 no cartão',
  validade:'30/11 às 23h59'
 };
 const ativa=()=>{const t=Date.now();return t>=C.inicio&&t<=C.fim};
 window.GTP_CAMPANHA={ativa,linkDe:id=>ativa()&&id===C.curso?C.url:'',texto:'Black Friday: '+C.avista+' à vista ('+C.parcelado.replace(/^ou /,'')+').'};
 if(!ativa()||/^\/admin/.test(location.pathname))return;
 const KEY='gtp-popup-'+C.id;
 try{if(localStorage.getItem(KEY))return}catch{}

 const css=`.bf-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(3,12,26,.62);display:grid;place-items:center;padding:16px;opacity:0;transition:opacity .25s}
.bf-backdrop.on{opacity:1}
.bf{position:relative;width:min(860px,100%);max-height:calc(100vh - 32px);overflow:auto;display:grid;grid-template-columns:1.05fr 1fr;border-radius:22px;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.45);font-family:"DM Sans",Arial,sans-serif;color:#082649;transform:translateY(12px);transition:transform .25s}
.bf-backdrop.on .bf{transform:none}
.bf-art{position:relative;overflow:hidden;background:radial-gradient(120% 90% at 30% 20%,#0d3566 0,#082649 38%,#061b35 100%);color:#fff;padding:38px 34px 34px;display:flex;flex-direction:column;justify-content:space-between;gap:24px;min-height:470px}
.bf-art::before,.bf-art::after{content:"";position:absolute;border-radius:50%;border:1px solid rgba(211,180,118,.22);pointer-events:none}
.bf-art::before{width:520px;height:520px;right:-230px;bottom:-230px;box-shadow:0 0 0 46px rgba(211,180,118,.05),0 0 0 47px rgba(211,180,118,.16),0 0 0 100px rgba(255,255,255,.02),0 0 0 101px rgba(211,180,118,.1)}
.bf-art::after{width:160px;height:160px;right:-40px;bottom:-40px;background:rgba(211,180,118,.06)}
.bf-brand,.bf-title,.bf-tags{position:relative;z-index:1}
.bf-escudo{position:absolute;z-index:1;bottom:62px;right:-38px;width:236px;height:236px;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45));pointer-events:none}
.bf-brand{display:flex;align-items:center;gap:12px}
.bf-brand img{width:54px;height:54px}
.bf-brand b{display:block;font-family:Manrope,Arial,sans-serif;font-weight:800;font-size:20px;letter-spacing:.5px}
.bf-brand small{display:block;font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.7)}
.bf-eyebrow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:#d3b476;margin:0 0 14px}
.bf-eyebrow::before{content:"";width:26px;height:2px;background:#d3b476;border-radius:2px}
.bf-title h2{margin:0;font-family:Manrope,Arial,sans-serif;font-weight:800;font-size:66px;line-height:.92;letter-spacing:-1.5px;color:#fff}
.bf-title h2 span{display:block;color:#d3b476}
.bf-title p{margin:16px 0 0;font-size:16px;line-height:1.5;color:rgba(255,255,255,.85);max-width:230px}
.bf-tags{display:flex;flex-wrap:wrap;gap:8px}
.bf-tags span{font-size:12px;font-weight:700;letter-spacing:.4px;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06)}
.bf-body{padding:38px 34px 30px;display:flex;flex-direction:column;gap:16px}
.bf-label{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#5c6d82;margin:0}
.bf-offer{margin:0;font-family:Manrope,Arial,sans-serif;font-weight:800;font-size:52px;line-height:1;letter-spacing:-1px}
.bf-offer small{display:block;font-family:"DM Sans",Arial,sans-serif;font-weight:500;font-size:16px;letter-spacing:0;color:#5c6d82;margin-top:6px}
.bf-offer em{font-style:normal;font-size:22px;letter-spacing:0;margin-left:6px;color:#5c6d82;font-weight:600}
.bf-count{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.bf-count div{background:#f3f6fa;border:1px solid #dbe3ed;border-radius:12px;padding:10px 4px;text-align:center}
.bf-count b{display:block;font-family:Manrope,Arial,sans-serif;font-weight:800;font-size:26px;font-variant-numeric:tabular-nums}
.bf-count span{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5c6d82}
.bf-cta{display:block;text-align:center;text-decoration:none;background:#082649;color:#fff!important;font-weight:700;font-size:17px;padding:16px;border-radius:12px;box-shadow:inset 0 -3px 0 #d3b476}
.bf-cta:hover,.bf-cta:focus-visible{background:#061b35}
.bf-note{margin:0;font-size:13px;line-height:1.45;color:#5c6d82;text-align:center}
.bf-close{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(8,38,73,.08);color:#082649;font-size:24px;line-height:1;cursor:pointer;z-index:2}
@media (max-width:700px){.bf{grid-template-columns:1fr}.bf-art{min-height:0;padding:20px 20px 18px;gap:14px}.bf-art::before{width:300px;height:300px;right:-150px;bottom:-170px}.bf-brand img{width:38px;height:38px}.bf-brand b{font-size:16px}.bf-eyebrow{font-size:11px;letter-spacing:1.6px;margin-bottom:8px}.bf-title h2{font-size:42px}.bf-escudo{bottom:-14px;right:-6px;width:150px;height:150px}.bf-title p:not(.bf-eyebrow),.bf-tags{display:none}.bf-body{padding:18px 20px 20px;gap:11px}.bf-offer{font-size:40px}.bf-offer em{font-size:18px}.bf-count div{padding:8px 2px}.bf-count b{font-size:21px}.bf-count span{font-size:10px}.bf-cta{padding:15px}.bf-close{background:rgba(255,255,255,.16);color:#fff}}
@media (prefers-reduced-motion:reduce){.bf-backdrop,.bf{transition:none}}`;

 function abrir(){
  if(document.querySelector('.bf-backdrop'))return;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const wrap=document.createElement('div');wrap.className='bf-backdrop';
  wrap.innerHTML=`<div class="bf" role="dialog" aria-modal="true" aria-labelledby="bf-t">
<button type="button" class="bf-close" aria-label="Fechar">×</button>
<div class="bf-art"><img class="bf-escudo" src="/apmbb-escudo.webp" alt="Escudo da Academia do Barro Branco" width="230" height="230"><div class="bf-brand"><img src="/selo-branco.png" alt="" width="54" height="54"><div><b>GETEPÊ</b><small>Desde 1953</small></div></div>
<div class="bf-title"><p class="bf-eyebrow">APMBB · Barro Branco online</p><h2 id="bf-t">Black<span>Friday</span></h2><p>Prepare-se para Oficial da PM de São Paulo com a tradição do GETEPÊ, onde você estiver.</p></div>
<div class="bf-tags"><span>Online</span><span>APMBB</span><span>Barro Branco</span></div></div>
<div class="bf-body"><p class="bf-label">Curso online APMBB</p>
<p class="bf-offer">${C.avista}<em>à vista</em><small>${C.parcelado}</small></p>
<p class="bf-label">A oferta termina em</p>
<div class="bf-count" aria-live="off"><div><b data-u="d">00</b><span>dias</span></div><div><b data-u="h">00</b><span>horas</span></div><div><b data-u="m">00</b><span>min</span></div><div><b data-u="s">00</b><span>seg</span></div></div>
<a class="bf-cta" href="${C.url}" target="_blank" rel="noopener noreferrer">Garantir minha vaga</a>
<p class="bf-note">Oferta válida até ${C.validade}. Matrícula e pagamento pela Hotmart.</p></div></div>`;
  document.body.appendChild(wrap);
  const antes=document.activeElement,dlg=wrap.querySelector('.bf'),fechaBtn=wrap.querySelector('.bf-close');
  const pad=n=>String(n).padStart(2,'0');
  const tick=()=>{let s=Math.max(0,Math.floor((C.fim-Date.now())/1000));if(!s){fechar();return}
   const v={d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60};
   wrap.querySelectorAll('[data-u]').forEach(b=>{b.textContent=pad(v[b.dataset.u])})};
  tick();const timer=setInterval(tick,1000);
  function fechar(){clearInterval(timer);try{localStorage.setItem(KEY,'1')}catch{}document.removeEventListener('keydown',tecla);wrap.remove();if(antes&&antes.focus)antes.focus()}
  function tecla(e){if(e.key==='Escape')fechar();else if(e.key==='Tab'){const f=[...dlg.querySelectorAll('a,button')],a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}}
  fechaBtn.addEventListener('click',fechar);
  wrap.addEventListener('click',e=>{if(e.target===wrap)fechar()});
  wrap.querySelector('.bf-cta').addEventListener('click',()=>{try{localStorage.setItem(KEY,'1')}catch{}});
  document.addEventListener('keydown',tecla);
  requestAnimationFrame(()=>wrap.classList.add('on'));fechaBtn.focus({preventScroll:true});
 }
 // Espera o aviso de cookies (medicao.js) sair da tela, para um não cobrir o outro.
 const iniciar=()=>setTimeout(function esperar(){if(document.getElementById('getepe-cookies'))setTimeout(esperar,800);else abrir()},1500);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
