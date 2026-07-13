import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import packageJson from "../../../package.json" with { type: "json" };

const REMOTE_RUNTIME_DEPENDENCIES = [
  "@agentclientprotocol/sdk",
  "@anthropic-ai/claude-agent-sdk",
  "@modelcontextprotocol/sdk",
  "@opencode-ai/sdk",
  "@sentry/node",
  "better-sqlite3",
  "drizzle-orm",
  "json5",
  "micromatch",
  "node-pty",
  "smol-toml",
  "vscode-jsonrpc",
  "ws",
] as const;

export interface SshRuntimeBundleOptions {
  readonly mainBundleDir: string;
  readonly agentPluginsDir: string;
  readonly wslHelpersDir: string;
  readonly bundledSkillsDir?: string;
  readonly cacheDir: string;
  readonly tarCommand?: string;
}

export interface SshRuntimeBundle {
  readonly archivePath: string;
  readonly hash: string;
}

function runtimePackageJson(): string {
  const dependencies = Object.fromEntries(
    REMOTE_RUNTIME_DEPENDENCIES.map((name) => {
      const version = packageJson.dependencies[name];
      if (!version) throw new Error(`Missing remote runtime dependency ${name}.`);
      return [name, version];
    }),
  );
  return `${JSON.stringify(
    {
      name: "poracode-ssh-runtime",
      version: packageJson.version,
      private: true,
      engines: packageJson.engines,
      dependencies,
    },
    null,
    2,
  )}\n`;
}

function hashDirectory(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string, relativeRoot: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = join(directory, entry);
      const relative = join(relativeRoot, entry).replaceAll("\\", "/");
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute, relative);
      } else if (stat.isFile()) {
        hash.update(relative);
        hash.update("\0");
        hash.update(readFileSync(absolute));
        hash.update("\0");
      }
    }
  };
  visit(root, "");
  return hash.digest("hex");
}

/**
 * Cheap content fingerprint used to decide whether the staged bundle could
 * have changed: relative paths + sizes + mtimes, no file reads. A stat walk is
 * orders of magnitude cheaper than the multi-MB copy + full-content hashing
 * the real bundle build performs on the blocking main-process event loop.
 */
function statSignature(roots: readonly string[], extra: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string, relativeRoot: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = join(directory, entry);
      const relative = join(relativeRoot, entry).replaceAll("\\", "/");
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute, relative);
      } else if (stat.isFile()) {
        hash.update(`${relative}\0${stat.size}\0${stat.mtimeMs}\0`);
      }
    }
  };
  for (const root of roots) {
    hash.update(`${root}\0`);
    if (!existsSync(root)) continue;
    const stat = statSync(root);
    if (stat.isDirectory()) visit(root, "");
    else hash.update(`${stat.size}\0${stat.mtimeMs}\0`);
  }
  hash.update(extra);
  return hash.digest("hex");
}

interface BundleManifest {
  readonly key: string;
  readonly signature: string;
  readonly hash: string;
}

function manifestPath(cacheDir: string): string {
  return join(cacheDir, "bundle-manifest.json");
}

function readBundleManifest(cacheDir: string): BundleManifest | null {
  try {
    const value = JSON.parse(
      readFileSync(manifestPath(cacheDir), "utf8"),
    ) as Partial<BundleManifest> | null;
    return value && typeof value.key === "string" && value.signature && value.hash
      ? (value as BundleManifest)
      : null;
  } catch {
    return null;
  }
}

// The staged runtime is fixed for a given app build, so the archive+hash is
// identical on every connect. Cache it per option set (keyed by the source
// dirs) in memory AND in a manifest file next to the archive, so repeat
// connects — including the first one after an app restart, when connectAll()
// fans out across persisted SSH servers — skip the multi-MB copy + full-file
// hashing. Self-heals if the cached archive is later cleaned up on disk.
let cachedBundle: { readonly key: string; readonly hash: string } | null = null;

