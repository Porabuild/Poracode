import { lstatSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

/**
 * Published standalone-server layout contract (docs/STANDALONE_SERVER.md).
 *
 * The installable server separates CODE, READ-ONLY RESOURCES and DATA:
 *
 * - `lib/`       — the built CommonJS bundles (`server.cjs`, `supervisor.cjs`,
 *                  their shared chunks and the `*.ssh-runtime-manifest.json`
 *                  build declarations). Immutable for one release.
 * - `resources/` — read-only assets the host forwards to supervisors:
 *                  `wsl-helpers/` (required), `skills/` and `plugins/`
 *                  (optional parts of the layout).
 * - data         — never inside the install prefix. All writable state lives
 *                  under the profile namespace selected by `PORACODE_BASE_DIR`
 *                  (the owned `<namespace>.host-v1` root and its siblings).
 *
 * Two shapes are supported, distinguished by the running bundle's directory:
 *
 * - `prefix`   — `<prefix>/lib/server.cjs` with `<prefix>/resources/` and a
 *                `<prefix>/package.json` (the documented install layout).
 * - `checkout` — `<repo>/dist/main/server.cjs` with `<repo>/resources/`
 *                (development inside the repository checkout).
 *
 * Any other arrangement is refused loudly instead of silently misresolving
 * resource paths. Explicit environment declarations
 * (`PORACODE_WSL_HELPERS_DIR`, `PORACODE_BUNDLED_SKILLS_DIR`,
 * `PORACODE_BUNDLED_PLUGINS_DIR`) always win over both shapes; they are how
 * the SSH-launched helper runtime, whose directory is hash-named rather than
 * `lib/`, declares its assets.
 */

export const SERVER_INSTALL_LAYOUT_VERSION = 1;

export type ServerInstallLayoutKind = "checkout" | "prefix";

export interface ServerInstallLayout {
  readonly layoutVersion: typeof SERVER_INSTALL_LAYOUT_VERSION;
  readonly kind: ServerInstallLayoutKind;
  /** Repository root or install prefix; every member resolves inside it. */
  readonly root: string;
  /** Directory of the running server bundle (`server.cjs`, `supervisor.cjs`). */
  readonly libDir: string;
  /** Read-only asset directory (`wsl-helpers`, `skills`, `plugins`). */
  readonly resourcesDir: string;
}

/** Startup-time layout failure: names what was found and what is supported. */
export class ServerLayoutError extends Error {
  readonly code = "SERVER_LAYOUT_UNSUPPORTED";

  constructor(message: string) {
    super(message);
    this.name = "ServerLayoutError";
  }
}

export const WSL_HELPERS_DIR_ENV = "PORACODE_WSL_HELPERS_DIR";
export const BUNDLED_SKILLS_DIR_ENV = "PORACODE_BUNDLED_SKILLS_DIR";
export const BUNDLED_PLUGINS_DIR_ENV = "PORACODE_BUNDLED_PLUGINS_DIR";
export const AGENT_PLUGINS_DIR_ENV = "PORACODE_AGENT_PLUGINS_DIR";
export const COMPUTER_USE_HELPER_ROOT_ENV = "PORACODE_COMPUTER_USE_HELPER_ROOT";

export interface ServerResourceDirs {
  /** Required asset: WSL helper scripts forwarded to supervisors. */
  readonly wslHelpersDir: string;
  /** Optional app-bundled skills; absent from layouts that do not ship them. */
  readonly bundledSkillsDir: string | undefined;
  /** Optional app-bundled plugins; absent from layouts that do not ship them. */
  readonly bundledPluginsDir: string | undefined;
  /** Staged SSH agent-plugins; absence declares ssh: false. */
  readonly agentPluginsDir: string | undefined;
  /** Computer-use helper binaries; absence declares computerUse: false. */
  readonly computerUseHelperRoot: string | undefined;
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function assertAbsolute(prefix: string, what: string): string {
  if (!isAbsolute(prefix)) {
    throw new ServerLayoutError(`The Poracode server ${what} must be an absolute path: ${prefix}.`);
  }
  return prefix;
}

function describeSupportedLayouts(libDir: string): string {
  return (
    "Supported layouts for the running server bundle are: " +
    "(1) an install prefix of `<prefix>/lib/server.cjs` with `<prefix>/resources/` " +
    "and `<prefix>/package.json`, or (2) a repository checkout at " +
    "`<repo>/dist/main/server.cjs` with `<repo>/resources/`. " +
    `The running bundle directory is ${libDir}. ` +
    "Reinstall per docs/STANDALONE_SERVER.md, or declare the asset directories " +
    `explicitly with ${WSL_HELPERS_DIR_ENV}, ${BUNDLED_SKILLS_DIR_ENV}, ` +
    `${BUNDLED_PLUGINS_DIR_ENV}, ${AGENT_PLUGINS_DIR_ENV} and ${COMPUTER_USE_HELPER_ROOT_ENV}.`
  );
}

/**
 * Resolve the layout from the directory of the running bundle. Injectable
 * `libDir` keeps this testable; production always passes the bundled
 * `__dirname` of `server.cjs`.
 */
export function resolveServerInstallLayout(
  input: { readonly libDir?: string } = {},
): ServerInstallLayout {
  const libDir = assertAbsolute(input.libDir ?? __dirname, "bundle directory");
  if (!isDirectory(libDir)) {
    throw new ServerLayoutError(
      `The Poracode server bundle directory does not exist: ${libDir}. ${describeSupportedLayouts(libDir)}`,
    );
  }

  const parent = dirname(libDir);
  // Prefix shape: `<prefix>/lib` beside `<prefix>/resources` and package.json.
  if (
    parent !== libDir &&
    libDir.split(/[\\/]/u).at(-1) === "lib" &&
    isDirectory(join(parent, "resources")) &&
    isRegularFile(join(parent, "package.json"))
  ) {
    return {
      layoutVersion: SERVER_INSTALL_LAYOUT_VERSION,
      kind: "prefix",
      root: parent,
      libDir,
      resourcesDir: join(parent, "resources"),
    };
  }

  // Checkout shape: `<repo>/dist/main` beside `<repo>/resources`.
  const repoRoot = dirname(parent);
  if (
    parent !== libDir &&
    repoRoot !== parent &&
    parent.split(/[\\/]/u).at(-1) === "dist" &&
    libDir.split(/[\\/]/u).at(-1) === "main" &&
    isDirectory(join(repoRoot, "resources")) &&
    isRegularFile(join(repoRoot, "package.json"))
  ) {
    return {
      layoutVersion: SERVER_INSTALL_LAYOUT_VERSION,
      kind: "checkout",
      root: repoRoot,
      libDir,
      resourcesDir: join(repoRoot, "resources"),
    };
  }

  throw new ServerLayoutError(
    `The Poracode server resources could not be located for the running bundle. ${describeSupportedLayouts(libDir)}`,
  );
}

/** Informational consumers (doctor) resolve layouts without failing startup. */
export function resolveOptionalServerInstallLayout(
  input: { readonly libDir?: string } = {},
): ServerInstallLayout | undefined {
  try {
    return resolveServerInstallLayout(input);
  } catch (error) {
    if (error instanceof ServerLayoutError) return undefined;
    throw error;
  }
}

function declaredDirectory(env: NodeJS.ProcessEnv | undefined, name: string): string | undefined {
  const override = env?.[name]?.trim();
  if (override === undefined || override === "") return undefined;
  assertAbsolute(override, `${name} override`);
  if (!isDirectory(override)) {
    throw new ServerLayoutError(
      `${name} points at a directory that does not exist: ${override}. ` +
        "Fix or remove the override so the declared asset can be resolved.",
    );
  }
  return override;
}

/**
 * Resource resolution precedence: an explicit environment declaration always
 * wins (validated); otherwise the value comes from the resolved layout —
 * `wsl-helpers` is required, `skills` and `plugins` are optional. Without a
 * layout, a missing required declaration is a loud failure instead of a
 * silently misresolved path.
 */
export function resolveServerResourceDirs(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly layout?: ServerInstallLayout;
}): ServerResourceDirs {
  const wslHelpersDir =
    declaredDirectory(input.env, WSL_HELPERS_DIR_ENV) ?? requireWslHelpersDir(input.layout);
  const bundledSkillsDir =
    declaredDirectory(input.env, BUNDLED_SKILLS_DIR_ENV) ?? optionalLayoutDir(input, "skills");
  const bundledPluginsDir =
    declaredDirectory(input.env, BUNDLED_PLUGINS_DIR_ENV) ?? optionalLayoutDir(input, "plugins");
  const agentPluginsDir =
    declaredDirectory(input.env, AGENT_PLUGINS_DIR_ENV) ??
    optionalLayoutDir(input, "agent-plugins");
  const computerUseHelperRoot =
    declaredDirectory(input.env, COMPUTER_USE_HELPER_ROOT_ENV) ??
    optionalLayoutDir(input, "computer-use-helper");
  return {
    wslHelpersDir,
    bundledSkillsDir,
    bundledPluginsDir,
    agentPluginsDir,
    computerUseHelperRoot,
  };
}

function requireWslHelpersDir(layout: ServerInstallLayout | undefined): string {
  if (layout === undefined) {
    throw new ServerLayoutError(
      "The wsl-helpers assets are required but no layout could be resolved and no " +
        `${WSL_HELPERS_DIR_ENV} declaration is set. Declare the asset directory explicitly.`,
    );
  }
  const path = join(layout.resourcesDir, "wsl-helpers");
  if (!isDirectory(path)) {
    throw new ServerLayoutError(
      `The required Poracode server asset directory is missing from the resolved layout: ${path}. ` +
        describeSupportedLayouts(layout.libDir),
    );
  }
  return path;
}

function optionalLayoutDir(
  input: { readonly layout?: ServerInstallLayout },
  name: "skills" | "plugins" | "agent-plugins" | "computer-use-helper",
): string | undefined {
  const layout = input.layout;
  if (layout === undefined) return undefined;
  const path = join(layout.resourcesDir, name);
  return isDirectory(path) ? path : undefined;
}
