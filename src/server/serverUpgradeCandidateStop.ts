import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  OWNER_POLL_MS,
  OWNER_STOP_TIMEOUT_MS,
  type UpgradeCandidateHandle,
} from "./serverUpgradeContract";
import type { RunningOwnerProbe } from "./serverUpgradeIdentity";
import { stopServerService } from "./serverUpgradeRestart";

export interface CandidateStopDeps {
  readonly platform?: NodeJS.Platform;
  readonly paths: () => HostRootPaths;
  readonly probeOwner: (
    paths: HostRootPaths,
    options: { timeoutMs: number },
  ) => Promise<RunningOwnerProbe | null>;
  readonly stopOwner: (probe: RunningOwnerProbe, options: { timeoutMs: number }) => Promise<void>;
  readonly stopService?: typeof stopServerService;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/**
 * Stop a started upgrade candidate. Windows `child.kill("SIGTERM")` is
 * TerminateProcess (no drain, no `stopped` owner record), so there the
 * authenticated owner stop runs first and the process kill is only the
 * fallback for a child that is still alive afterwards. POSIX keeps the signal
 * first, then the authenticated owner stop.
 */
export async function stopUpgradeCandidate(
  handle: UpgradeCandidateHandle | null,
  deps: CandidateStopDeps,
): Promise<void> {
  const now = deps.now ?? Date.now;
  if (handle?.target.kind === "systemd") {
    try {
      await (deps.stopService ?? stopServerService)(handle.target);
    } catch {
      // Fall through to the authenticated owner stop below.
    }
  }
  const stopViaOwner = async (): Promise<void> => {
    try {
      const probe = await deps.probeOwner(deps.paths(), { timeoutMs: 2_000 });
      if (probe) await deps.stopOwner(probe, { timeoutMs: OWNER_STOP_TIMEOUT_MS });
    } catch {
      // Best effort: the caller reports recovery when the candidate cannot be
      // joined, and the next owner admission still requires the kernel lease.
    }
  };
  const stopChild = async (): Promise<void> => {
    const child = handle?.child;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    const deadline = now() + OWNER_STOP_TIMEOUT_MS;
    while (child.exitCode === null && now() < deadline) await deps.sleep(OWNER_POLL_MS);
  };
  if ((deps.platform ?? process.platform) === "win32") {
    await stopViaOwner();
    await stopChild();
    return;
  }
  await stopChild();
  await stopViaOwner();
}
