# Hospedagem independente para o GETEPE

Consulta em 15/10/2026. Valores em dólares, sujeitos a uso adicional e impostos. Não incluem domínio nem serviço de e-mail marketing.

| Opção | Compatibilidade com este projeto | Custo de referência | Trabalho para migrar |
| --- | --- | --- | --- |
| Cloudflare Workers + D1 + R2 | Mais próxima da implementação atual: servidor, banco e arquivos já usam esse ambiente | Workers tem faixa gratuita; plano pago a partir de US$ 5/mês. Banco, arquivos e excedentes dependem do uso | Configurar conta, banco, arquivos, acesso administrativo independente e domínio; testar as integrações |
| Vercel | Hospeda a parte visual e uma aplicação Next.js, mas não recebe diretamente o servidor Cloudflare atual | Pro a partir de US$ 20/mês; o Hobby gratuito é restrito a uso pessoal não comercial | Adaptar servidor, banco, arquivos e login; configurar serviços e domínio |
| Netlify | Boa opção para o site público; o painel completo exige adaptação do servidor | Há plano gratuito e Pro a partir de US$ 20/mês; cobrança usa créditos | Adaptar funções, banco, arquivos e login; acompanhar consumo de créditos |

Minha recomendação técnica para aproveitar o trabalho atual é Cloudflare. Essa conclusão se baseia nas dependências do código, não em uma comparação geral de qual plataforma é melhor. A hospedagem direta na Cloudflare ainda não foi configurada nem testada neste projeto.

A prévia Sites utiliza autenticação fornecida pela plataforma. Para hospedagem independente, precisamos substituir essa autenticação e testar a proteção do painel. A existência de D1 e R2 compatíveis não torna a migração automática.

Podemos manter o mesmo domínio e o visual do site. A hospedagem não faz disparos de newsletter por si só. Será conectado um serviço de e-mail marketing independente; Brevo e MailerLite são opções. A base de contatos e a exportação por interesse já ficam no próprio projeto. Nenhum serviço de envio está conectado nesta etapa.

Sequência sugerida: validar a prévia; escolher a hospedagem; configurar acesso e dados em ambiente de teste; conectar o e-mail; revisar conteúdo e URLs; depois alterar o domínio. Não desativar o site atual nem alterar DNS antes de validar a substituição e preservar os e-mails existentes.

Fontes oficiais:

- [Cloudflare — preços Workers, D1 e R2](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare — domínios próprios](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Vercel — planos](https://vercel.com/pricing)
- [Vercel — restrição do Hobby](https://vercel.com/docs/plans/hobby)
- [Netlify — planos e créditos](https://www.netlify.com/pricing/)
- [Netlify — consumo de créditos](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)

Para envio de newsletters, a Brevo informa uma faixa gratuita de 300 envios por dia. O plano gratuito da MailerLite foi atualizado para 250 assinantes ativos e 2.500 envios por mês. Esses limites não substituem a avaliação da base e da frequência de envio do GETEPE.

- [Brevo — planos](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)
- [MailerLite — atualização do plano gratuito](https://www.mailerlite.com/help/free-plan-update-faq)
- [MailerLite — limite de envios](https://www.mailerlite.com/free-plan)
