# Contrato da matrícula pelo DocuSeal

O site envia o contrato pelo DocuSeal e marca a matrícula como efetivada quando a pessoa assina. Sem a chave da API ou sem o modelo do contrato enviado no painel, a equipe registra o contrato à mão.

## Como funciona

1. **Envio.** O contrato sai logo depois da matrícula.
   - Exceção: desconto de militar ou dependente que a conferência automática não aprovou. Nesse caso a equipe decide no painel:
     - **Aprovar desconto:** o contrato sai junto.
     - **Recusar:** as parcelas voltam ao valor cheio. A equipe fala com a pessoa e envia pelo botão **Enviar contrato pelo DocuSeal**.
2. **Quem assina.** O contrato chega já assinado pelo GETEPE. Assina quem paga: o aluno, se for maior de idade, ou o responsável, se o aluno for menor.
3. **Assinatura.**
   - Quando a pessoa assina, o DocuSeal avisa o site.
   - O site confere direto no DocuSeal antes de marcar, porque esse aviso não tem assinatura de segurança.
   - A matrícula passa para "aguardando pagamento" e vai para as planilhas.
4. **Contrato assinado.** No painel, **Ver contrato assinado** pede ao DocuSeal um link novo, porque os links do DocuSeal valem 40 minutos.
5. **Falha do DocuSeal.** A matrícula é salva mesmo assim. Fica registrado "envio do contrato falhou", e a equipe reenvia pelo botão.

## 1. O modelo do contrato (Word)

O site manda ao DocuSeal o próprio Word do contrato, a cada matrícula, junto com os dados (`POST /submissions/docx`). Não há modelo cadastrado no DocuSeal.

- **Dados:** no Word, os marcadores ficam entre colchetes duplos, como `[[NomeResponsavel]]`. O DocuSeal troca cada um pelo texto, dentro do próprio parágrafo e com a formatação do contrato, como se tivesse sido digitado.
- **Assinaturas:** são dois campos, nas linhas de assinatura:
  - `{{AssinaturaContratante;type=signature;role=Contratante}}`: quem paga (o aluno maior de idade ou o responsável do menor);
  - `{{AssinaturaGETEPE;type=signature;role=GETEPE}}`: o site manda essa parte já assinada.
- **Onde fica:** o administrador envia o Word no painel, em **Turmas e planos → Modelo do contrato**. O arquivo fica numa pasta privada do site e vale para os próximos contratos; os já enviados não mudam. Administrador e secretaria podem baixar o modelo atual.
- **Arquivo pronto:** `Contrato GETEPE 2027 - site.docx` (em Downloads), feito a partir do contrato com o visual final.
- **Antes de enviar um Word novo**, confira:

  ```
  node scripts/conferir-modelo-contrato.mjs "C:\caminho\do\contrato.docx"
  ```

  O programa mostra as variáveis e as assinaturas encontradas e aponta o que falta, como marcador com um colchete só ou assinatura ausente.

Variáveis que o site preenche:

| Variável | O que vai |
|---|---|
| RA | RA do aluno: o do Lexus para ex-aluno, ou o próximo depois do último RA do Lexus (`RA_ULTIMO_LEXUS`) |
| NomeResponsavel | Nome do contratante |
| RGResponsavel | RG do contratante (pedido na matrícula) |
| CPFResponsavel | CPF do contratante |
| EnderecoCliente | Endereço do contratante |
| NomeCliente | Nome do aluno |
| Turmas | Curso e turma, ex.: APMBB · Barro Branco (turma APMBB 2027 · Manhã) |
| PeriodosTurmas | 12/01/2027 a 27/06/2027 |
| ValorTotalContrato | Preço à vista (cláusula 3ª §3º), com o desconto quando houver |
| FormaPagamento | Pix com as parcelas e o dia de vencimento, ou cartão com as parcelas e o total no cartão |
| ParcelasMatriculas | Cada parcela com data e valor (no cartão, a cobrança no dia da visita) |
| DatasMatriculas | Data da matrícula, ex.: 17 de novembro de 2026 |

O prazo da cláusula 4ª §3º ficou em **05 (cinco) dias corridos**, igual à tolerância da catraca.

## 2. Chave e aviso

1. No DocuSeal, em **API** (console.docuseal.com/api), crie a chave da API.
2. Escolha um código longo e aleatório, com 24 caracteres ou mais, para o endereço do aviso.
3. Em **Webhooks** (console.docuseal.com/webhooks), cadastre o endereço `https://SEU-SITE/api/docuseal/webhook/<código>`, com o evento **form.completed** (ou **submission.completed**).

## 3. Segredos do site

Cadastre nos segredos do site publicado (nunca no repositório):

- `DOCUSEAL_API_KEY`: a chave da API.
- `DOCUSEAL_WEBHOOK_TOKEN`: o código do endereço do aviso.
- Opcionais:
  - `DOCUSEAL_GETEPE_ASSINATURA`: o nome escrito, que o DocuSeal desenha em fonte de assinatura, ou o link público de uma imagem da assinatura. Sem ele, vai "GETEPE - Curso General Telles Pires".
  - `DOCUSEAL_GETEPE_EMAIL`: e-mail do GETEPE no contrato.
  - `DOCUSEAL_API_URL`: só para conta na Europa (`https://api.docuseal.eu`).

Para testar no computador, coloque os mesmos nomes no arquivo `.dev.vars`, que o Git ignora.

## Privacidade

O DocuSeal recebe os dados do contrato: nome, CPF, endereço e e-mail do aluno e do responsável. A política de privacidade precisa citar o DocuSeal como serviço de assinatura.

## Custo

DocuSeal Pro: US$ 20 por usuário por mês, mais US$ 0,20 por contrato concluído pela API (valores da página de preços do DocuSeal).
