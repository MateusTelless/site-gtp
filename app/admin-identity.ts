import { env } from 'cloudflare:workers';
import { getChatGPTUser } from './chatgpt-auth';
import { passwordIdentity } from './password-auth';
// Optional adapter for independent hosting. Sites remains the active preview provider.
type AccessEnv={AUTH_PROVIDER?:string;ACCESS_TEAM_DOMAIN?:string;ACCESS_AUDIENCE?:string};
let cached:{issuer:string;expires:number;keys:JsonWebKey[]}|undefined;
const bytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyAccessToken(token:string,issuer:string,audience:string,keys:JsonWebKey[]){
 try{const parts=token.split('.');if(parts.length!==3||token.length>16000)return null;
 const head=JSON.parse(new TextDecoder().decode(bytes(parts[0]))),claims=JSON.parse(new TextDecoder().decode(bytes(parts[1])));
 if(head.alg!=='RS256'||typeof head.kid!=='string')return null;
 const key=keys.find(k=>(k as JsonWebKey&{kid?:string}).kid===head.kid&&k.kty==='RSA');if(!key)return null;
 const imported=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',imported,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
 const time=Math.floor(Date.now()/1000);if(claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(audience)||typeof claims.exp!=='number'||claims.exp<=time||typeof claims.iat!=='number'||claims.iat>time+30||(claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf>time+30))||typeof claims.sub!=='string'||!claims.sub||typeof claims.email!=='string'||!claims.email.includes('@'))return null;
 return {userId:claims.sub,email:claims.email,displayName:claims.email,fullName:null};
 }catch{return null}
}
export async function getAdminIdentity(req:Request){
 const config=env as unknown as AccessEnv;
 if(config.AUTH_PROVIDER==='password')return passwordIdentity(req);
 // Sem AUTH_PROVIDER definido, ninguém entra: os cabeçalhos oai-authenticated-* só são confiáveis atrás da plataforma Sites.
 if(config.AUTH_PROVIDER==='sites'){
  // Route handlers carry the identity supplied by Sites dispatch on their Request.
  const userId=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
  if(userId&&email)return {userId,email,displayName:email,fullName:null};
  return getChatGPTUser();
 }
 if(config.AUTH_PROVIDER!=='cloudflare-access')return null;
 const issuer=config.ACCESS_TEAM_DOMAIN||'',audience=config.ACCESS_AUDIENCE||'';
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience)return null;
 const token=req.headers.get('Cf-Access-Jwt-Assertion');if(!token)return null;
 try{if(!cached||cached.issuer!==issuer||cached.expires<Date.now()){
 const r=await fetch(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)return null;
 const data=await r.json() as {keys?:JsonWebKey[]};if(!Array.isArray(data.keys))return null;cached={issuer,expires:Date.now()+300000,keys:data.keys};}
 return verifyAccessToken(token,issuer,audience,cached.keys);
 }catch{return null}
}
