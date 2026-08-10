import { isBuiltin } from "node:module";
import { defineConfig, type TsdownPlugin } from "tsdown";
import packageJson from "./package.json" with { type: "json" };
import {
  SSH_RUNTIME_ENTRY_CONFIG,
  SSH_RUNTIME_MANIFEST_VERSION,
  sshRuntimeManifestFileName,
  type SshRuntimeEntryName,
} from "./src/shared/sshRuntimeManifest.ts";

const isProd = process.env.NODE_ENV === "production";
const sourcemap = isProd ? ("hidden" as const) : true;

function readEnvValue(key: string): string {
  return (process.env[key] ?? "").trim();
}

// Channel is read inline here (vs imported from src/shared/channel) because
// tsdown's config loader doesn't follow TS-extension resolution. Equivalence
// with src/shared/channel.normalizeChannel + scripts/electron-builder.shared.cjs
// is pinned by src/shared/channel.config-parity.test.ts.
const channel = process.env.PORACODE_CHANNEL === "nightly" ? "nightly" : "stable";

const buildDefines = {
  __BUILD_SENTRY_DSN__: JSON.stringify(readEnvValue("SENTRY_DSN")),
  __BUILD_SENTRY_ENVIRONMENT__: JSON.stringify(readEnvValue("SENTRY_ENVIRONMENT")),
  __PORACODE_CHANNEL__: JSON.stringify(channel),
};

function packageNameFor(moduleId: string): string | null {
  if (moduleId.startsWith(".") || moduleId.startsWith("/") || isBuiltin(moduleId)) return null;
  const parts = moduleId.split("/");
  const packageName = moduleId.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return packageName && !isBuiltin(packageName) ? packageName : null;
}

function sshRuntimeManifest(entryName: SshRuntimeEntryName): TsdownPlugin {
  return {
    name: `poracode:ssh-runtime-manifest:${entryName}`,
    generateBundle(_options, bundle) {
      const files = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((output) => output.fileName)
        .sort();
      const fileSet = new Set(files);
      const dependencies = new Set<string>(SSH_RUNTIME_ENTRY_CONFIG[entryName]);
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of [...output.imports, ...output.dynamicImports]) {
          if (fileSet.has(moduleId)) continue;
          const dependency = packageNameFor(moduleId);
          if (dependency) dependencies.add(dependency);
        }
      }
      for (const dependency of dependencies) {
        if (!(dependency in packageJson.dependencies)) {
          throw new Error(`SSH runtime dependency is missing from package.json: ${dependency}`);
        }
      }
      this.emitFile({
        type: "asset",
        fileName: sshRuntimeManifestFileName(entryName),
        source: `${JSON.stringify({
          version: SSH_RUNTIME_MANIFEST_VERSION,
          files,
          dependencies: [...dependencies].sort(),
        })}\n`,
      });
    },
  };
}

const deps = {
  // @poracode/agents-usage is an internal workspace package consumed from
  // source (its exports point at src/*.ts). It must be bundled into the
  // supervisor — left external, Node's ESM loader would try to load its raw
  // extensionless .ts imports at runtime and crash.
  alwaysBundle: [
    "electron-updater",
    "simple-git",
    "zod",
    "@sindresorhus/slugify",
    /^@poracode\/agents-usage(?:\/|$)/,
  ],
  onlyBundle: false as const,
  neverBundle: [
    "electron",
    "node-pty",
    "better-sqlite3",
    "sharp",
    "@anthropic-ai/claude-agent-sdk",
    "@cursor/sdk",
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
    // Desktop-local backend host: owns supervisor event durability and the
    // agent process tree outside Electron's latency-sensitive main process.
    entry: { backendHost: "src/backend/index.ts" },
    clean: false,
    ...shared,
  },
  {
    entry: { legacyMigrationWorker: "src/backend/legacyMigrationWorker.ts" },
    clean: false,
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
    plugins: [sshRuntimeManifest("supervisor")],
    ...shared,
  },
  {
    // Standalone headless remote server (no Electron). Forks the same
    // supervisor.cjs and reuses the same RemoteAccessServer as the desktop.
    // See docs/REMOTE_ARCHITECTURE.md.
    entry: { server: "src/server/cli.ts" },
    clean: false,
    plugins: [sshRuntimeManifest("server")],
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
    plugins: [sshRuntimeManifest("claudeSdkProbeWorker")],
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
    // Self-contained transport shell. The user-installed @cursor/sdk entry is
    // discovered and dynamically imported at runtime inside this worker.
    entry: { cursorSdkWorker: "src/supervisor/agents/cursor/sdkWorker.ts" },
    clean: false,
    plugins: [sshRuntimeManifest("cursorSdkWorker")],
    outDir: "dist/main",
    platform: "node" as const,
    format: "esm" as const,
    // The external SDK's documented floor is Node 22.13. Keep this portable
    // worker compiled for Node 22 even though Poracode itself requires Node 24.
    target: "node22" as const,
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
  {
    // Separate build prevents shared chunks; this worker is deployed alone into WSL.
    entry: { mcpToolFilterWorker: "src/supervisor/mcp/mcpToolFilterWorker.ts" },
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
