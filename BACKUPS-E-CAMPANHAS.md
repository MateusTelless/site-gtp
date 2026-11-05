# Programação do carrossel e cópias de segurança

## Carrossel

Em Destaques da página, editar ou adicionar um anúncio. Preencher Exibir a partir de e Exibir até no horário de São Paulo (UTC−03). Campos vazios deixam o anúncio permanente; só início deixa-o ativo a partir daquela data; só término permite exibição até aquele momento. O início é inclusivo e o término exclusivo. Salvar e publicar para ativar. Ocultar prevalece sobre as datas.

O painel exige ao menos um destaque visível sem datas, para haver conteúdo permanente de reserva. Uma campanha encerrada permanece no cadastro para reaproveitamento. O visitante recebe o horário do servidor, e a página aberta reavalia os anúncios a cada segundo; ao retornar de uma aba suspensa, a próxima atualização aplica o horário atual. A programação não altera cursos, preços ou matrículas.

## Cópias automáticas e manuais

O painel guarda automaticamente uma cópia ANTES de salvar rascunho, publicar, importar, recuperar uma versão, excluir contato ou enviar arquivo. Se a cópia falhar, a alteração administrativa é interrompida. A cópia representa o estado anterior à operação; para guardar o estado mais recente imediatamente, usar Criar cópia agora.

A cópia inclui tabelas de conteúdo, histórico, contatos e cadastro dos arquivos, além dos bytes de imagens e PDFs enviados. Os arquivos são preservados por SHA-256, e o manifesto só fica disponível depois de todos os arquivos terem sido copiados. As leituras do banco são feitas em um único batch transacional. Rotas de cópia e exportação exigem sessão administrativa; os objetos de backup não podem ser acessados pela rota pública de mídia.

Verificar confere os hashes dos arquivos. Baixar cópia gera NDJSON: primeira linha com manifesto e demais linhas com os arquivos em base64. Esse download contém dados pessoais dos contatos e deve ser guardado em armazenamento restrito da instituição.

Recuperar conteúdo restaura o conteúdo publicado na cópia (ou o rascunho, se ainda não havia publicação) COMO RASCUNHO e recupera arquivos ausentes. Preserva o site publicado, contatos e contas atuais. Uma cópia preventiva é criada antes da recuperação. O histórico completo e contatos permanecem no arquivo para recuperação técnica em ambiente separado; não são importados automaticamente, para evitar reativar cadastros que foram excluídos depois da cópia.

## Limites que ainda exigem configuração

- Cópias ficam na mesma conta/hospedagem. Não protegem contra perda dessa conta. Guardar downloads externamente até configurar destino independente.
- Não há agendamento diário independente nem alertas de falha ativados. Novos contatos da newsletter não acionam backup; entram na próxima cópia manual ou administrativa.
- Contas, hashes de senhas, sessões, limites de acesso e configurações privadas não estão nesse arquivo. O código e as imagens estáticas ficam nas versões publicadas do projeto. Recuperação integral da infraestrutura exige também banco/configuração/código da conta de hospedagem.
- Até 100 cópias mais recentes são listadas. Nenhuma cópia é eliminada automaticamente; retenção e limpeza precisam de política definida pela instituição. Isso também afeta pedidos de exclusão de dados pessoais e custos de armazenamento.
- A restauração automática de arquivo baixado para outra hospedagem ainda depende de ferramenta de migração e ensaio de recuperação integral. A função do painel foi testada para recuperar conteúdo e arquivos, preservando contas e contatos atuais.

O item de backup integral externo, diário e com recuperação de desastre NÃO está concluído por esta entrega.
