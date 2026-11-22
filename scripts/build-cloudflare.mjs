// Monta o site para a conta Cloudflare do GETEPE (nomes e banco de cloudflare.json). Depois: npx wrangler deploy --config dist/server/wrangler.json
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const build = spawnSync(process.execPath, [fileURLToPath(new URL("./run-framework.mjs", import.meta.url)), "build"], {
  stdio: "inherit",
  env: { ...process.env, CLOUDFLARE_DEPLOY: "1" },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

// Páginas e arquivos estáticos (matrícula, guias, imagens) não passam pelo Worker: o Cloudflare aplica estes
// cabeçalhos de segurança a partir do _headers. HSTS faz o navegador usar sempre https; frame-ancestors impede
// que outro site mostre o formulário de matrícula dentro de uma página dele.
appendFileSync(new URL("../dist/client/_headers", import.meta.url), `
# Segurança em todas as páginas estáticas (scripts/build-cloudflare.mjs)
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: frame-ancestors 'self'
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
`);
