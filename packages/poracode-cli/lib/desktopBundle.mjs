import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DESKTOP_CLI_BOOTSTRAP_VERSION = 1;
export const DESKTOP_CLI_PREFIX = "app.asar/dist/cli-runtime";
// Shared with AppImage re-entry. The defaults and bootstrap format stay unchanged.
export const DESKTOP_CLI_RESOURCE_DIRECTORIES = Object.freeze({
  PORACODE_WSL_HELPERS_DIR: "wsl-helpers",
  PORACODE_BUNDLED_SKILLS_DIR: "skills",
  PORACODE_BUNDLED_PLUGINS_DIR: "plugins",
  PORACODE_AGENT_PLUGINS_DIR: "agent-plugins",
  PORACODE_COMPUTER_USE_HELPER_ROOT: "computer-use-helper",
});
const MANIFEST_KEYS = [
  "formatVersion",
  "runtime",
  "channel",
  "commandName",
  "appVersion",
  "electronVersion",
  "platform",
  "executableName",
  "serverPrefixRelative",
  "entryRelative",
  "files",
];
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_FILES = 1024;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

function fail(message) {
  throw new Error(
    `Desktop CLI refused: ${message} Reinstall the matching desktop release; no alternate runtime was selected.`,
  );
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function desktopCliRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    // eslint-disable-next-line no-control-regex -- portable packaged-file boundary
    !/[\\%?#:*<>"|\u0000-\u0020]/u.test(value) &&
    !value.startsWith("/") &&
    value
      .split("/")
      .every(
        (part) =>
          part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== "node_modules",
      )
  );
}

export function desktopCliExecutableName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/%:*?"<>|]/u.test(value) &&
    !value
      .split("")
      .some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127) &&
    !/[. ]$/u.test(value)
  );
}

function regularFile(path, maxBytes) {
  const info = lstatSync(path);
  if (!info.isFile() || info.size > maxBytes)
    fail("a packaged file is missing, linked, or exceeds its size bound.");
  return info;
}

export function validateDesktopManifest(manifest) {
  if (
    !exactKeys(manifest, MANIFEST_KEYS) ||
    manifest.formatVersion !== DESKTOP_CLI_BOOTSTRAP_VERSION ||
    manifest.runtime !== "electron-run-as-node" ||
    !["stable", "nightly"].includes(manifest.channel) ||
    manifest.commandName !== (manifest.channel === "nightly" ? "poracode-next" : "poracode") ||
    !["win32", "darwin", "linux"].includes(manifest.platform) ||
    typeof manifest.appVersion !== "string" ||
    !VERSION.test(manifest.appVersion) ||
    typeof manifest.electronVersion !== "string" ||
    !VERSION.test(manifest.electronVersion) ||
    !desktopCliExecutableName(manifest.executableName) ||
    manifest.serverPrefixRelative !== DESKTOP_CLI_PREFIX ||
    manifest.entryRelative !== "lib/server.cjs" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 1 ||
    manifest.files.length > MAX_FILES
  )
    fail("unknown, future, or invalid packaged bootstrap metadata.");
  const names = new Set();
  let total = 0;
  for (const file of manifest.files) {
    if (
      !exactKeys(file, ["path", "bytes", "sha256"]) ||
      !desktopCliRelativePath(file.path) ||
      !(file.path.startsWith(`${DESKTOP_CLI_PREFIX}/`) || file.path.startsWith("desktop-cli/")) ||
      names.has(file.path.toLowerCase()) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.bytes > MAX_FILE_BYTES ||
      typeof file.sha256 !== "string" ||
      !SHA256.test(file.sha256)
    )
      fail("invalid or duplicate packaged file identity.");
    names.add(file.path.toLowerCase());
    total += file.bytes;
    if (total > MAX_TOTAL_BYTES) fail("packaged CLI inventory exceeds its byte bound.");
  }
  for (const required of [
    "desktop-cli/bootstrap.mjs",
    "desktop-cli/desktopBundle.mjs",
    `${DESKTOP_CLI_PREFIX}/package.json`,
    `${DESKTOP_CLI_PREFIX}/resources/.desktop-cli-v1`,
    `${DESKTOP_CLI_PREFIX}/lib/server.cjs`,
    `${DESKTOP_CLI_PREFIX}/lib/supervisor.cjs`,
    `desktop-cli/${manifest.commandName}${manifest.platform === "win32" ? ".cmd" : ""}`,
  ])
    if (!manifest.files.some((file) => file.path === required))
      fail("the packaged CLI is incomplete.");
  if (Buffer.byteLength(JSON.stringify(manifest)) > MAX_MANIFEST_BYTES)
    fail("packaged metadata exceeds its byte bound.");
}

