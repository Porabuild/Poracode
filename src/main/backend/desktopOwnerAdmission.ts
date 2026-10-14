// Desktop managed admission: every lock decision that must pass before the
// desktop owner exists and its backend child is forked, in one small module so
// `main.ts` keeps only orchestration.
//
// Order matters and is load-bearing:
// 1. Legacy-owner probe — a live legacy (Lightcode) server with a still
//    pending data import must refuse BEFORE the lease: acquiring and then
//    fighting the importer would put two writers on the profile.
// 2. Kernel lease — the existing HostOwnerLease, with a bounded wait-and-
//    reprobe so a concurrently quitting owner (discovery already removed,
//    lease about to be released) does not turn a normal launch into a loud
//    failure.
// 3. Data-custody fence probe — proves no orphaned backend of a killed owner
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
import type { PoracodeChannel } from "@/shared/channel";
import { probeLegacyOwnership } from "@/host/legacyDataMigration";

/** Bounded wait-and-reprobe for a concurrently releasing owner (3 x 500ms). */
const REPROBE_ATTEMPTS = 3;
const REPROBE_DELAY_MS = 500;

export interface ReprobeOptions {
  attempts?: number;
  delayMs?: number;
}

export interface DesktopLegacyProbeInput {
  baseDir: string;
  channel: PoracodeChannel;
  electronUserDataDir?: string;
  legacyElectronUserDataDir?: string;
  legacyBaseDir?: string;
  allowCustomDataRoot?: boolean;
}

/** A live legacy server owns data this launch would import. Never fight it. */
export class LegacyOwnerActiveError extends Error {
  constructor(legacyDataDir: string) {
    super(
      `A legacy Lightcode server is still running and using ${legacyDataDir}. Poracode refuses ` +
        "to import data while that server is live: quit the legacy app (or stop its server) and " +
        "start Poracode again. See docs/HOST_OWNERSHIP.md for the ownership model.",
    );
    this.name = "LegacyOwnerActiveError";
  }
}

/** Throws before any acquire when a live legacy process would fight the import. */
export function probeLegacyOwnerConflict(input: DesktopLegacyProbeInput): void {
  const probe = probeLegacyOwnership({
    baseDir: input.baseDir,
    channel: input.channel,
    ...(input.electronUserDataDir !== undefined
      ? { electronUserDataDir: input.electronUserDataDir }
      : {}),
    ...(input.legacyElectronUserDataDir !== undefined
      ? { legacyElectronUserDataDir: input.legacyElectronUserDataDir }
      : {}),
    ...(input.legacyBaseDir !== undefined ? { legacyBaseDir: input.legacyBaseDir } : {}),
    ...(input.allowCustomDataRoot !== undefined
      ? { allowCustomDataRoot: input.allowCustomDataRoot }
      : {}),
  });
  if (probe.pendingImport && probe.liveServerLock) {
    throw new LegacyOwnerActiveError(probe.legacyDataDir);
  }
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
 * Full managed admission for the desktop mapping: legacy refusal, lease with
 * reprobe, then the bounded data-custody fence probe. The fence is released
 * before returning — the forked backend child re-acquires it for its lifetime
 * (see `BackendHostCore`).
 */
export async function admitDesktopManagedOwner(
  input: DesktopLegacyProbeInput,
): Promise<HostOwnerLease> {
  probeLegacyOwnerConflict(input);
  const lease = await acquireDesktopOwnerLeaseWithReprobe(input.baseDir);
  try {
    const fence = await acquireHostDataFenceWithWait(
      resolveDesktopHostRootPaths(input.baseDir).dataFencePath,
    );
    fence.release();
  } catch (error) {
    lease.release();
    throw error;
  }
  return lease;
}
