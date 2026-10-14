import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { MIN_ACCEPTED_NODE_MAJOR, parseNodeMajor } from "../../runtime/pinnedNode";

interface HostNodeEnvironment {
  execPath: string;
  versions: { node: string; electron?: string };
}

/** Reuse a compatible bare Node host; Electron-as-Node still needs a native resolver. */
export function resolveHostNode(environment: HostNodeEnvironment = process): {
  nodePath: string;
  version: string;
} | null {
  if (environment.versions.electron !== undefined) return null;
  const major = parseNodeMajor(environment.versions.node);
  if (major === null || major < MIN_ACCEPTED_NODE_MAJOR) return null;
  if (!isAbsolute(environment.execPath) || !existsSync(environment.execPath)) return null;
  return { nodePath: environment.execPath, version: environment.versions.node };
}
