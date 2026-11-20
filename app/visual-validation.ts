// Only data is accepted: no HTML, JavaScript, selectors or arbitrary CSS from the editor.
type Obj=Record<string,unknown>;
export function validateVisual(visual:unknown){
 const object=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
 function bad():never{throw Object.assign(new Error('Conteúdo do editor visual inválido.'),{status:400})}
 const str=(s:unknown,n=10000):s is string=>typeof s==='string'&&s.length<=n;
 const url=(s:unknown)=>str(s,2048)&&(!s||(!/[<>"'\\\s]/.test(s)&&/^(https:\/\/|\/(?!\/)|#|mailto:|tel:|[\w-]+\.(png|jpg|webp))/.test(s)));
 if(visual===undefined)return {};if(!object(visual)||Object.keys(visual).length>200)bad();
 for(const [key,model]of Object.entries(visual)){
  if(!/^(global|\/[\w/#-]*)$/.test(key)||key.length>200||!object(model)||Object.keys(model).some(k=>!['elements','sections','order'].includes(k)))bad();
  const elements=model.elements,order=model.order,sections=model.sections;
  if(elements!==undefined){if(!object(elements)||Object.keys(elements).length>1000)bad();for(const [id,p]of Object.entries(elements)){if(!/^[\w-]{1,120}$/.test(id)||!object(p))bad();for(const [k,v]of Object.entries(p)){if(k==='texts'){if(!Array.isArray(v)||v.length>40||v.some((t:unknown)=>!str(t)))bad()}else if(['src','href'].includes(k)){if(!url(v))bad()}else if(k==='alt'){if(!str(v,1000))bad()}else if(k==='hidden'){if(typeof v!=='boolean')bad()}else if(['color','backgroundColor'].includes(k)){if(!str(v)||!/^$|^#[0-9a-f]{6}$/i.test(v))bad()}else if(k==='fontSize'){if(!str(v)||!/^$|^(1[2-9]|[2-6][0-9]|7[0-2])px$/.test(v))bad()}else if(k==='textAlign'){if(!['','left','center','right'].includes(v as string))bad()}else bad()}}}
  if(order!==undefined&&(!Array.isArray(order)||order.length>100||order.some((x:unknown)=>!str(x,120)||!/^[-\w]+$/.test(x))||new Set(order).size!==order.length))bad();
  if(sections!==undefined){if(!Array.isArray(sections)||sections.length>40)bad();const ids=new Set<string>();for(const s of sections as unknown[]){if(!object(s)||Object.keys(s).some(k=>!['id','title','text','image','alt','button','href','tone','hidden'].includes(k))||!str(s.id,100)||!/^[-\w]+$/.test(s.id)||ids.has(s.id)||!str(s.title,300)||!str(s.text)||!url(s.image)||!str(s.alt,1000)||!str(s.button,100)||!url(s.href)||!['light','navy','white'].includes(s.tone as string)||typeof s.hidden!=='boolean')bad();ids.add(s.id as string)}}
 }
 return visual;
}
