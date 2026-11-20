import legacyRedirects from '../lib/legacy-redirects.json';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

// Site antigo (tellespires.com.br, Wix): toda página vai, com 301, para a equivalente no getepe.com.br.
const OLD_HOSTS=new Set(['tellespires.com.br','www.tellespires.com.br']);
const OLD_PAGES:Record<string,string>={'':'/','/blog':'/guias/','/fale-conosco':'/#contato','/depoimentos':'/resultados/','/provas-anteriores':'/provas-anteriores-resolvidas/','/provas-soldado':'/provas-anteriores-resolvidas/','/gabarito-apmbb-2021':'/provas-anteriores-resolvidas/','/copia-apmbb':'/curso-apmbb-barro-branco/','/filosofiaesociologiaapmbb':'/curso-apmbb-barro-branco/','/cursoapmbb':'/curso-apmbb-barro-branco/','/cursoespcex':'/curso-espcex/','/cursoepcarcn':'/curso-epcar/','/soldadopmesp':'/#curso/soldado-pm','/matematicaapmbb':'/#curso/matematica','/portuguesapmbb':'/#curso/portugues','/biologiaapmbb':'/#curso/biologia'};
function oldSiteTarget(pathname:string){
  const p=pathname.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\/+$/,'');
  if(p in OLD_PAGES)return OLD_PAGES[p];
  if(p.startsWith('/post/')){const s=p.slice(6);
    if(/gabarito|correcao|resolucao|simulado|prova|revisao/.test(s))return '/provas-anteriores-resolvidas/';
    if(/apmbb|barro|oficial|tenente/.test(s))return '/curso-apmbb-barro-branco/';
    if(/espcex|exercito/.test(s))return '/curso-espcex/';
    if(/epcar|cadetes-do-ar/.test(s))return '/curso-epcar/';
    if(/naval|marinha/.test(s))return '/curso-colegio-naval/';
    if(/soldado|pmsp|pmesp|sargento|policia|taf/.test(s))return '/#curso/soldado-pm';
    return '/guias/';}
  return '/';
}
export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const incoming=new URL(request.url);let pathname=incoming.pathname;try{pathname=decodeURIComponent(pathname)}catch{}
    if(OLD_HOSTS.has(incoming.hostname)){
      // Arquivos de verificação de domínio continuam respondendo no próprio tellespires.
      if(!/^\/(google[\w-]*\.html|[a-z0-9]{30}\.html|\.well-known\/.*)$/i.test(pathname))return Response.redirect('https://getepe.com.br'+oldSiteTarget(pathname),301);
    }
    const destination=(legacyRedirects as Record<string,string>)[pathname.replace(/\/$/,'')];
    if(destination&&(request.method==='GET'||request.method==='HEAD')){const target=new URL(destination,incoming.origin);target.search=incoming.search;return Response.redirect(target.href,301)}
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};
