// Focused regression for desktop managed admission (Gates 2-3, S1.2 + S1.5 +
// S1.3 admission side): a live legacy server with a pending import refuses
// before any acquire; a concurrently releasing owner is re-probed with a
// bounded wait; a busy data fence fails the admission without leaking the
// already-acquired lease.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostDataFence, HostDataFenceInUseError } from "@/backend/ownership/hostDataFence";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  acquireDesktopOwnerLeaseWithReprobe,
  admitDesktopManagedOwner,
  LegacyOwnerActiveError,
  probeLegacyOwnerConflict,
} from "./desktopOwnerAdmission";

const directories: string[] = [];
const leases: HostOwnerLease[] = [];
const fences: HostDataFence[] = [];

function tempRoot(prefix: string): string {
  const parent = mkdtempSync(join(tmpdir(), prefix));
  directories.push(parent);
  return join(realpathSync.native(parent), "profile");
}

function admissionInput(baseDir: string, legacyDataDir: string) {
  return {
    baseDir,
    channel: "stable" as const,
    legacyBaseDir: legacyDataDir,
    allowCustomDataRoot: true,
  };
}

/** A `server.lock` naming THIS process reads as a live legacy server. */
function legacyDirWithLiveLock(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-legacy-live-"));
  directories.push(dir);
  writeFileSync(join(dir, "server.lock"), `${process.pid}\n`, "utf8");
  writeFileSync(join(dir, "state.sqlite"), "legacy-bytes", "utf8");
  return dir;
}

afterEach(() => {
  for (const fence of fences.splice(0)) fence.release();
  for (const lease of leases.splice(0)) lease.release();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("legacy owner refusal", () => {
  it("refuses a pending import while a legacy server is live", () => {
    const baseDir = tempRoot("poracode-admission-");
    const legacy = legacyDirWithLiveLock();
    expect(() => probeLegacyOwnerConflict(admissionInput(baseDir, legacy))).toThrow(
      LegacyOwnerActiveError,
    );
  });

  it("does not refuse an already-migrated profile with a live legacy app", () => {
    const baseDir = tempRoot("poracode-admission-");
    mkdirSync(baseDir, { recursive: true });
    const legacy = legacyDirWithLiveLock();
    // The migration marker mirrors an already-completed import: nothing left
    // to fight over, so the launch proceeds.
    writeFileSync(
      join(baseDir, ".lightcode-migration-v1.json"),
      `${JSON.stringify({
        version: 1,
        completedAt: new Date().toISOString(),
        importedDataRoot: true,
        importedElectronUserData: false,
      })}\n`,
      "utf8",
    );
    expect(() => probeLegacyOwnerConflict(admissionInput(baseDir, legacy))).not.toThrow();
  });

  it("does not refuse when no legacy data exists", () => {
    const baseDir = tempRoot("poracode-admission-");
    // A legacyBaseDir that exists but holds nothing imports nothing.
    const emptyLegacy = mkdtempSync(join(tmpdir(), "poracode-legacy-empty-"));
    directories.push(emptyLegacy);
    expect(() => probeLegacyOwnerConflict(admissionInput(baseDir, emptyLegacy))).not.toThrow();
  });
});

describe("bounded wait-and-reprobe", () => {
  it("acquires a free root immediately", async () => {
    const baseDir = tempRoot("poracode-reprobe-");
    const lease = await acquireDesktopOwnerLeaseWithReprobe(baseDir, { delayMs: 1 });
    leases.push(lease);
    expect(lease.kind).toBe("desktop");
  });

  it("wins the launch race against a concurrently releasing owner", async () => {
    const baseDir = tempRoot("poracode-reprobe-");
    const quitting = HostOwnerLease.acquire(resolveDesktopHostRootPaths(baseDir), "desktop");
    const delayed = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      quitting.release();
    })();
    const lease = await acquireDesktopOwnerLeaseWithReprobe(baseDir, {
      attempts: 3,
      delayMs: 15,
    });
    leases.push(lease);
    await delayed;
    // The successor is a distinct owner, not the quitting one.
    expect(lease.generation).not.toBe(quitting.generation);
  });

  it("fails loudly after the bounded window while the root stays held", async () => {
    const baseDir = tempRoot("poracode-reprobe-");
    leases.push(HostOwnerLease.acquire(resolveDesktopHostRootPaths(baseDir), "desktop"));
    await expect(
      acquireDesktopOwnerLeaseWithReprobe(baseDir, { attempts: 2, delayMs: 5 }),
    ).rejects.toBeInstanceOf(HostRootInUseError);
  });
});

describe("full managed admission", () => {
  it("refuses on the legacy probe before any acquire", async () => {
    const baseDir = tempRoot("poracode-admit-");
    const legacy = legacyDirWithLiveLock();
    await expect(admitDesktopManagedOwner(admissionInput(baseDir, legacy))).rejects.toThrow(
      LegacyOwnerActiveError,
    );
    // Nothing was acquired: the root is free for the legacy-safe relaunch.
    const lease = HostOwnerLease.acquire(resolveDesktopHostRootPaths(baseDir), "desktop");
    leases.push(lease);
  });

  it("releases the lease when the data fence stays busy", async () => {
    const baseDir = tempRoot("poracode-admit-");
    const emptyLegacy = mkdtempSync(join(tmpdir(), "poracode-legacy-empty-"));
    directories.push(emptyLegacy);
    const fence = HostDataFence.acquire(resolveDesktopHostRootPaths(baseDir).dataFencePath);
    fences.push(fence);
    await expect(
      admitDesktopManagedOwner(admissionInput(baseDir, emptyLegacy)),
    ).rejects.toBeInstanceOf(HostDataFenceInUseError);
    fence.release();
    // No leaked lease: the next admission passes the fence probe cleanly.
    const lease = await admitDesktopManagedOwner(admissionInput(baseDir, emptyLegacy));
    leases.push(lease);
  });
});
