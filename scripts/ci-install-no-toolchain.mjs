#!/usr/bin/env node
/**
 * Install a server tarball into a prefix outside the checkout with a PATH that
 * carries no compiler toolchain (no python, make, or C compiler), proving the
 * documented install needs only node, npm, tar and git. Works on every CI OS:
 * POSIX builds a PATH directory of symlinks to the needed tools; Windows uses
 * the Node install directory plus System32 (bsdtar) and Git's own directory.
 *
 * Usage: ci-install-no-toolchain.mjs [--tarball <file>] [--prefix <dir>]
 * Without --tarball it requires exactly one dist/poracode-server-*.tar.gz. On
 * success it appends PREFIX and TARBALL to $GITHUB_ENV for later steps.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { delimiter, dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

/** Tools the POSIX install PATH keeps; everything else must not resolve. */
export const POSIX_INSTALL_TOOLS = ["node", "npm", "tar", "gzip", "sh", "bash", "git"];
/** Toolchain binaries that must never be reachable from the install PATH. */
export const FORBIDDEN_TOOLS = ["python3", "python", "make", "gcc", "cc", "cl", "g++"];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Resolve an executable on a PATH string (PATHEXT-aware on Windows). */
export function findExecutable(name, pathValue, options = {}) {
  const platform = options.platform ?? process.platform;
  const isExecutable = options.isFile ?? isFile;
  const extensions =
    platform === "win32"
      ? ["", ...(options.pathext ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
      : [""];
  const separator = platform === "win32" ? ";" : delimiter;
  const join_ = platform === "win32" ? win32.join : join;
  for (const directory of pathValue.split(separator).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join_(directory, `${name}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Build the toolchain-free PATH. Returns `{ pathValue, directories }` and
 * throws when a required tool is missing or a forbidden one still resolves.
 */
export function buildToolchainFreePath(options) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const currentPath = env.PATH ?? env.Path ?? "";
  const find = (name, pathValue) => findExecutable(name, pathValue, { platform });
  let directories;
  if (platform === "win32") {
    const systemRoot = env.SystemRoot ?? env.windir ?? "C:\\Windows";
    directories = [
      win32.dirname(options.execPath ?? process.execPath),
      win32.join(systemRoot, "System32"),
      systemRoot,
    ];
    const git = find("git", currentPath);
    if (git) directories.push(win32.dirname(git));
  } else {
    const bin = options.binDir;
    mkdirSync(bin, { recursive: true });
    for (const tool of POSIX_INSTALL_TOOLS) {
      const source = find(tool, currentPath);
      if (source && !existsSync(join(bin, tool))) symlinkSync(source, join(bin, tool));
    }
    directories = [bin];
  }
  const pathValue = directories.join(platform === "win32" ? ";" : delimiter);
  for (const required of ["node", "tar"]) {
    if (!find(required, pathValue)) {
      throw new Error(`${required} is not reachable from the install PATH (${pathValue})`);
    }
  }
  for (const forbidden of FORBIDDEN_TOOLS) {
    const leaked = find(forbidden, pathValue);
    if (leaked) throw new Error(`${forbidden} leaked into install PATH: ${leaked}`);
  }
  return { pathValue, directories };
}

/** `env` with exactly one PATH entry (Windows env names are case-insensitive). */
export function envWithPath(env, pathValue) {
  const next = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() !== "path") next[key] = value;
  }
  next.PATH = pathValue;
  return next;
}

export function findSingleTarball(directory) {
  const matches = existsSync(directory)
    ? readdirSync(directory).filter((name) => /^poracode-server-.+\.tar\.gz$/u.test(name))
    : [];
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one assembled tarball in ${directory}, found ${matches.length}`,
    );
  }
  return resolve(directory, matches[0]);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--tarball") options.tarball = resolve(argv[++index]);
    else if (argv[index] === "--prefix") options.prefix = resolve(argv[++index]);
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
}

export function main(argv, env = process.env) {
  const options = parseArgs(argv);
  const temp = env.RUNNER_TEMP ?? env.TEMP ?? env.TMPDIR ?? "/tmp";
  const tarball = options.tarball ?? findSingleTarball(resolve("dist"));
  const prefix = options.prefix ?? join(temp, "poracode-prefix");
  const { pathValue } = buildToolchainFreePath({
    env,
    binDir: join(temp, "no-toolchain", "bin"),
  });
  const installer = join(dirname(fileURLToPath(import.meta.url)), "install-server-prefix.mjs");
  const install = spawnSync(
    process.execPath,
    [installer, "--tarball", tarball, "--prefix", prefix],
    {
      env: envWithPath(env, pathValue),
      stdio: "inherit",
    },
  );
  if (install.status !== 0) {
    throw new Error(`install-server-prefix exited with ${install.status ?? install.signal}`);
  }
  const current = join(prefix, "current");
  try {
    readlinkSync(current);
  } catch {
    throw new Error(`${current} is not a link to the installed release`);
  }
  if (!isFile(join(current, "lib", "server.cjs"))) {
    throw new Error(`${join(current, "lib", "server.cjs")} is missing after install`);
  }
  if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `PREFIX=${prefix}\nTARBALL=${tarball}\n`);
  process.stdout.write(`installed without a toolchain: ${prefix}\n`);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
