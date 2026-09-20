import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir(), isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false },
  globalShortcut: { register: () => {}, unregister: () => {} },
  ipcMain: { removeHandler: () => {}, handle: () => {} },
  Menu: { setApplicationMenu: () => {} },
  powerSaveBlocker: { start: () => 1, stop: () => {}, isStarted: () => false },
}));

import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { publishHostControlDiscovery } from "@/backend/ownership/hostControlDiscovery";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { admitDesktopStartup } from "./desktopAppAdmission";
import { desktopApp } from "./desktopAppState";

const roots: string[] = [];
const leases: HostOwnerLease[] = [];

afterEach(() => {
  desktopApp.deferredStandaloneProbe = null;
  desktopApp.desktopOwnerAcquisitionError = null;
  desktopApp.desktopOwnerLease?.release();
  desktopApp.desktopOwnerLease = null;
  desktopApp.poracodePaths = null;
  for (const lease of leases.splice(0)) if (!lease) continue;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A desktop owner that died hard: its lease is free (the process is gone),
 * but its owner record still reads non-stopped and its discovery file still
 * points at a port nothing listens on — exactly what a crash leaves behind.
 */
function buildHardKilledDesktopOwner(): { baseDir: string } {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-admission-")));
  roots.push(root);
  const baseDir = join(root, "profile");
  const paths = resolveDesktopHostRootPaths(baseDir);
  const lease = HostOwnerLease.acquire(paths, "desktop");
  // The previous run managed the owned root: an empty activated root with
  // its manifest, exactly what a hard kill leaves behind.
  prepareOwnedHostRoot(lease);
  publishHostControlDiscovery(lease, 1, randomBytes(32).toString("base64url"));
  lease.release();
  // A killed process never wrote its "stopped" phase: restore the record a
  // hard kill leaves behind so the discovery stays verifiable-but-unreachable.
  const record = JSON.parse(readFileSync(paths.ownerRecordPath, "utf8")) as {
    phase: string;
  };
  record.phase = "ready";
  writeFileSync(paths.ownerRecordPath, `${JSON.stringify(record, null, 2)}\n`);
  return { baseDir };
}

describe("desktop startup admission over the unified data root", () => {
  it("recovers a hard-killed desktop owner through the lease and prepares the owned root", async () => {
    const { baseDir } = buildHardKilledDesktopOwner();
    desktopApp.deferredStandaloneProbe = { baseDir };

    const result = await admitDesktopStartup();

    expect(result).toEqual({ kind: "managed" });
    const paths = resolveDesktopHostRootPaths(baseDir);
    expect(desktopApp.poracodePaths?.baseDir).toBe(`${baseDir}.host-v1`);
    expect(desktopApp.desktopOwnerLease?.paths.dataRoot).toBe(paths.dataRoot);
    // The fresh owned root was created with its manifest; the discovery of
    // the killed owner was left alone (the lease arbitration replaced it).
    expect(desktopApp.desktopOwnerAcquisitionError).toBeNull();
  });

  it("still refuses stale evidence of a non-desktop owner", async () => {
    const { baseDir } = buildHardKilledDesktopOwner();
    const paths = resolveDesktopHostRootPaths(baseDir);
    // Rewrite the surviving owner record as a headless owner: the desktop
    // must not silently adopt another kind's root without the operator.
    const record = JSON.parse(readFileSync(paths.ownerRecordPath, "utf8")) as Record<
      string,
      unknown
    >;
    record["kind"] = "headless";
    writeFileSync(paths.ownerRecordPath, `${JSON.stringify(record, null, 2)}\n`);
    desktopApp.deferredStandaloneProbe = { baseDir };

    await expect(admitDesktopStartup()).rejects.toThrow(/unreachable-owner/u);
    expect(desktopApp.poracodePaths).toBeNull();
  });
});
