// Monta o site para a conta Cloudflare do GETEPE (nomes e banco de cloudflare.json). Depois: npx wrangler deploy --config dist/server/wrangler.json
process.env.CLOUDFLARE_DEPLOY = "1";
process.argv = [process.argv[0], new URL("./run-framework.mjs", import.meta.url).pathname, "build"];
await import("./run-framework.mjs");
