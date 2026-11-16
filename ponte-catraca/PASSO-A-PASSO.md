# Passo a passo: trocar o Secullum pela ponte da catraca

Legenda: **[você]** = só você consegue fazer · **[eu]** = eu faço · **[juntos]** = você no PC, eu acompanhando.

O Secullum continua funcionando normalmente até a etapa 7. Nada aqui desliga a catraca antes da hora.

**Aluno novo até a troca:** cadastre a digital como hoje (menu da catraca, número, dedo 3 vezes) e, no painel, abra a
ficha do aluno → **Definir número da catraca** → digite **o mesmo número**. Assim ele continua passando depois da troca.

---

## Etapa 1 · Colocar o site novo no ar

1. **[você]** Abrir e aprovar o pull request da branch `feature/catraca` no GitHub (Create pull request → Merge).
2. **[você]** Me dizer **onde o site está hospedado** (Cloudflare na conta do curso, ou a hospedagem do fluxo "Sites").
   - Se for Cloudflare: rodar uma vez `npx wrangler login` na pasta do site. **[eu]** aplico as migrações 0003 e 0004 no banco e confiro.
3. **[você]** Criar o segredo da catraca na hospedagem:
   - Gere o token no PowerShell (não mande para mim; guarde num lugar seguro):
     ```powershell
     -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
     ```
   - Cadastre como `CATRACA_TOKEN` na hospedagem. O mesmo valor vai depois no `config.json` da ponte (etapa 6).
4. **[você]** Cadastrar no painel as turmas, os planos e os alunos atuais (ou me pedir uma importação, se já houver planilha).

## Etapa 2 · Informações da catraca (me mandar)

Tudo isso aparece no Secullum ou na própria catraca. Prints servem.

São **duas catracas**: as informações abaixo valem para cada uma.

- [ ] Foto da **etiqueta** de cada catraca (modelo e número de série).
- [ ] Tela de **equipamentos** do Secullum: IP de cada catraca, porta, **número do equipamento** (Inner nº) e tipo de conexão.
- [ ] Hoje, quando um aluno cadastra a digital no menu de **uma** catraca, ele já passa na **outra**?
  Ou a recepção cadastra o dedo nas duas? (Cada catraca guarda as próprias digitais; preciso saber se o
  Secullum copia de uma para a outra.)
- [ ] Se o Secullum mostra a **versão do firmware** e o **modelo do leitor biométrico**, um print disso também.
- [ ] Em **qual PC** o Secullum roda, qual Windows, e se é **este mesmo computador** onde conversamos.
- [ ] Mais ou menos **quantas pessoas** têm digital cadastrada hoje.
- [ ] A catraca libera a **saída** sem identificação, ou também pede o dedo para sair?

## Etapa 3 · Banco do Secullum (sem mandar o banco inteiro)

As digitais são **dado sensível** (LGPD). O plano é não copiar o banco inteiro para lugar nenhum e não colocar
digitais no site: elas continuam só na catraca e numa cópia de segurança no PC do curso.

O que eu preciso para ler só o necessário (número, nome, CPF e a ligação com a digital):

- [ ] **Nome da instância do SQL Server** e **nome do banco** do Secullum.
  - Onde ver: na configuração de conexão do Secullum, ou no "SQL Server Configuration Manager" do PC.
- [ ] Como o Secullum entra no banco: **login do Windows** ou **usuário e senha do SQL**.
  - Se for usuário e senha, **não me mande a senha**: você digita quando o programa pedir.
- [ ] Se o banco estiver **neste PC**: me autorize a fazer uma consulta **só de leitura** (listar tabelas e ler pessoas e números).
  - Se estiver em **outro PC**: eu te passo um script; você roda lá e me manda só o arquivo que ele gerar (sem digitais).

Plano B para as digitais: a própria catraca guarda as digitais com o número de cada pessoa, e a ponte
consegue baixá-las do equipamento. Por isso, mesmo que o banco do Secullum seja difícil de ler, ninguém
precisa recadastrar o dedo.

## Etapa 4 · SDK da Topdata

