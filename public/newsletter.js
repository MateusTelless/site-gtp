// O boletim será ativado após o lançamento; o cadastro na página permanece disponível.
const NEWSLETTER_POPUP_ENABLED=false;
function newsletterSection(){return `<section id="newsletter" class="newsletter-section" aria-labelledby="newsletter-title"><div class="newsletter-copy"><p class="eyebrow">BOLETIM GETEPE</p><h2 id="newsletter-title">Seu próximo passo<br>começa com <em>informação.</em></h2><p>Dicas de estudo, novidades das turmas e informações sobre os concursos que fazem parte dos seus planos.</p><div class="newsletter-benefits"><p><b>Conteúdo para seu objetivo</b>Você escolhe os concursos que quer acompanhar.</p><p><b>Uma pausa que rende estudo</b>Orientações e questões comentadas para sua preparação.</p><p><b>Mais perto do GETEPE</b>Conheça as turmas, os materiais e as novidades do curso.</p></div><small>Desde 1953, acompanhando o seu próximo passo.</small></div><form class="newsletter-form" onsubmit="previewNewsletter(event)"><p class="eyebrow">DO SEU JEITO</p><h3>O que você quer acompanhar?</h3><p>Cadastre seu interesse para receber novidades quando nosso boletim começar. Os envios ainda não estão ativos.</p><label class="newsletter-field">Seu nome<input name="name" autocomplete="given-name" placeholder="Como podemos chamar você?" required maxlength="100"></label><label class="newsletter-field">Seu e-mail<input name="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required maxlength="254"></label><fieldset><legend>Meus interesses <small>Selecione um ou mais</small></legend><div class="newsletter-interests">${['APMBB · Barro Branco','EPCAR / Colégio Naval','EsPCEx','Soldado PMESP','Ainda estou escolhendo'].map((label,i)=>`<label><input type="checkbox" name="interest" value="${i}"><span>${label}</span></label>`).join('')}</div></fieldset><label class="newsletter-consent"><input type="checkbox" required name="consent"><span>Quero receber conteúdos e novidades do GETEPE por e-mail. Poderei cancelar o recebimento a qualquer momento.</span></label><button class="button dark" type="submit">Quero me cadastrar <span aria-hidden="true">→</span></button><input name="website" type="text" tabindex="-1" autocomplete="off" hidden aria-hidden="true"><p class="newsletter-demo">Seu cadastro ficará salvo no GETEPE. Você receberá novidades quando os envios forem ativados.</p><p class="newsletter-feedback" role="status" aria-live="polite" hidden></p></form></section>`}
async function previewNewsletter(event){event.preventDefault();const form=event.currentTarget,status=form.querySelector('.newsletter-feedback'),button=form.querySelector('button[type=submit]');status.hidden=false;const fields=new FormData(form);if(!fields.getAll('interest').length){status.textContent='Selecione pelo menos um interesse.';return}button.disabled=true;status.textContent='Salvando seu pedido…';try{const response=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fields.get('name'),email:fields.get('email'),interests:fields.getAll('interest'),consent:fields.get('consent')==='on',website:fields.get('website')||''})});const result=await response.json();if(!response.ok)throw new Error(result.error);status.textContent=result.message||'Recebemos seu pedido.';form.reset()}catch(error){status.textContent=error.message||'Não foi possível salvar. Tente novamente.'}finally{button.disabled=false}}

function openNewsletterPopup(){if(!NEWSLETTER_POPUP_ENABLED)return false;if(new URLSearchParams(location.search).has('visualEditor'))return false;
 if(document.querySelector('dialog[open]')||location.hash.startsWith('#admin'))return false;
 let popup=document.getElementById('newsletter-popup');
 if(!popup){
  popup=document.createElement('dialog');popup.id='newsletter-popup';popup.setAttribute('aria-labelledby','newsletter-popup-title');
  popup.innerHTML='<div class="newsletter-popup-bar"><span>BOLETIM GETEPE</span><button type="button" class="newsletter-popup-close" aria-label="Fechar newsletter" autofocus>×</button></div><div class="newsletter-popup-heading"><h2 id="newsletter-popup-title">Seu próximo passo começa com informação.</h2><p>Receba dicas e novidades dos concursos que você quer acompanhar.</p></div>';
  const template=document.createElement('template');template.innerHTML=newsletterSection();const form=template.content.querySelector('form');form.querySelector('.eyebrow').remove();form.querySelector('h3').remove();form.querySelector(':scope > p').remove();popup.append(form);setupNewsletterSteps(popup,form);document.body.append(popup);
  popup.querySelector('.newsletter-popup-close').addEventListener('click',()=>popup.close());
  popup.addEventListener('click',e=>{if(e.target!==popup)return;const r=popup.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)popup.close()});
 }
 popup.showModal();try{sessionStorage.setItem('getepe-newsletter-shown','1')}catch{}return true;
}
window.addEventListener('DOMContentLoaded',()=>{
 if(!NEWSLETTER_POPUP_ENABLED)return;
 if(new URLSearchParams(location.search).get('newsletterPreview')==='1'){openNewsletterPopup();return;}
 let seen=false;try{seen=sessionStorage.getItem('getepe-newsletter-shown')==='1'}catch{}
 if(seen||new URLSearchParams(location.search).has('editorPreview'))return;
 function invite(){if(location.hash.startsWith('#admin'))return;if(document.hidden||document.querySelector('dialog[open]')||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)){setTimeout(invite,5000);return}openNewsletterPopup()}
 setTimeout(invite,7000);
});
const setupNewsletterSteps=(popup,form)=>{
 const fields=[...form.querySelectorAll('.newsletter-field')],interests=form.querySelector('fieldset'),consent=form.querySelector('.newsletter-consent'),submit=form.querySelector('button[type=submit]'),feedback=form.querySelector('.newsletter-feedback');
 const progress=document.createElement('p');progress.className='newsletter-step-label';form.prepend(progress);
 const next=document.createElement('button');next.type='button';next.className='button dark newsletter-next';next.textContent='Continuar →';submit.before(next);
 const back=document.createElement('button');back.type='button';back.className='newsletter-back';back.textContent='← Voltar';submit.before(back);
 function step(value){const second=value===2;fields.forEach(el=>el.hidden=second);interests.hidden=!second;consent.hidden=!second;submit.hidden=!second;back.hidden=!second;next.hidden=second;feedback.hidden=true;progress.textContent=second?'ETAPA 2 DE 2 · SEUS INTERESSES':'ETAPA 1 DE 2 · VAMOS NOS CONHECER';popup.querySelector('h2').textContent=second?'O que você quer acompanhar?':'Seu próximo passo começa com informação.';popup.querySelector('.newsletter-popup-heading p').textContent=second?'Escolha um ou mais interesses para personalizar seu boletim.':'Dicas de estudo e novidades do GETEPE no seu e-mail.';}
 next.addEventListener('click',()=>{for(const name of ['name','email'])if(!form.elements[name].reportValidity())return;step(2);interests.querySelector('input').focus();popup.scrollTop=0});
 back.addEventListener('click',()=>{step(1);form.elements.name.focus();popup.scrollTop=0});
 form.addEventListener('keydown',e=>{if(e.key==='Enter'&&!next.hidden&&e.target.matches('input:not([type=checkbox])')){e.preventDefault();next.click()}});
 step(1);
};

