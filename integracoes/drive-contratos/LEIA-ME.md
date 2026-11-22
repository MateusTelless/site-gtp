# Contratos assinados no Google Drive

Quando o aluno (ou o responsável) assina o contrato no DocuSeal, o site baixa o PDF final, já com as duas assinaturas: a do GETEPÊ entra pronta no envio e a do contratante vem na assinatura. O site guarda esse PDF no arquivo privado do GETEPÊ (R2). Com esta integração ligada, ele também manda uma cópia para a pasta **Contratos assinados** do Google Drive da conta do GETEPÊ.

Dentro dela, cada turma tem a sua subpasta, com o mesmo nome da turma no painel do site. A subpasta é criada sozinha quando chega o primeiro contrato da turma. O arquivo se chama `Nome do aluno - CÓDIGO.pdf`, em que o código é o da matrícula (8 caracteres), o mesmo da ficha no painel.

O contrato tem CPF, endereço e, no caso de menor, dados do aluno e do responsável. **Não compartilhe a pasta por link.** Dê acesso só a quem da equipe precisa, pelo nome da pessoa, em **Compartilhar** no Drive.

## Ligar a integração (uma vez)

1. Entre em [script.google.com](https://script.google.com) com a conta dona da pasta **Contratos assinados** e clique em **Novo projeto**. Dê o nome `Contratos assinados do site`.
2. Apague o conteúdo do `Código.gs`, cole o conteúdo de [`Code.gs`](Code.gs) e salve.
3. Gere uma chave aleatória longa, com pelo menos 32 caracteres (um gerenciador de senhas resolve). Não publique a chave em lugar nenhum.
4. Em **Configurações do projeto** (engrenagem) > **Propriedades do script**, adicione duas propriedades:
   - `WEBHOOK_SECRET`: a chave do passo 3;
   - `PASTA_ID`: o código da pasta **Contratos assinados**. É o final do endereço da pasta no Drive, depois de `/folders/`.
5. Vá em **Implantar > Nova implantação** e escolha o tipo **App da Web**:
   - Descrição: `Contratos assinados`;
   - Executar como: **Eu**;
   - Quem pode acessar: **Qualquer pessoa**. O site chama o endereço sem login; sem a chave, o script recusa o envio.
6. Clique em **Implantar**, autorize o acesso ao Drive com a mesma conta e copie a **URL do app da Web** (termina em `/exec`).
7. Na configuração privada da hospedagem do site, crie dois segredos:
   - `CONTRATOS_DRIVE_URL`: a URL do passo 6;
   - `CONTRATOS_DRIVE_SECRET`: a chave do passo 3.
8. No painel do site, em **Matrículas**, clique em **Guardar cópia dos contratos assinados**. Os contratos já assinados vão para o Drive, até 20 por clique. Se faltar algum, clique de novo.

## Como funciona

- O envio acontece na hora em que o DocuSeal avisa que o contrato foi assinado.
- Se o Drive falhar, a matrícula não é afetada e a falha fica no registro de alterações. O site tenta de novo no próximo aviso do DocuSeal ou quando a equipe clicar em **Guardar cópia dos contratos assinados** no painel.
- Cada contrato vai uma vez só: o site marca o envio no registro de alterações. O script também confere se o arquivo da matrícula já está na subpasta e não duplica.
- O script só aceita PDF e confere o SHA-256 do arquivo, o mesmo guardado no registro de alterações do site.
- Se uma turma mudar de nome no painel, os contratos novos vão para uma subpasta com o nome novo. Os antigos ficam na subpasta antiga.

Sem os dois segredos, a integração fica desligada e o contrato fica só no arquivo do site (Painel > ficha da matrícula > contrato).
