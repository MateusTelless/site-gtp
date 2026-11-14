# Pedidos de aula teste na planilha do Google

Cada pedido feito no formulário "Aula teste" do site é gravado no banco D1 (aba **Pedidos de aula teste** do painel). Quando a integração está ligada, ele também vira uma linha na aba **Pedidos** da planilha da equipe. Se o Google falhar, o pedido continua no D1 e o painel mostra "Planilha: erro" nessa linha.

A planilha tem as colunas Data do pedido, Nome, E-mail, Telefone, Curso, Status (Novo, Contatado, Matriculado, Sem interesse) e Observações. As duas últimas são para a equipe preencher.

## Ligar a integração (uma vez)

1. Abra a planilha e vá em **Extensões > Apps Script**.
2. Apague o conteúdo de `Código.gs` e cole o conteúdo de [`Code.gs`](Code.gs). Salve.
3. Gere uma chave aleatória longa, de pelo menos 32 caracteres (um gerenciador de senhas resolve). Ela não pode ser publicada em nenhum lugar.
4. No Apps Script, vá em **Configurações do projeto** (engrenagem) > **Propriedades do script** > **Adicionar propriedade do script**. Nome: `WEBHOOK_SECRET`; valor: a chave do passo 3. Salve.
5. Clique em **Implantar > Nova implantação**. Em "Tipo", escolha **App da Web**:
   - Descrição: `Pedidos de aula teste`;
   - Executar como: **Eu**;
   - Quem pode acessar: **Qualquer pessoa**. O site precisa chamar o endereço sem login. Sem a chave, o script recusa o envio.
6. Clique em **Implantar**, autorize o acesso à planilha com a conta dona dela e copie a **URL do app da Web**. Ela termina em `/exec`.
7. Na configuração privada da hospedagem do site, crie dois segredos:
   - `SHEETS_WEBHOOK_URL` = a URL do passo 6;
   - `SHEETS_WEBHOOK_SECRET` = a chave do passo 3.
8. Faça um pedido de teste pelo site e confira a linha nova na planilha e "Planilha: enviado" no painel.

Sem os dois segredos, a integração fica desligada e os pedidos ficam só no painel.

## Ao mudar o script

Depois de editar o `Code.gs`, use **Implantar > Gerenciar implantações > Editar > Versão: Nova versão**. Assim a URL continua a mesma. Uma "Nova implantação" gera outra URL, que precisaria ser trocada na hospedagem.

## Dados pessoais

A planilha guarda nome, e-mail e telefone. Compartilhe só com quem atende os interessados. Quando alguém pedir exclusão, apague a linha na planilha **e** o pedido no painel. Não publique o link da planilha nem a chave.
