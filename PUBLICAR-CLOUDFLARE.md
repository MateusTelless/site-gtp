# Publicar o site na conta Cloudflare do GETEPE

O site atual (tellespires.com.br) está na hospedagem por onde foi criado (`.openai/hosting.json`). Este guia leva o site novo para a conta Cloudflare do GETEPE, no domínio novo getepe.com.br. Ligar getepe.com.br não muda o site antigo; o redirecionamento de tellespires.com.br é uma decisão à parte.

## O que fica onde

- `cloudflare.json`: nome do site, banco D1 e bucket R2 da conta. Não tem segredo (o número do banco não é senha).
- Segredos: só com `wrangler secret put`, nunca no repositório.
- `npm run build` continua montando o site para a hospedagem atual. `npm run build:cloudflare` monta para a conta Cloudflare.

## 1. Banco e arquivos (uma vez)

1. Ative o R2 no painel do Cloudflare (R2 Object Storage).
2. Crie o banco e o bucket:

   ```
   npx wrangler login
   npx wrangler d1 create getepe-db
   npx wrangler r2 bucket create getepe-arquivos
   ```

3. Copie o `database_id` que o primeiro comando mostra para `cloudflare.json` (campo `d1.database_id`).

## 2. Montar e aplicar as migrações

```
npm run build:cloudflare
npx wrangler d1 migrations apply getepe-db --remote --config dist/server/wrangler.json
```

## 3. Segredos

Um por vez (o Wrangler pede o valor; não cole em conversa nem em arquivo do repositório):

```
npx wrangler secret put AUTH_PROVIDER --config dist/server/wrangler.json
```

Lista: `AUTH_PROVIDER` (password), `ADMIN_EMAILS` e os de `LOGIN-ADMIN.md`; `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_TOKEN` (`integracoes/docuseal/LEIA-ME.md`); `MATRICULAS_SHEET_URL`, `MATRICULAS_SHEET_SECRET`, `SHEETS_WEBHOOK_URL`, `SHEETS_WEBHOOK_SECRET` (planilhas); `CATRACA_TOKEN`; `RA_ULTIMO_LEXUS`; opcional `ANTHROPIC_API_KEY`.

## 4. Publicar no endereço de teste

```
npx wrangler deploy --config dist/server/wrangler.json
```

Depois: SQL dos ex-alunos do Lexus (`scripts/importar-ex-alunos-lexus.mjs`, com `npx wrangler d1 execute getepe-db --remote --file <arquivo>`), modelo do contrato no painel e o aviso (webhook) no DocuSeal.

## 5. Antes do domínio

- Trazer os dados do site atual (conteúdo publicado, imagens do painel, newsletter, aula teste, conta do painel).
- Carregar os alunos atuais, com turma, parcelas e número da catraca, antes de a ponte substituir o Secullum.
- Workers Paid (US$ 5/mês): necessário por causa das leituras da catraca.
- Domínio: adicionar getepe.com.br no Cloudflare, trocar os servidores DNS no Registro.br (copiando antes os registros de e-mail, se houver) e ligar o domínio ao Worker.