export function readDesktopBundle(resourcesDir) {
  const root = realpathSync.native(resourcesDir);
  const manifestPath = join(root, "desktop-cli", "manifest.json");
  regularFile(manifestPath, MAX_MANIFEST_BYTES);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateDesktopManifest(manifest);
  const sources = new Map();
  for (const file of manifest.files) {
    const segments = file.path.split("/");
    for (let index = 1; index < segments.length; index += 1)
      if (lstatSync(join(root, ...segments.slice(0, index))).isSymbolicLink())
        fail("a packaged parent directory is linked.");
    const path = join(root, ...segments);
    if (regularFile(path, MAX_FILE_BYTES).size !== file.bytes)
      fail("packaged CLI file size differs.");
    const bytes = readFileSync(path);
    if (
      bytes.length !== file.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      fail("packaged CLI bytes do not match their declared identity.");
    if (file.path.startsWith(`${DESKTOP_CLI_PREFIX}/lib/`) && /\.(?:cjs|mjs|js)$/u.test(file.path))
      sources.set(pathToFileURL(path).href, {
        source: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        format: file.path.endsWith(".mjs") ? "module" : "commonjs",
      });
  }
  const prefix = join(root, ...DESKTOP_CLI_PREFIX.split("/"));
  const packageMetadata = JSON.parse(readFileSync(join(prefix, "package.json"), "utf8"));
  if (packageMetadata.version !== manifest.appVersion || packageMetadata.private !== true)
    fail("the packaged server and desktop versions differ.");
  return {
    ...manifest,
    resourcesDir: root,
    prefix,
    entry: join(prefix, "lib", "server.cjs"),
    sources,
  };
}

function captureServerCode(bundle) {
  const root = join(bundle.prefix, "lib");
  const ownCode = (path) => {
    const name = relative(root, path);
    return (
      name !== "" &&
      name !== ".." &&
      !name.startsWith(`..${sep}`) &&
      !isAbsolute(name) &&
      !name.split(sep).some((part) => part.toLowerCase() === "node_modules") &&
      /\.(?:cjs|mjs|js)$/u.test(path)
    );
  };
  const key = (url) => (process.platform === "win32" ? url.toLowerCase() : url);
  const sources = new Map([...bundle.sources].map(([url, code]) => [key(url), { url, code }]));
  const canonical = (url) => {
    if (!url.startsWith("file:")) return undefined;
    const path = resolve(fileURLToPath(url));
    if (!ownCode(path)) return undefined;
    const parsed = new URL(url);
    if (parsed.search || parsed.hash) fail("a runtime code URL has an undeclared alias.");
    return pathToFileURL(path).href;
  };
  // This in-process loader uses the same Node hook facility as the supervisor
  // capture bootstrap. It has no child handshake or additional wire protocol.
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      let requested;
      if (specifier.startsWith("file:")) requested = specifier;
      else if (isAbsolute(specifier)) requested = pathToFileURL(specifier).href;
      else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
        requested = new URL(specifier, context.parentURL).href;
      const direct = requested ? canonical(requested) : undefined;
      if (direct) {
        const captured = sources.get(key(direct));
        if (!captured) fail("undeclared first-party runtime code was requested.");
        return { url: captured.url, shortCircuit: true };
      }
      const resolved = nextResolve(specifier, context);
      const owned = canonical(resolved.url);
      if (owned && !sources.has(key(owned)))
        fail("undeclared first-party runtime code was resolved.");
      return resolved;
    },
    load(url, context, nextLoad) {
      const owned = canonical(url);
      if (owned) {
        const captured = sources.get(key(owned));
        if (!captured) fail("undeclared first-party runtime code was loaded.");
        return { ...captured.code, shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}

export function readSelectedDesktopBundle(options) {
  const bundle = readDesktopBundle(options.resourcesDir);
  const platform = options.platform ?? process.platform;
  const executable = realpathSync.native(options.execPath ?? process.execPath);
  const expected = resolve(
    bundle.resourcesDir,
    platform === "darwin" ? "../MacOS" : "..",
    bundle.executableName,
  );
  const samePath =
    platform === "win32"
      ? executable.toLowerCase() === realpathSync.native(expected).toLowerCase()
      : executable === realpathSync.native(expected);
  if (
    platform !== bundle.platform ||
    (options.electronVersion ?? process.versions.electron) !== bundle.electronVersion ||
    !samePath ||
    basename(executable).toLowerCase() !== bundle.executableName.toLowerCase()
  )
    fail("the selected executable is not this bundle's matching Electron runtime.");
  return bundle;
}

export function runDesktopBundle(options) {
  const bundle = readSelectedDesktopBundle(options);
  const env = options.env ?? process.env;
  for (const key of Object.keys(env))
    if (["NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"].includes(key.toUpperCase()))
      delete env[key];
  env.ELECTRON_RUN_AS_NODE = "1";
  env.PORACODE_APP_VERSION = bundle.appVersion;
  if (!env.PORACODE_BASE_DIR?.trim())
    env.PORACODE_BASE_DIR = join(
      options.home ?? homedir(),
      bundle.channel === "nightly" ? ".poracode-nightly" : ".poracode",
    );
  for (const [key, directory] of Object.entries(DESKTOP_CLI_RESOURCE_DIRECTORIES))
    if (!env[key]?.trim()) env[key] = join(bundle.resourcesDir, directory);
  // Keep the same process/stdio and server-owned shutdown path; no GUI owner,
  // download, profile activation, or service installation is implicit here.
  const hooks = captureServerCode(bundle);
  try {
    const server = (options.loadServer ?? ((entry) => createRequire(import.meta.url)(entry)))(
      bundle.entry,
    );
    if (
      server.DESKTOP_CLI_INTEGRATION_VERSION !== DESKTOP_CLI_BOOTSTRAP_VERSION ||
      typeof server.runDesktopCli !== "function"
    )
      fail("the server does not support this versioned packaged entry.");
    server.runDesktopCli({
      formatVersion: DESKTOP_CLI_BOOTSTRAP_VERSION,
      build: {
        version: bundle.appVersion,
        sourceRevision: null,
        root: bundle.prefix,
        layoutKind: "prefix",
        entrypointSha256: bundle.files.find(
          (file) => file.path === `${DESKTOP_CLI_PREFIX}/lib/server.cjs`,
        ).sha256,
      },
    });
    // Retained for lazy imports throughout a real server's process lifetime.
    return hooks;
  } catch (error) {
    hooks.deregister();
    throw error;
  }
}
