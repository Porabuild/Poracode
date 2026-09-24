import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ImportedSessionProvider } from "@/shared/contracts";
import type { ImportHome } from "./homes";

import { getSessionImportProvider } from "./providers";

function isInside(dir: string, path: string): boolean {
  const rel = relative(resolve(dir), resolve(path));
  return rel.length > 0 && !rel.startsWith("..") && !rel.includes(`..${sep}`);
}

/**
 * Copy a transcript into the home of `targetAgentKind` so that provider
 * account can resume it. A provider only looks in its own home, so importing a
 * session "under" another profile means giving that profile its own copy; the
 * original stays untouched and the provider keeps writing to the copy from
 * then on. Returns the path the thread resumes from — the original when it
 * already lives in the target home, or a copy that was already made.
 */
export function copySessionIntoHome(input: {
  provider: ImportedSessionProvider;
  path: string;
  homes: readonly ImportHome[];
  targetAgentKind: string;
}): string {
  const target = input.homes.find(
    (home) => home.provider === input.provider && home.agentKind === input.targetAgentKind,
  );
  if (!target) {
    throw new Error(`No ${input.provider} account is configured as ${input.targetAgentKind}.`);
  }
  if (isInside(target.dir, input.path)) return input.path;

  const root = getSessionImportProvider(input.provider).transcriptRoot;
  const source = input.homes.find(
    (home) => home.provider === input.provider && isInside(join(home.dir, root), input.path),
  );
  if (!source) {
    throw new Error(`Transcript ${input.path} is not inside a known ${input.provider} home.`);
  }
  const destination = join(target.dir, root, relative(join(source.dir, root), input.path));
  if (!existsSync(destination) || isStale(input.path, destination)) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(input.path, destination);
  }
  return destination;
}

/**
 * Whether the copy predates the source. A cross-account import can have left
 * a copy weeks ago, and the conversation went on in its original home since:
 * skipping the copy then would replay the old file, and the thread would
 * resume a transcript missing its latest turns. A destination at least as new
 * as the source is the copy this import would have made anyway — and once a
 * profile resumes a session, that copy is the one being written to, so it
 * must not be overwritten by the original it was made from.
 */
function isStale(source: string, destination: string): boolean {
  try {
    return statSync(source).mtimeMs > statSync(destination).mtimeMs;
  } catch {
    // Something moved underneath us; let the copy below decide the outcome.
    return true;
  }
}
