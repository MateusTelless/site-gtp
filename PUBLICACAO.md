# Preparação para publicação — GETEPE

Atualizado em 23/10/2026. A prévia permanece restrita; o domínio oficial não foi alterado.

## Entregue nesta etapa
- Remoção das compras e áreas de aluno simuladas do código público; matrículas continuam nos destinos existentes.
- Carregamento do catálogo com mensagem de falha e tentativa novamente, sem apresentar dados antigos como atuais quando a API falha.
- Fim das migrações de navegador que recriavam cursos excluídos ou sobrescreviam destinos cadastrados.
- Textos simples de 16 páginas editáveis em **Textos das páginas**. O novo editor visual complementa esses campos com edição de elementos, imagens, links e organização das seções; consulte LOGIN-ADMIN.md. Os campos são identificados pela ordem e tipo do texto na página.
- Cursos com campos **Programa de estudos** e **Link da aula gratuita**. O filtro gratuito só aparece quando há aula cadastrada; não existe hospedagem de vídeo própria.
- Rascunho exportável e importável. A importação preserva o rascunho anterior no histórico e não publica automaticamente.
- Exportação de conteúdo, histórico e inventário dos arquivos. Não é backup integral: não contém bytes dos arquivos nem contatos. Exporte contatos em CSV e preserve os arquivos originais separadamente.
- Endpoint /api/health para monitorar a resposta do servidor e uma consulta ao banco. Não mede entrega de e-mails ou disponibilidade dos arquivos.
- Adaptador opcional de Cloudflare Access com validação criptográfica de assinatura, emissor, audiência e validade do token. O modo escolhido para o painel é agora usuário e senha próprios; consulte LOGIN-ADMIN.md.
- Geração de robots, sitemap e metadados de compartilhamento. A indexação permanece desativada na prévia.
- Redirecionamentos de sete endereços identificados no menu do site atual. Não substitui o levantamento completo do Search Console, páginas de blog e campanhas antigas.

## Antes da mudança do domínio
1. Escolher a hospedagem e fornecer acesso autorizado à conta da instituição. A configuração direta ainda não foi testada numa conta real.
2. Revisar dados, preços, datas, horários, professores, condições e links. Não foram inventados novos valores. Definir a logo final.
3. Definir administradores e testar login permitido e recusado na hospedagem escolhida.
4. Definir o serviço de e-mail. Não há API de marketing configurada nem campanhas enviadas. Mapear interesses, autenticar remetente, configurar cancelamento e suppression list antes de sincronizar.
5. Completar o aviso de privacidade com os responsáveis, provedores e rotina efetiva de atendimento. O texto em PRIVACIDADE-RASCUNHO.md é um material de revisão, não uma declaração de conformidade.
6. Guardar backup do site antigo, banco, contatos e arquivos; testar restauração em um ambiente separado. Configurar backup automático na conta escolhida.
7. Conferir redirects adicionais, testar contatos e caminhos de compra (sem cobranças de teste não autorizadas), acessibilidade e navegação em dispositivos reais.
8. Preservar os registros de e-mail do domínio (MX/TXT e demais configurações). Trocar DNS apenas depois da aprovação da versão e do plano de retorno.
9. Somente no domínio definitivo: configurar origin e indexable=true em launch-settings.json, executar node scripts/prepare-seo.mjs, construir novamente e publicar. Confirmar robots e sitemap; enviar sitemap ao Search Console da instituição.

## Se a escolha for Cloudflare
O preparo pode usar o servidor, D1 e R2 já usados pelo projeto. Ainda requer criar os recursos na conta, importar os dados e testar os acessos reais.

1. Criar banco D1 e bucket R2 próprios; guardar identificadores. Aplicar as migrações em drizzle num banco NOVO antes de importar conteúdo. Não rodar comandos destrutivos no banco da prévia.
2. Configurar o login próprio conforme LOGIN-ADMIN.md. As migrações incluem contas e sessões. O site público e /api/newsletter não exigem login administrativo.
3. Construir o projeto. Criar um JSON privado fora do código versionado com accountId, databaseId, databaseName, bucketName, workerName e adminEmails (array). Não contém chaves. Executar `node scripts/prepare-cloudflare.mjs CAMINHO_DO_JSON`. Ele prepara dist/server/wrangler.independent.json sem publicar nem criar recursos.
4. Usar o arquivo preparado com Wrangler após autenticação autorizada na conta. Configurar domínio, validar assets, banco, upload e login. Não implantar a autenticação Sites em um servidor que aceite cabeçalhos arbitrários enviados pelo visitante.
5. Transferir rascunho pelo painel e publicar após revisar. Transferir os arquivos R2 mantendo suas chaves; copiar apenas o JSON não transfere PDFs ou imagens. Transferir contatos por processo autorizado separado, sem expô-los no diretório público.
6. Testar diretamente as rotas de API sem token, com token inválido e com usuário sem permissão; todas devem negar acesso. Validar o login real antes de abrir o site ao público.

Referência de autenticação: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
Endereços antigos identificados: https://www.tellespires.com.br/ (consulta em 21/10/2026).

## Conferência local
- node scripts/check-launch.mjs
- node scripts/test-api.cjs
- node scripts/test-auth.cjs
- node node_modules/typescript/bin/tsc --noEmit
- Build do projeto pelo fluxo Sites.

A publicação nesta prévia não equivale à transferência do domínio, ativação do envio de e-mail ou contratação de hospedagem.


### Newsletter após o lançamento (28/10/2026)
O lançamento institucional não depende da ativação dos envios. O popup fica desativado, inclusive no link newsletterPreview. A seção mantém o cadastro com aviso de que os envios começarão futuramente. Ativar serviço, remetente, segmentação e testes em etapa posterior. Para reativar o popup após essa validação, alterar NEWSLETTER_POPUP_ENABLED em public/newsletter.js.

## Carrossel de janeiro — 29/10/2026
Os dois primeiros destaques padrão passam a mostrar APMBB (azul) e EsPCEx / ESA / EEAR (verde), início em 12/01. O campo Formato permite arte completa ou texto com imagem lateral. Os anúncios levam a uma página com atendimento presencial e online; não reutilizam o pagamento de outra turma. A atualização dos conteúdos antigos só se aplica aos dois registros padrão ainda com seus títulos originais e sem imagem. Demais registros e edições são preservados. A alteração aparece também no rascunho do painel e é mantida quando ele é salvo/publicado.

### Ajuste de altura — 29/10/2026
As campanhas usam a proporção horizontal original da arte, com imagem clicável e apenas 48px para controles e Mais informações. Removida a faixa duplicada de título e descrição. Validado no navegador em 1440px e 390px, incluindo navegação para as modalidades.

### Altura uniforme e botão sobreposto — 29/10/2026
Os três slides compartilham a mesma altura proporcional, inclusive o institucional. Mais informações aparece sobre a arte no canto superior direito, preservando a data. Testado em larguras de 390, 774 e 1440 pixels, com os dois destinos de atendimento preservados.

### Carrossel contínuo — 29/10/2026
Removida a faixa azul de navegação. A altura corresponde à imagem, nos três slides. Setas, indicadores e pausa ficam sobrepostos e centralizados na base, mantendo Mais informações no canto superior direito.

### Controles e troca automática — 30/10/2026
Setas e indicadores centralizados nos 6% inferiores do banner, abaixo da faixa de início. Botão de pausa removido. Ao abrir, troca automática a cada seis segundos; a primeira escolha manual por seta ou indicador interrompe a troca até recarregar a página. Mouse e retorno à aba não desfazem essa escolha.
