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
  alwaysBundle: ["electron-updater", "simple-git", "zod", /^@lightcode\/agents-usage(?:\/|$)/],
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

const cliShared = {
  ...shared,
  // CLI entrypoints need their operational logs in production builds. The
  // desktop bundle can drop console noise, but `pnpm run server` and
  // `pnpm run relay` are otherwise silent after tsdown minification.
  minify: isProd ? ({ compress: { dropDebugger: true } } as const) : false,
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
    // Standalone headless remote server (no Electron). Forks the same
    // supervisor.cjs and reuses the same RemoteAccessServer as the desktop.
    // See docs/REMOTE_ARCHITECTURE.md.
    entry: { server: "src/server/cli.ts" },
    clean: false,
    ...cliShared,
  },
  {
    // Self-hostable relay for cross-network access (Phase 5). A dumb HTTP+WS
    // tunnel between NAT'd servers and devices. See docs/REMOTE_ARCHITECTURE.md.
    entry: { relay: "src/server/relay/cli.ts" },
    clean: false,
    ...cliShared,
  },
  {
    // Build-time helper used to embed the exact desktop SSH runtime in native
    // mobile packages. It is never loaded by either application at runtime.
    entry: { sshRuntimeBundle: "src/main/ssh/runtimeBundle.ts" },
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
  {
    // Self-contained so it can be staged and executed inside a WSL distro.
    entry: { mcpProbeWorker: "src/supervisor/mcp/probeMcpWorker.ts" },
    clean: false,
    outDir: "dist/main",
    platform: "node" as const,
    format: "esm" as const,
    target: "node24" as const,
    sourcemap,
    dts: false,
    minify: false,
    define: buildDefines,
    deps: {
      ...deps,
      alwaysBundle: [...deps.alwaysBundle, /^@modelcontextprotocol\/sdk(?:\/|$)/, /^zod(?:\/|$)/],
    },
  },
]);
