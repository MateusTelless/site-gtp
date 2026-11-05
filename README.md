# GETEPE — site e administração

Veja [OPERACAO.md](OPERACAO.md) para publicação, contatos e limitações.

Código do site: public/ e site-shell.html. Painel: admin-shell.html e public/admin-panel.js. API: app/api/[...path]/route.ts. Banco: db/schema.ts e drizzle/.

Instale com o helper Sites; gere migrações antes do build. Nunca publique arquivos .env, dados locais ou credenciais.

Validação de lógica: `node scripts/test-api.cjs`.