export function ensureSshRuntimeBundle(options: SshRuntimeBundleOptions): SshRuntimeBundle {
  const cacheKey = JSON.stringify([
    options.mainBundleDir,
    options.agentPluginsDir,
    options.wslHelpersDir,
    options.bundledSkillsDir ?? null,
    options.cacheDir,
    options.tarCommand ?? null,
  ]);
  if (cachedBundle?.key === cacheKey) {
    const archivePath = join(options.cacheDir, `${cachedBundle.hash}.tar.gz`);
    if (existsSync(archivePath)) return { archivePath, hash: cachedBundle.hash };
  }

  const signature = statSignature(
    [
      options.mainBundleDir,
      options.agentPluginsDir,
      options.wslHelpersDir,
      ...(options.bundledSkillsDir ? [options.bundledSkillsDir] : []),
    ],
    runtimePackageJson(),
  );
  const manifest = readBundleManifest(options.cacheDir);
  if (manifest && manifest.key === cacheKey && manifest.signature === signature) {
    const archivePath = join(options.cacheDir, `${manifest.hash}.tar.gz`);
    if (existsSync(archivePath)) {
      cachedBundle = { key: cacheKey, hash: manifest.hash };
      return { archivePath, hash: manifest.hash };
    }
  }

  const requiredFiles = ["server.cjs", "supervisor.cjs", "claudeSdkProbeWorker.mjs"];
  for (const file of requiredFiles) {
    const source = join(options.mainBundleDir, file);
    if (!existsSync(source)) {
      throw new Error(`Poracode SSH runtime asset is missing: ${source}`);
    }
  }
  if (!existsSync(options.agentPluginsDir)) {
    throw new Error(`Poracode SSH agent plugins are missing: ${options.agentPluginsDir}`);
  }

  mkdirSync(options.cacheDir, { recursive: true });
  const stage = mkdtempSync(join(options.cacheDir, "stage-"));
  try {
    const runtimeFiles = [
      ...requiredFiles,
      ...readdirSync(options.mainBundleDir).filter(
        (file) => /^transcriptReader-.+\.cjs$/.test(file) && !requiredFiles.includes(file),
      ),
    ];
    for (const file of runtimeFiles) {
      cpSync(join(options.mainBundleDir, file), join(stage, basename(file)));
    }
    cpSync(options.agentPluginsDir, join(stage, "agent-plugins"), { recursive: true });
    if (existsSync(options.wslHelpersDir)) {
      cpSync(options.wslHelpersDir, join(stage, "wsl-helpers"), { recursive: true });
    } else {
      mkdirSync(join(stage, "wsl-helpers"));
    }
    if (options.bundledSkillsDir && existsSync(options.bundledSkillsDir)) {
      cpSync(options.bundledSkillsDir, join(stage, "skills"), { recursive: true });
    } else {
      mkdirSync(join(stage, "skills"));
    }
    writeFileSync(join(stage, "package.json"), runtimePackageJson(), "utf8");

    const hash = hashDirectory(stage);
    const archivePath = join(options.cacheDir, `${hash}.tar.gz`);
    if (!existsSync(archivePath)) {
      // Name the archive relative to cacheDir (the process cwd) so GNU tar on
      // Windows doesn't read the `C:\…` drive-letter path as an rsh `host:file`
      // spec ("Cannot connect to C:"). bsdtar treats the relative name the same,
      // so this stays correct across tar flavors without a flavor-specific flag.
      execFileSync(
        options.tarCommand ?? (process.platform === "win32" ? "tar.exe" : "tar"),
        ["-czf", `${hash}.tar.gz`, "-C", stage, "."],
        { cwd: options.cacheDir },
      );
    }
    cachedBundle = { key: cacheKey, hash };
    try {
      writeFileSync(
        manifestPath(options.cacheDir),
        `${JSON.stringify({ key: cacheKey, signature, hash } satisfies BundleManifest)}\n`,
        "utf8",
      );
    } catch {
      // Best-effort: without the manifest the next app start just rebuilds.
    }
    return { archivePath, hash };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
