import {
  callHostControl,
  HostControlUnsupportedOperationError,
} from "@/backend/ownership/hostControlClient";
import { readHostControlDiscovery } from "@/backend/ownership/hostControlDiscovery";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";

/**
 * Authenticated graceful stop of a running owner. Windows `kill("SIGTERM")` is
 * TerminateProcess (no drain, no `phase: "stopped"` record, no checkpoint), so
 * every stop path asks the owner to drain itself over the generation-bound
 * host-control surface instead.
 */

export interface OwnerShutdownDeps {
  readonly call?: (
    paths: HostRootPaths,
    operation: "shutdown",
    options: { timeoutMs: number },
  ) => Promise<{ ownerGeneration: string }>;
  readonly discoveryGeneration?: (paths: HostRootPaths) => string;
}

/**
 * - `accepted`: the owner authenticated the request and started its drain.
 * - `unsupported`: an older owner answered the authenticated empty 400.
 * Any other failure (unreachable, refused, invalid proof) throws.
 * The discovered generation must equal `generation` before anything is sent, so
 * a replacement owner that appeared meanwhile is never asked to stop.
 */
export async function requestOwnerShutdown(
  paths: HostRootPaths,
  generation: string,
  deps: OwnerShutdownDeps = {},
): Promise<"accepted" | "unsupported"> {
  const discovered = (deps.discoveryGeneration ?? defaultDiscoveryGeneration)(paths);
  if (discovered !== generation)
    throw new Error("The running owner generation changed; refusing to stop a different owner.");
  try {
    const reply = await (deps.call ?? callHostControl)(paths, "shutdown", { timeoutMs: 5_000 });
    if (reply.ownerGeneration !== generation)
      throw new Error("The shutdown reply came from a different owner generation.");
    return "accepted";
  } catch (error) {
    if (error instanceof HostControlUnsupportedOperationError) return "unsupported";
    throw error;
  }
}

function defaultDiscoveryGeneration(paths: HostRootPaths): string {
  return readHostControlDiscovery(paths).ownerGeneration;
}

export interface OwnerStoppedWait {
  readonly timeoutMs: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly readRecord?: typeof readHostOwnerRecord;
  readonly pollMs?: number;
}

/** True once the owner record of `generation` reports `phase: "stopped"` (or is gone/replaced). */
export async function waitForOwnerStopped(
  paths: HostRootPaths,
  generation: string,
  wait: OwnerStoppedWait,
): Promise<boolean> {
  const now = wait.now ?? Date.now;
  const sleep = wait.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const read = wait.readRecord ?? readHostOwnerRecord;
  const deadline = now() + wait.timeoutMs;
  for (;;) {
    const record = read(paths);
    if (!record || record.generation !== generation || record.phase === "stopped") return true;
    if (now() >= deadline) return false;
    await sleep(wait.pollMs ?? 100);
  }
}
