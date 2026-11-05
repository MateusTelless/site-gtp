# GETEPE — operação independente

Esta versão conserva o desenho do projeto e acrescenta um servidor para administrar cursos, destaques, apostilas, imagens e cadastros. O domínio oficial ainda não foi alterado.

## Conteúdo e acesso

Abra /admin e entre com seu usuário e senha após configurar o primeiro acesso. Consulte LOGIN-ADMIN.md. A restrição externa da prévia Sites é separada do login do painel. Não coloque senhas ou chaves em arquivos públicos.

Edite, aplique ao rascunho, salve, pré-visualize e publique. Salvar sozinho não altera a página pública. O histórico permite recuperar uma publicação como novo rascunho. Uma revisão desatualizada é recusada para evitar que duas pessoas sobrescrevam o trabalho uma da outra.

Os dados ficam no banco D1 e as novas imagens no R2. O histórico não substitui uma política externa de backup: exporte o rascunho após mudanças importantes. Os arquivos originais continuam disponíveis. O novo editor visual conectado permite editar elementos das páginas institucionais e guias, criar seções padronizadas e reorganizá-las. Consulte LOGIN-ADMIN.md para os limites e o fluxo.

## Newsletter

O formulário guarda nome, e-mail, interesses, horário e texto do consentimento. A primeira etapa do popup não envia dados: a gravação acontece somente após a escolha dos interesses, autorização e conclusão. Um e-mail repetido não cria outro contato nem altera as preferências de quem já está cadastrado.

Na área Contatos, filtre uma instituição e exporte o CSV. O arquivo tem Nome, E-mail, Interesses GETEPE e Data do consentimento. Pode ser importado em um serviço de e-mail marketing com mapeamento das colunas. Uma pessoa pode ter vários interesses. Não é preciso duplicar o cadastro para cada instituição.

Exportar não é sincronizar nem enviar. Os contatos permanecem com status Aguardando ativação. Ainda não existe envio automático, campanha ou e-mail de boas-vindas configurado. Excluir um cadastro deste painel não o remove de um serviço onde ele já tenha sido importado.

Falta escolher e conectar um serviço de e-mail marketing independente. Brevo e MailerLite são opções a avaliar. A ativação exige conta autorizada, remetente, autenticação do domínio, integração dos interesses, cancelamento de recebimento e testes. Não envie chaves pela conversa: elas devem ficar na configuração privada do servidor. Não reative quem cancelou a assinatura.

O modelo em /boletim-modelo.html é uma prévia editorial. Os trechos entre colchetes, os links de destino e o cancelamento precisam ser configurados antes de enviar.

## Hospedagem definitiva

Veja HOSPEDAGEM.md. A recomendação técnica é Cloudflare Workers + D1 + R2 pela compatibilidade com o código atual. A hospedagem direta na conta da instituição ainda não foi configurada.

O modo de login próprio está implementado e testado localmente. Ative e teste na hospedagem definitiva. Não confie em cabeçalhos que um visitante possa enviar diretamente. A conta simulada do ambiente local não existe no pacote de produção.

Antes de alterar o domínio: revisar datas, preços e links; definir a equipe; conectar o e-mail; aprovar o aviso de privacidade e as rotinas de exclusão; guardar backup do site atual e planejar redirecionamentos das URLs antigas.

Os links Hotmart foram preservados. Não há confirmação automática de pagamentos, matrículas ou área de alunos funcional nesta etapa. Essas funções exigem acesso à conta e mapeamento validado de produtos e eventos.

## Provas resolvidas

Abra Provas resolvidas, clique em Adicionar e preencha título, instituição e ano. Use Imagens e arquivos para enviar PDFs de até 10 MB, copie o endereço e cole nos campos da prova, gabarito ou resolução. Links externos HTTPS e vídeos também são aceitos. A resolução comentada pode ser escrita diretamente no painel. Salve, confira a prévia e publique. O catálogo do site passa a mostrar somente registros publicados e visíveis, com filtros por instituição e ano. Não foram inventadas provas para preencher o acervo. Os PDFs dessa seção são materiais públicos após publicação; não envie documentos pessoais.


## Preparação de lançamento — outubro de 2026
Consulte PUBLICACAO.md para as alterações, limites e sequência de migração. Textos simples de 16 páginas agora podem ser editados pelo painel; estrutura, links e textos com elementos internos continuam no projeto. A newsletter segue sem serviço de envio conectado.


