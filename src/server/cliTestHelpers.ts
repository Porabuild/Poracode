import type { ChildProcess } from "node:child_process";
import { expect } from "vitest";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";

/**
 * Shared child-process/lease helpers for the CLI signal and shutdown-deadline
 * suites. Each suite keeps its own fork harness, fixture entry point and
 * timeout; only the owned-process protocol that must not diverge is shared.
 */

/** Run `work` under a bounded wait so a wedged child cannot hang the suite. */
export async function withinDeadline<T>(
  work: Promise<T>,
  description: string,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(description)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Signal a child this test owns, refusing when there is no positive PID: a
 * failed spawn must fail the test, never signal an unrelated process.
 */
export function signalOwnedChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (typeof child.pid !== "number" || !Number.isSafeInteger(child.pid) || child.pid <= 0)
    throw new Error("The test has no positive owned child PID to signal.");
  child.kill(signal);
}

/**
 * SIGKILL an owned child when it is still alive, then wait for pipe closure so
 * the suite never removes a fixture directory under an inherited pipe.
 */
export async function stopOwnedChild(
  test: { readonly child: ChildProcess; readonly closed: Promise<void> },
  timeoutMs: number,
): Promise<void> {
  const { child, closed } = test;
  if (child.exitCode === null && child.signalCode === null) signalOwnedChild(child, "SIGKILL");
  await withinDeadline(closed, "Test-owned child did not confirm pipe closure.", timeoutMs);
}

/** Assert the fixture still holds the profile's exclusive owner lease. */
export function expectOwned(profile: string): void {
  let contender: HostOwnerLease | undefined;
  try {
    expect(() => {
      contender = HostOwnerLease.acquire(resolveHostRootPaths(profile), "desktop");
    }).toThrow(HostRootInUseError);
  } finally {
    contender?.release();
  }
}
