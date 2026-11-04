import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostDataFence, HostDataFenceInUseError } from "@/backend/ownership/hostDataFence";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  acquireDesktopOwnerLeaseWithReprobe,
  admitDesktopManagedOwner,
} from "./desktopOwnerAdmission";

const directories: string[] = [];
const leases: HostOwnerLease[] = [];
const fences: HostDataFence[] = [];

function tempRoot(prefix: string): string {
  const parent = mkdtempSync(join(tmpdir(), prefix));
  directories.push(parent);
  return join(realpathSync.native(parent), "profile");
}

afterEach(() => {
  for (const fence of fences.splice(0)) fence.release();
  for (const lease of leases.splice(0)) lease.release();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
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
  it.each(["completed", "requested"])(
    "preserves an old %s import marker without running an import",
    async (state) => {
      const baseDir = tempRoot("poracode-admit-upgrade-");
      mkdirSync(baseDir, { recursive: true });
      const markerPath =
        state === "completed"
          ? join(baseDir, ".lightcode-migration-v1.json")
          : `${baseDir}.lightcode-migration-request-v1`;
      const marker = JSON.stringify(
        state === "completed"
          ? {
              version: 1,
              completedAt: "2026-06-28T00:00:00.000Z",
              importedDataRoot: true,
              importedElectronUserData: true,
            }
          : { version: 1, requestedAt: "2026-06-28T00:00:00.000Z" },
      );
      writeFileSync(markerPath, marker);
      const settingsPath = join(baseDir, "shared-settings.json");
      writeFileSync(settingsPath, '{"theme":"dark"}');

      const lease = await admitDesktopManagedOwner(baseDir);
      leases.push(lease);

      expect(readFileSync(markerPath, "utf8")).toBe(marker);
      expect(readFileSync(settingsPath, "utf8")).toBe('{"theme":"dark"}');
    },
  );
  it("releases the lease when the data fence stays busy", async () => {
    const baseDir = tempRoot("poracode-admit-");
    const fence = HostDataFence.acquire(resolveDesktopHostRootPaths(baseDir).dataFencePath);
    fences.push(fence);
    await expect(admitDesktopManagedOwner(baseDir)).rejects.toBeInstanceOf(HostDataFenceInUseError);
    fence.release();
    // No leaked lease: the next admission passes the fence probe cleanly.
    const lease = await admitDesktopManagedOwner(baseDir);
    leases.push(lease);
  });
});
