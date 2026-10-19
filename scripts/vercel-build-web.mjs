// Vercel build entry for the hosted PWA. Stable and nightly deployments each
// own a dedicated origin (app.poracode.com and app-nightly.poracode.com), so
// both builds are rooted at `/` and get origin-isolated storage, permissions,
// assets, and service workers.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const channel = process.env.VERCEL_ENV === "preview" ? "nightly" : "stable";
const basePath = "/";
console.log(
  `[vercel-build-web] VERCEL_ENV=${process.env.VERCEL_ENV} channel=${channel} base=${basePath}`,
);

const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./setup-bun.mjs", import.meta.url)), "--run", "run", "build:web"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORACODE_WEB_CHANNEL: channel,
      PORACODE_WEB_BASE_PATH: basePath,
      BUN_INSTALL_GLOBAL_STORE: "0",
    },
  },
);
process.exit(result.status ?? 1);
