# Matrículas do site na planilha do painel

Cada matrícula feita no site fica no banco D1 e aparece no painel do site. Com esta integração ligada, ela também vira uma linha na aba **Matrículas do site** da planilha do painel da equipe. A linha é atualizada sempre que a matrícula muda: quando chega, quando o contrato é assinado, quando muda de situação, quando a biometria é cadastrada e quando uma parcela é baixada.

A partir dessa aba, a planilha calcula sozinha:

- **Visão geral:** resumo do dia em retângulos, com as matrículas recebidas e efetivadas em destaque, e os números da conferência diária;
- **Agenda de matrículas:** calendário do mês com quantas matrículas chegaram e quantas foram efetivadas em cada dia;
- **Contagem por turma:** efetivadas (só com contrato assinado), aguardando assinatura, pagamento e biometria, ativas, canceladas e vagas livres.

## O que vai para a planilha

Código da matrícula (8 caracteres), data e hora em que chegou, turma, plano, forma de pagamento, valor do contrato, vagas da turma, situação e data da assinatura do contrato.

**Não vão** nome, CPF, e-mail, telefone, endereço nem dados de responsável. O código aparece também na ficha da matrícula, no painel do site, para a equipe saber de quem se trata.

## Ligar a integração (uma vez)

1. Abra a planilha do painel e vá em **Extensões > Apps Script**.
2. Crie um arquivo de script (ou use o `Código.gs`, se o projeto estiver vazio) e cole o conteúdo de [`Code.gs`](Code.gs). Salve.
3. Gere uma chave aleatória longa, de pelo menos 32 caracteres (um gerenciador de senhas resolve). Ela não pode ser publicada em nenhum lugar.
4. Em **Configurações do projeto** (engrenagem) > **Propriedades do script** > **Adicionar propriedade do script**: nome `WEBHOOK_SECRET`, valor a chave do passo 3. Salve.
5. **Implantar > Nova implantação**, tipo **App da Web**:
   - Descrição: `Matrículas do site`;
   - Executar como: **Eu**;
   - Quem pode acessar: **Qualquer pessoa**. O site precisa chamar o endereço sem login; sem a chave, o script recusa o envio.
6. Clique em **Implantar**, autorize o acesso com a conta dona da planilha e copie a **URL do app da Web** (termina em `/exec`).
7. Na configuração privada da hospedagem do site, crie dois segredos:
   - `MATRICULAS_SHEET_URL` = a URL do passo 6;
   - `MATRICULAS_SHEET_SECRET` = a chave do passo 3.
8. Faça uma matrícula de teste pelo site e confira a linha nova na aba **Matrículas do site** e os números na **Visão geral**. Depois, cancele a matrícula de teste no painel do site e apague a linha na planilha.

Sem os dois segredos, a integração fica desligada e as matrículas ficam só no painel do site.

## Lançar o aluno na planilha "Alunos 202X" (opcional)

Com esta parte ligada, toda matrícula com **contrato assinado** vira uma linha na planilha de alunos da equipe, no mesmo padrão que ela já usa:

| Coluna | O que o site preenche |
|---|---|
| A quantidade | o próximo número, se a célula estiver vazia |
| B Lexus | fica em branco |
| C NOMES | nome do aluno em maiúsculas |
| D DT MATRICULA | dia em que a matrícula chegou pelo site |
| E ESCOLA | o **código na planilha de alunos** cadastrado na turma, no painel do site (ex.: BSET27) |
| F TURMA | M, T, N ou ONLINE, tirado do turno da turma |
| G OCORRENCIAS | `Site` e o código da matrícula, por exemplo `Site A1B2C3D4`. **Não apague esse texto**: é por ele que o script acha a linha |
| H ATIVO | ATIVO; muda para DESLIGADO se a matrícula for cancelada no painel |
| I TOTAL | valor do contrato |
| blocos dos meses | DATA, VALOR, PAGO e FORMA de cada parcela, no mês do vencimento (o script lê os títulos da linha 1, como `JULHO/26`). Taxa de matrícula e mensalidade no mesmo mês ficam somadas |

Depois de lançada, a linha é da equipe: o script só muda a situação para DESLIGADO no cancelamento e preenche PAGO e FORMA quando uma parcela é baixada no painel, e só se PAGO estiver vazio. O resto que a equipe editar fica como está. Parcela que vence num mês sem coluna na planilha fica anotada em OCORRENCIAS.

Para ligar:

1. No mesmo projeto do Apps Script, em **Propriedades do script**, adicione `ALUNOS_PLANILHA_ID` com o ID da planilha de alunos (o trecho entre `/d/` e `/edit` no endereço dela). Se a aba não se chamar `Alunos 2027`, adicione também `ALUNOS_ABA` com o nome da aba. Na virada do ano, troque os dois.
2. A conta que implantou o script precisa poder editar a planilha de alunos.
3. Publique uma nova versão (veja abaixo) e autorize de novo: o script passa a pedir acesso às suas planilhas.
4. No painel do site, em cada turma, preencha **Código na planilha de alunos**.
5. Faça uma matrícula de teste, marque o contrato como assinado e confira a linha. Depois, apague a linha de teste e cancele a matrícula.

Sem `ALUNOS_PLANILHA_ID`, nada vai para a planilha de alunos.

**Atenção à contagem dupla:** com isso ligado, a equipe não deve digitar de novo, na planilha de alunos, quem se matriculou pelo site. No Planejamento das Turmas, as linhas com `Site` em OCORRENCIAS já são contadas pela aba Matrículas do site.

## Ao mudar o script

Use **Implantar > Gerenciar implantações > Editar > Versão: Nova versão**. Assim a URL continua a mesma.

## Fuso horário

A planilha está no fuso de São Paulo (Arquivo > Configurações). A Visão geral usa `=HOJE()` na célula C2, e a agenda destaca o dia atual com regras `=B$5=HOJE()` (e equivalentes). As datas enviadas pelo site são gravadas no dia de São Paulo ao meio-dia UTC, então continuam no dia certo mesmo se o fuso da planilha mudar.

## Dados

A planilha do painel não recebe dados pessoais, mas mostra o andamento e o valor dos contratos. A planilha de alunos recebe o **nome** do aluno e os valores, nunca CPF, e-mail, telefone, endereço ou dados do responsável. Compartilhe as duas só com quem cuida de matrículas e financeiro. Não publique o link das planilhas nem a chave.
