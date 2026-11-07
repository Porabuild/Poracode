// Desktop managed admission: every lock decision that must pass before the
// desktop owner exists and its backend child is forked, in one small module so
// `main.ts` keeps only orchestration.
//
// Order matters and is load-bearing:
// 1. Kernel lease — the existing HostOwnerLease, with a bounded wait-and-
//    reprobe so a concurrently quitting owner (discovery already removed,
//    lease about to be released) does not turn a normal launch into a loud
//    failure.
// 2. Data-custody fence probe — proves no orphaned backend of a killed owner
//    still writes the root, BEFORE the fork hands the fence to the new child.
//    The probe releases immediately: the handoff gap is closed by the lease
//    this process already holds (any competing Poracode owner needs it, and an
//    orphan writer either held the fence during the wait or already exited).

import { acquireHostDataFenceWithWait } from "@/backend/ownership/hostDataFence";
import {
  HostOwnerLease,
  HostRootInUseError,
  readHostOwnerRecord,
} from "@/backend/ownership/hostOwnerLease";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";

/** Bounded wait-and-reprobe for a concurrently releasing owner (3 x 500ms). */
const REPROBE_ATTEMPTS = 3;
const REPROBE_DELAY_MS = 500;

export interface ReprobeOptions {
  attempts?: number;
  delayMs?: number;
}

/**
 * Acquire the desktop owner lease, re-probing a bounded three times (500ms
 * apart) while a concurrently quitting owner still holds it, so the common
 * launch race ends in success and only a genuinely held root fails loudly.
 */
export async function acquireDesktopOwnerLeaseWithReprobe(
  baseDir: string,
  options: ReprobeOptions = {},
): Promise<HostOwnerLease> {
  const attempts = options.attempts ?? REPROBE_ATTEMPTS;
  const delayMs = options.delayMs ?? REPROBE_DELAY_MS;
  const paths = resolveDesktopHostRootPaths(baseDir);
  for (let attempt = 0; ; attempt++) {
    try {
      return HostOwnerLease.acquire(paths, "desktop");
    } catch (error) {
      if (!(error instanceof HostRootInUseError) || attempt >= attempts) throw error;
      const owner = readHostOwnerRecord(paths);
      console.info(
        `[poracode] this profile is still owned by a ${owner?.kind ?? "previous"} owner ` +
          `(pid ${owner?.pid ?? "unknown"}); re-probing (${attempt + 1}/${attempts})…`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Full managed admission for the desktop mapping: lease with
 * reprobe, then the bounded data-custody fence probe. The fence is released
 * before returning — the forked backend child re-acquires it for its lifetime
 * (see `BackendHostCore`).
 */
export async function admitDesktopManagedOwner(baseDir: string): Promise<HostOwnerLease> {
  const lease = await acquireDesktopOwnerLeaseWithReprobe(baseDir);
  try {
    const fence = await acquireHostDataFenceWithWait(
      resolveDesktopHostRootPaths(baseDir).dataFencePath,
    );
    fence.release();
  } catch (error) {
    lease.release();
    throw error;
  }
  return lease;
}
