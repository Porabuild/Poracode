// Vercel build entry for the hosted PWA. Stable and nightly deployments each
// own a dedicated origin (app.poracode.com and app-nightly.poracode.com), so
// both builds are rooted at `/` and get origin-isolated storage, permissions,
// assets, and service workers.
import { spawnSync } from "node:child_process";

const channel = process.env.VERCEL_ENV === "preview" ? "nightly" : "stable";
const basePath = "/";
console.log(
  `[vercel-build-web] VERCEL_ENV=${process.env.VERCEL_ENV} channel=${channel} base=${basePath}`,
);

const result = spawnSync("pnpm", ["run", "build:web"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORACODE_WEB_CHANNEL: channel,
    PORACODE_WEB_BASE_PATH: basePath,
    npm_config_enable_global_virtual_store: "false",
    npm_config_node_linker: "isolated",
    pnpm_config_verify_deps_before_run: "false",
  },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
