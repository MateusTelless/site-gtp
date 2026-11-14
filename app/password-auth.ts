import { env } from 'cloudflare:workers';
import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
type Config={DB:D1Database;AUTH_PROVIDER?:string;ADMIN_SETUP_TOKEN?:string;ADMIN_SETUP_EXPIRES?:string;ADMIN_SETUP_EMAIL?:string;ADMIN_RESET_TOKEN?:string;ADMIN_RESET_EXPIRES?:string;ADMIN_RESET_USERNAME?:string};
const cfg=()=>env as unknown as Config;
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
function deny(message:string,status=400):never{throw Object.assign(new Error(message),{status})}
const equal=(a:string,b:string)=>timingSafeEqual(Buffer.from(digest(a),'hex'),Buffer.from(digest(b),'hex'));
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(err,key)=>err?reject(err):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return 'scrypt-v1$'+salt+'$'+(await derive(password,salt)).toString('hex')}
export async function verifyPassword(password:string,stored:string){const [version,salt,hash]=stored.split('$');if(version!=='scrypt-v1'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(hash))return false;return timingSafeEqual(await derive(password,salt),Buffer.from(hash,'hex'))}
const local=(req:Request)=>process.env.NODE_ENV==='development'&&['localhost','127.0.0.1'].includes(new URL(req.url).hostname);
const cookieName=(req:Request)=>local(req)?'getepe_admin_local':'__Host-getepe_admin';
const cookie=(req:Request,value:string,seconds=28800)=>`${cookieName(req)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${local(req)?'':'; Secure'}`;
function sessionToken(req:Request){const matches=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName(req)+'='));if(matches.length!==1)return '';const value=matches[0].slice(cookieName(req).length+1);return /^[a-f0-9]{64}$/.test(value)?value:''}
export async function passwordIdentity(req:Request){const t=sessionToken(req);if(!t)return null;const row=await cfg().DB.prepare('SELECT u.id,u.username,u.email FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.id=? AND s.expires>? AND u.active=1').bind(digest(t),Date.now()).first<any>();return row?{userId:row.id,email:row.email,displayName:row.username,fullName:null}:null}
async function session(req:Request,id:string){const {DB}=cfg(),t=token();await DB.prepare('DELETE FROM admin_sessions WHERE expires<=?').bind(Date.now()).run();await DB.prepare('INSERT INTO admin_sessions(id,user_id,expires) VALUES(?,?,?)').bind(digest(t),id,Date.now()+28800000).run();return cookie(req,t)}
function password(value:any){if(typeof value!=='string'||value.length<14||value.length>128)deny('Use uma senha de 14 a 128 caracteres. Uma frase longa é uma boa opção.');return value as string}
function username(value:any){if(typeof value!=='string'||(!/^[a-zA-Z0-9._-]{3,64}$/.test(value)&&!(value.length<=254&&/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value))))deny('Informe um e-mail válido ou um usuário com 3 a 64 letras, números, ponto, hífen ou sublinhado.');return value.toLowerCase() as string}
// Limites de login (janela de 15 min): até 30 tentativas por IP e até 10 FALHAS por usuário a partir do mesmo IP.
// Contar só as falhas, e por usuário + IP, impede que um terceiro bloqueie o administrador de outro lugar.
const loginWindow=()=>Math.floor(Date.now()/900000),clientIp=(req:Request)=>req.headers.get('cf-connecting-ip')||'unknown',tooMany=()=>deny('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.',429);
async function bump(key:string){const r=await cfg().DB.prepare('INSERT INTO limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind('login:'+digest(key+':'+loginWindow()),Date.now()+1800000).first<{count:number}>();return r?.count||0}
async function limit(req:Request,user:string){const {DB}=cfg();if(await bump('ip:'+clientIp(req))>30)tooMany();const r=await DB.prepare('SELECT count FROM limits WHERE id=?').bind('login:'+digest('user:'+user+':ip:'+clientIp(req)+':'+loginWindow())).first<{count:number}>();if((r?.count||0)>=10)tooMany();await DB.prepare('DELETE FROM limits WHERE expires<?').bind(Date.now()).run()}
async function failed(req:Request,user:string,message:string,status=401):Promise<never>{await bump('user:'+user+':ip:'+clientIp(req));deny(message,status)}
const response=(body:any,extra:Record<string,string>={})=>Response.json(body,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export async function passwordAction(req:Request,path:string){
 const conf=cfg(),{DB}=conf;if(conf.AUTH_PROVIDER!=='password')deny('Login próprio ainda não ativado.',404);
 if(req.method!=='POST')deny('Método não permitido.',405);
 if(req.headers.get('origin')!==new URL(req.url).origin)deny('Origem não autorizada.',403);
 if(!local(req)&&new URL(req.url).protocol!=='https:')deny('Use o endereço HTTPS do site.',403);
 const raw=await req.text();if(raw.length>4096)deny('Solicitação muito grande.',413);let b:any;try{b=JSON.parse(raw)}catch{deny('Dados inválidos.')}
 if(path==='auth/logout'){const t=sessionToken(req);if(t)await DB.prepare('DELETE FROM admin_sessions WHERE id=?').bind(digest(t)).run();return response({ok:true},{'Set-Cookie':cookie(req,'',0)})}
 if(path==='auth/change-password'){const user=await passwordIdentity(req);if(!user)deny('Entre novamente.',401);await limit(req,user.userId);const u=await DB.prepare('SELECT password_hash FROM admin_users WHERE id=?').bind(user.userId).first<any>();if(typeof b.current!=='string'||b.current.length>128||!await verifyPassword(b.current,u.password_hash))return failed(req,user.userId,'A senha atual não confere.');const hash=await hashPassword(password(b.password));await DB.batch([DB.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').bind(hash,user.userId),DB.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(user.userId)]);return response({ok:true},{'Set-Cookie':await session(req,user.userId)})}
 if(!['auth/login','auth/setup','auth/recover'].includes(path))deny('Caminho não encontrado.',404);
 const name=username(b.username);await limit(req,name);
 if(path==='auth/setup'){
  if(!conf.ADMIN_SETUP_TOKEN||!conf.ADMIN_SETUP_EMAIL||!Number.isFinite(Date.parse(conf.ADMIN_SETUP_EXPIRES||''))||Date.parse(conf.ADMIN_SETUP_EXPIRES!)<=Date.now()||typeof b.token!=='string'||!equal(b.token,conf.ADMIN_SETUP_TOKEN))return failed(req,name,'Convite de configuração inválido ou expirado.',403);
  const hash=await hashPassword(password(b.password)),id=crypto.randomUUID();
  const r=await DB.prepare('INSERT INTO admin_users(id,username,email,password_hash,active) SELECT ?,?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM admin_users)').bind(id,name,conf.ADMIN_SETUP_EMAIL.toLowerCase(),hash).run();
  if(!r.meta.changes)deny('A conta inicial já foi configurada.',409);
  return response({ok:true},{'Set-Cookie':await session(req,id)});
 }
 const user=await DB.prepare('SELECT * FROM admin_users WHERE username=? AND active=1').bind(name).first<any>();
 if(path==='auth/recover'){
  if(!conf.ADMIN_RESET_TOKEN||name!==conf.ADMIN_RESET_USERNAME||!Number.isFinite(Date.parse(conf.ADMIN_RESET_EXPIRES||''))||Date.parse(conf.ADMIN_RESET_EXPIRES!)<=Date.now()||typeof b.token!=='string'||!equal(b.token,conf.ADMIN_RESET_TOKEN)||!user)return failed(req,name,'Convite de recuperação inválido ou expirado.',403);
  const used=digest(conf.ADMIN_RESET_TOKEN),hash=await hashPassword(password(b.password));
  const results=await DB.batch([DB.prepare('UPDATE admin_users SET password_hash=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM admin_used_tokens WHERE id=?)').bind(hash,user.id,used),DB.prepare('DELETE FROM admin_sessions WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM admin_used_tokens WHERE id=?)').bind(user.id,used),DB.prepare('INSERT OR IGNORE INTO admin_used_tokens(id) VALUES(?)').bind(used)]);
  if(!results[0].meta.changes)deny('Convite já utilizado.',409);return response({ok:true},{'Set-Cookie':await session(req,user.id)});
 }
 if(typeof b.password!=='string'||b.password.length>128)return failed(req,name,'Usuário ou senha inválidos.');
 // Equal-cost verification for unknown accounts avoids a fast username-enumeration path.
 const stored=user?.password_hash||'scrypt-v1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
 const valid=await verifyPassword(b.password,stored);if(!valid||!user)return failed(req,name,'Usuário ou senha inválidos.');
 return response({ok:true},{'Set-Cookie':await session(req,user.id)});
}

