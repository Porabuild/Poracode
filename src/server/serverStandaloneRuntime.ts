import { realpathSync } from "node:fs";
import { join } from "node:path";
import {
  readStandaloneRuntimeMarker,
  standaloneNodeExecutable,
} from "../../scripts/server-release-install.mjs";

/**
 * The Node executable a release runs with. A self-contained (standalone)
 * release carries its own pinned Node under `runtime/`, validated when the
 * release was staged; an ordinary npm-installed release runs on the Node that
 * launched this CLI. Running a candidate with its own Node keeps an upgrade
 * correct when the bundled Node version changes between releases.
 */
export function releaseNodeExecutable(
  releaseRoot: string,
  fallback: string = process.execPath,
): string {
  const marker = readStandaloneRuntimeMarker(releaseRoot);
  return marker ? standaloneNodeExecutable(releaseRoot, marker) : fallback;
}

/**
 * The Node a managed service registered under `prefix` must launch: the
 * release's own bundled Node for a self-contained install (which survives the
 * npm cache an `npx` launcher lives in), or this process's Node otherwise.
 */
export function serviceNodeExecutable(prefix: string): string {
  return realpathSync.native(releaseNodeExecutable(join(prefix, "current")));
}
