import { resolveHostRootPaths, type HostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  requestOwnerShutdown,
  waitForOwnerStopped,
  type OwnerShutdownDeps,
  type OwnerStoppedWait,
} from "./ownerShutdown";
import {
  probeRunningOwner,
  RunningOwnerUnreachableError,
  type RunningOwnerProbe,
} from "./serverUpgradeIdentity";

/** Drain deadline default (10s) plus headroom for checkpoint and lease release. */
export const STOP_TIMEOUT_MS = 30_000;

export interface StopServerOptions {
  readonly timeoutMs?: number;
  readonly probe?: (paths: HostRootPaths) => Promise<RunningOwnerProbe | null>;
  readonly request?: OwnerShutdownDeps;
  readonly wait?: Omit<OwnerStoppedWait, "timeoutMs">;
}

export interface StopServerResult {
  readonly outcome: "not-running" | "stopped";
  readonly generation?: string;
  readonly pid?: number;
}

/**
 * `poracode-server stop`: locate the authenticated owner of this profile, ask
 * it to drain over host control, and wait for its owner record to report
 * `phase: "stopped"`. Never signals a PID; throws on refusal, an owner too old
 * to support `shutdown`, or a missed deadline.
 */
export async function stopRunningServer(
  profileNamespace: string,
  options: StopServerOptions = {},
): Promise<StopServerResult> {
  const paths = resolveHostRootPaths(profileNamespace);
  const probe = await (options.probe ?? ((p) => probeRunningOwner(p)))(paths);
  if (!probe) return { outcome: "not-running" };
  let accepted: "accepted" | "unsupported";
  try {
    accepted = await requestOwnerShutdown(paths, probe.generation, options.request);
  } catch (error) {
    throw new RunningOwnerUnreachableError(
      "The running owner did not accept the authenticated shutdown request.",
      { cause: error },
    );
  }
  if (accepted === "unsupported")
    throw new RunningOwnerUnreachableError(
      "The running owner predates the graceful shutdown operation; stop it with its service " +
        "manager or by signalling the process, then retry.",
    );
  const timeoutMs = options.timeoutMs ?? STOP_TIMEOUT_MS;
  const stopped = await waitForOwnerStopped(paths, probe.generation, {
    ...options.wait,
    timeoutMs,
  });
  if (!stopped)
    throw new RunningOwnerUnreachableError(
      `The running owner did not report stopped within ${timeoutMs}ms.`,
    );
  return { outcome: "stopped", generation: probe.generation, pid: probe.pid };
}
