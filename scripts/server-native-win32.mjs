/**
 * Windows node-pty staging helpers for `prepare-server-native.mjs`.
 *
 * Unlike the POSIX prebuilds (one `pty.node` plus an optional `spawn-helper`),
 * node-pty's `prebuilds/win32-<arch>/` directory is a small tree the ConPTY
 * backend loads at runtime: `conpty.node`, `conpty_console_list.node`,
 * `pty.node`, `winpty.dll`, `winpty-agent.exe`, and a nested
 * `conpty/{conpty.dll,OpenConsole.exe}`. Every regular file except debug
 * symbols (`*.pdb`) must be staged, with its nested relative name recorded in
 * the overlay so the installer verifies and copies it.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Files whose presence proves a prebuild directory holds a loadable binding. */
export function bindingMarker(platform) {
  return platform === "win32" ? "conpty.node" : "pty.node";
}

/** Regular files under a Windows prebuild dir (no `.pdb`), "/"-separated, sorted. */
export function listWin32PrebuildFiles(sourceDir) {
  const files = [];
  const visit = (directory, prefix) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const stat = lstatSync(path);
      const name = prefix ? `${prefix}/${entry}` : entry;
      if (stat.isDirectory()) visit(path, name);
      else if (stat.isFile() && !/\.pdb$/iu.test(entry)) files.push(name);
    }
  };
  visit(sourceDir, "");
  return files.sort();
}

/**
 * `require("node-pty")` cannot validate a Windows binding (its loader leaves
 * the native module null on win32), so load the staged `conpty.node` itself.
 * Skipped off Windows and for a non-host arch, which the host cannot load.
 * `load` is injectable for tests; the default is a real `process.dlopen`.
 */
export function assertConptyLoadable({
  sourceDir,
  platform = process.platform,
  arch = process.arch,
  hostArch = process.arch,
  load = (path) => process.dlopen({ exports: {} }, path),
}) {
  if (platform !== "win32" || arch !== hostArch) return false;
  const binding = join(sourceDir, "conpty.node");
  if (!existsSync(binding)) {
    throw new Error(`node-pty ConPTY binding is missing: ${binding}`);
  }
  try {
    load(binding);
  } catch (error) {
    throw new Error(
      `node-pty ConPTY binding failed to load (${binding}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  return true;
}
