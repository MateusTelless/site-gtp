import shell from '../../admin-shell.html?raw';
import passwordLogin from '../../password-login.html?raw';
import { env } from 'cloudflare:workers';
import { getAdminIdentity } from '../admin-identity';
export const dynamic='force-dynamic';
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"};
export async function GET(req:Request){
 const config=env as unknown as {AUTH_PROVIDER?:string;ADMIN_EMAILS?:string};
 const independent=config.AUTH_PROVIDER==='cloudflare-access';
 const signIn=independent?'/cdn-cgi/access/login':'/signin-with-chatgpt?return_to=/admin';
 const signOut=config.AUTH_PROVIDER==='password'?'#sair':independent?'/cdn-cgi/access/logout':'/signout-with-chatgpt?return_to=/admin';
 const user=await getAdminIdentity(req);
 const dev=process.env.NODE_ENV==='development'&&user?.userId==='local_seedy'&&user?.email==='seedy@sites.test';
 const allowed=user&&(dev||(config.ADMIN_EMAILS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean).includes(user.email.toLowerCase()));
 if(allowed){const change=config.AUTH_PROVIDER==='password'?'<button type="button" data-password-change>Alterar senha</button>':'';const dialog='<dialog id="password-dialog"><form id="password-change"><h2>Alterar senha</h2><label>Senha atual<input name="current" type="password" autocomplete="current-password" required maxlength="128"></label><label>Nova senha (mínimo de 14 caracteres)<input name="password" type="password" autocomplete="new-password" required minlength="14" maxlength="128"></label><label>Confirme a nova senha<input name="confirm" type="password" autocomplete="new-password" required minlength="14" maxlength="128"></label><p role="status"></p><button type="button" data-password-close>Fechar</button><button class="primary" type="submit">Salvar nova senha</button></form></dialog>';return new Response(shell.replace('__SIGNOUT__',signOut).replace('__PASSWORD_CHANGE__',change).replace('</body>',dialog+'</body>'),{headers})}
 if(config.AUTH_PROVIDER==='password')return new Response(passwordLogin,{status:200,headers});
 const denied=!!user;
 return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acesso da equipe · GETEPE</title><link rel="stylesheet" href="/admin-panel.css"></head><body><main class="login-card"><img src="/logo-marinho-teste.png" alt="GETEPE"><p class="eyebrow">ÁREA RESTRITA</p><h1>${denied?'Conta sem permissão':'Acesso da equipe GETEPE'}</h1><p>${denied?'Esta conta não foi autorizada para administrar o site. Entre com a conta indicada pela instituição.':'Entre com sua conta autorizada para editar o site. Não há cadastro público de administradores.'}</p><a class="primary" href="${denied?signOut:signIn}" target="_top">${denied?'Sair e trocar de conta':'Entrar com a conta autorizada'}</a><p><a href="/">Voltar ao site</a></p></main></body></html>`,{status:denied?403:401,headers});
}
