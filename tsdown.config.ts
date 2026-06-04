import { defineConfig } from "tsdown";

const isProd = process.env.NODE_ENV === "production";
const sourcemap = isProd ? ("hidden" as const) : true;

function readEnvValue(key: string): string {
  return (process.env[key] ?? "").trim();
}

// Channel is read inline here (vs imported from src/shared/channel) because
// tsdown's config loader doesn't follow TS-extension resolution. Equivalence
// with src/shared/channel.normalizeChannel + scripts/electron-builder.shared.cjs
// is pinned by src/shared/channel.config-parity.test.ts.
const channel = process.env.LIGHTCODE_CHANNEL === "nightly" ? "nightly" : "stable";

const buildDefines = {
  __BUILD_SENTRY_DSN__: JSON.stringify(readEnvValue("SENTRY_DSN")),
  __BUILD_SENTRY_ENVIRONMENT__: JSON.stringify(readEnvValue("SENTRY_ENVIRONMENT")),
  __LIGHTCODE_CHANNEL__: JSON.stringify(channel),
};

const deps = {
  // @lightcode/agents-usage is an internal workspace package consumed from
  // source (its exports point at src/*.ts). It must be bundled into the
  // supervisor — left external, Node's ESM loader would try to load its raw
  // extensionless .ts imports at runtime and crash.
  alwaysBundle: ["electron-updater", "simple-git", "zod", "@lightcode/agents-usage"],
  onlyBundle: false as const,
  neverBundle: [
    "electron",
    "node-pty",
    "better-sqlite3",
    "@anthropic-ai/claude-agent-sdk",
    "@opencode-ai/sdk",
  ],
};

const shared = {
  outDir: "dist/main",
  platform: "node" as const,
  format: "cjs" as const,
  target: "node24" as const,
  sourcemap,
  dts: false,
  minify: isProd ? ({ compress: { dropConsole: true, dropDebugger: true } } as const) : false,
  define: buildDefines,
  deps,
};

export default defineConfig([
  {
    entry: { main: "src/main/main.ts" },
    clean: true,
    ...shared,
  },
  {
    entry: { preload: "src/main/preload.ts" },
    clean: false,
    ...shared,
  },
  {
    entry: { supervisor: "src/supervisor/index.ts" },
    clean: false,
    ...shared,
  },
  {
    entry: { claudeSdkProbeWorker: "src/supervisor/agents/claude/sdkProbeWorker.ts" },
    clean: false,
    outDir: "dist/main",
    platform: "node" as const,
    format: "esm" as const,
    target: "node24" as const,
    sourcemap,
    dts: false,
    minify: false,
    define: buildDefines,
    deps,
  },
]);
