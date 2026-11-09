/**
 * Self-contained runtime support. A format-2 manifest pins a standalone
 * archive that carries its own Node under `runtime/` and a `standalone.json`
 * marker (format 1, written by `scripts/build-standalone-archive.mjs` and
 * validated again by the archive's own shipped installer). The launcher runs
 * such a runtime with that bundled Node, so the host Node only has to run this
 * small package. An ordinary format-1 runtime keeps running on the host Node.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { PoracodeLauncherError } from "./errors.mjs";

export const STANDALONE_RUNTIME_FILE = "standalone.json";
export const STANDALONE_RUNTIME_KIND = "poracode-standalone-runtime";
export const STANDALONE_RUNTIME_FORMAT_VERSION = 1;

function containedRuntimePath(value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) return false;
  const normalized = normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return false;
  return value.startsWith("runtime/") && !value.split("/").includes("..");
}

/**
 * The bundled Node a cached runtime runs with, or `null` for an ordinary
 * runtime. A marker that is present but unreadable, foreign, for another
 * version/target, or missing its executable fails closed.
 */
export function standaloneRuntimeNode(runtimeDir, expected = {}) {
  const path = join(runtimeDir, STANDALONE_RUNTIME_FILE);
  if (!existsSync(path)) return null;
  let marker;
  try {
    marker = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    marker = null;
  }
  const refuse = (detail) =>
    new PoracodeLauncherError(
      "PORACODE_STANDALONE_RUNTIME_INVALID",
      `The cached Poracode runtime at ${runtimeDir} has an unusable standalone marker (${detail}).`,
      `Remove ${runtimeDir} and run again to reinstall the verified runtime.`,
    );
  if (
    !marker ||
    marker.kind !== STANDALONE_RUNTIME_KIND ||
    marker.formatVersion !== STANDALONE_RUNTIME_FORMAT_VERSION
  ) {
    throw refuse("unknown format");
  }
  if (expected.version && marker.version !== expected.version) throw refuse("version mismatch");
  if (expected.target && marker.target !== expected.target) throw refuse("target mismatch");
  if (!containedRuntimePath(marker.node?.executable)) throw refuse("node executable path");
  const executable = join(runtimeDir, ...marker.node.executable.split("/"));
  if (!existsSync(executable)) throw refuse("node executable missing");
  return executable;
}
