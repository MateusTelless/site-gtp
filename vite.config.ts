import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import deployConfig from "./cloudflare.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";
import { connectorPreview } from "./build/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./build/sites-worker.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

// Build para a conta Cloudflare do GETEPE (cloudflare.json): nome do Worker, banco D1 e bucket R2 reais,
// logs e rastreamento ligados. A prévia local (npm run dev) continua com os nomes de exemplo acima.
function deployBindingConfig() {
  if (!deployConfig.d1.database_id) {
    throw new Error("Falta o database_id do D1 em cloudflare.json (crie o banco e cole o número; veja PUBLICAR-CLOUDFLARE.md).");
  }
  return {
    ...localBindingConfig,
    name: deployConfig.name,
    compatibility_date: deployConfig.compatibility_date,
    d1_databases: d1 ? [{ binding: d1, database_name: deployConfig.d1.database_name, database_id: deployConfig.d1.database_id, migrations_dir: "../../drizzle" }] : [],
    r2_buckets: r2 ? [{ binding: r2, bucket_name: deployConfig.r2.bucket_name }] : [],
    observability: { enabled: true, traces: { enabled: true } },
    // Domínios ligados ao Worker (custom domain: o Cloudflare cria o DNS e o certificado).
    routes: deployConfig.routes,
    // A página inicial passa pelo Worker (que devolve a mesma página): assim o tellespires.com.br/ também é redirecionado.
    assets: { run_worker_first: ["/"] },
  };
}

export default defineConfig(async ({ command }) => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      connectorPreview(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...(command === "build" && process.env.CLOUDFLARE_DEPLOY === "1" ? deployBindingConfig() : localBindingConfig),
          ...(command === "serve"
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./build/connector-preview-worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