- [ ] **[você]** Fazer o cadastro (gratuito) no [portal de integradores da Topdata](https://integrador.topdata.com.br/suporte/sdk-easyinner/) e baixar o **SDK EasyInner**.
- [ ] Colocar o conteúdo do SDK numa pasta e me dizer onde está. Preciso de:
  - `EasyInner.dll` (e as outras DLLs que vierem junto);
  - o **manual em PDF**;
  - o **exemplo em C#**.
- [ ] (Recomendado) Mandar um e-mail para a Topdata confirmando que o uso interno, num único curso, está liberado.

## Etapa 5 · Primeiro teste na catraca real (cerca de 1 hora, sem aula)

**[juntos]**, de preferência com esta sessão aberta no PC da catraca:

1. Fechar o Secullum e parar o serviço dele. A catraca fica sem controle durante o teste.
2. Rodar a ponte na janela: `PonteCatraca.exe --console`.
3. Conferir que as **duas catracas** aparecem conectadas no log. Testar com 3 pessoas, nas duas catracas: uma em dia (deve aparecer "LIBERADO / nome"), uma bloqueada ("VER NA RECEPCAO") e uma sem cadastro.
4. Testar o **cadastro pelo menu da catraca** com a ponte ligada: abrir o menu, digitar um número novo, pôr o dedo 3 vezes,
   e conferir se depois esse dedo aparece com o número certo. Se o menu não abrir com a ponte ligada, eu habilito
   pela configuração (`PermitirCadastroInnerBioVerid`) ou faço o cadastro pelo painel.
5. Me mandar o arquivo de log do dia: `dados\logs\AAAA-MM-DD.log`.
6. **Volta ao normal:** fechar a ponte e abrir o Secullum de novo.

O log confirma os códigos que a documentação deixou em aberto (digital, giro e tempo de liberação).

## Etapa 6 · O que eu desenvolvo depois do teste

- **[eu]** Ajustes que o log do teste mostrar.
- **Cadastro de digital continua igual ao de hoje**: no menu da catraca, digitar o número do aluno e ele põe o dedo 3 vezes.
  A diferença é que o número vem da ficha do aluno no painel ("Definir número da catraca").
  - **[eu]** **Cópia da digital entre as duas catracas**: quando a digital é cadastrada no menu de uma catraca, a ponte
    copia para a outra, para o aluno passar em qualquer uma. (Se hoje o Secullum já faz isso, essa parte é obrigatória.)
  - **[eu]** (opcional) a ponte confere na catraca quem já tem digital e marca "biometria cadastrada" no painel sozinha.
  - **[eu]** (só se o menu não funcionar com a ponte ligada) cadastro de digital iniciado pelo painel.
- **[eu]** **Importação do Secullum**: liga cada pessoa do Secullum ao aluno do painel (pelo CPF ou pelo nome) e preenche o número antigo, para quem já tem digital continuar passando.
- **[eu]** Cópia de segurança das digitais no PC do curso, para restaurar a catraca se ela for trocada ou resetada.

## Etapa 7 · Troca definitiva

1. **[juntos]** Instalar a ponte como serviço do Windows no PC da catraca (ver [LEIAME.md](LEIAME.md)) e colocar o token no `config.json`.
2. **[você]** Desativar o serviço do Secullum. **Não desinstalar** por 30 dias: ele é o plano de volta.
3. **[você]** Na primeira semana, olhar a área **Catraca** do painel todo dia: a catraca precisa aparecer como "Funcionando" e as passagens precisam chegar.
4. Depois de 30 dias sem problema, o Secullum pode sair.

---

## Resumo do que me mandar

| Item | Etapa |
|---|---|
| Onde o site está hospedado | 1 |
| Foto da etiqueta e prints da tela de equipamentos do Secullum | 2 |
| Em qual PC fica o Secullum e se é este computador | 2 |
| Instância e nome do banco SQL do Secullum e o tipo de login (**sem senha**) | 3 |
| Pasta com o SDK EasyInner (DLL, manual PDF, exemplo C#) | 4 |
| Log do primeiro teste | 5 |

**Não mande:** senhas, o token da catraca, nem cópia (.bak) do banco do Secullum.
