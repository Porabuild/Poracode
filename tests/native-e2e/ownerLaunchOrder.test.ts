// Gate 2.1 / S1.6 launch-order drill matrix at the native seam (Gates 2-3
// Batch 1 freeze evidence, Lane 1C).
//
// The full two-real-Electron run is scripted for the freeze boundary (see
// tmp/v4-g23-batch1/lane-1c/NOTES.md). Everything here exercises the REAL
// admission machinery in-process against a real profile root: the kernel
// lease (SQLite EXCLUSIVE), host-control discovery with the authenticated
// describe over loopback, the data-custody fence, and the owner-kind attach
// gate.
//
// Each assertion targets a NEW batch invariant and fails against pre-batch
// behavior:
// - desktop owners publish discovery and describe with mode "desktop" and a
//   null endpoint (pre-batch: desktop owners published nothing, so a second
//   launch got misleading guidance and fought the lease unauthenticated);
// - the latecomer's attach decision refuses with the explicit
//   "desktop-owner-admission-disabled" reason (pre-batch: fell through to
//   `managed` and started a second authority);
// - HostRootInUseError guidance names the holder kind;
// - a fresh admission that only hits the orphan-held data fence refuses AND
//   releases its lease (pre-batch: no fence existed at all);
// - a concurrently quitting owner is waited out by the bounded reprobe
//   instead of failing the launch immediately.
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { callHostControl, HostControlRefusedError } from "@/backend/ownership/hostControlClient";
import { readHostControlDiscovery } from "@/backend/ownership/hostControlDiscovery";
import {
  acquireHostDataFenceWithWait,
  HostDataFenceInUseError,
} from "@/backend/ownership/hostDataFence";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import {
  resolveDesktopHostRootPaths,
  resolveHostRootPaths,
  type HostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import { startDesktopHostControl } from "@/main/backend/desktopHostControl";
import {
  acquireDesktopOwnerLeaseWithReprobe,
  admitDesktopManagedOwner,
} from "@/main/backend/desktopOwnerAdmission";
import {
  decideStandaloneAttach,
  peekStandaloneOwnerDiscovery,
} from "@/main/backend/standaloneAttach";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

interface OwnerFixture {
  readonly namespace: string;
  readonly paths: HostRootPaths;
}

function fixture(kind: "desktop" | "headless"): OwnerFixture {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-owner-launch-order-")));
  const namespace = join(root, "profile");
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return {
    namespace,
    paths:
      kind === "desktop" ? resolveDesktopHostRootPaths(namespace) : resolveHostRootPaths(namespace),
  };
}

async function waitForDiscovery(paths: HostRootPaths): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      readHostControlDiscovery(paths);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Host control discovery did not appear in time.");
}

describe("owner launch-order drill (Gate 2.1 freeze matrix, native seam)", () => {
  it("desktop owner first: the latecomer discovers it, attach admission refuses with the batch reason, and the lease refusal carries desktop guidance", async () => {
    const { namespace, paths } = fixture("desktop");
    const lease = HostOwnerLease.acquire(paths, "desktop");
    // Desktop admission deliberately does not write the owned-root manifest:
    // the manifest would make the namespace resolvers refuse the profile, and
    // the desktop mapping is not on HostOwnerController yet (Gate 2.5).
    lease.setPhase("ready");
    const reportError = vi.fn<(error: unknown) => void>();
    const control = startDesktopHostControl({
      lease,
      reportError,
      capabilities: {
        ssh: true,
        browserPanel: true,
        chromeBridge: true,
        computerUse: true,
        nativeSecrets: true,
        portForward: true,
        autoUpdate: false,
        osNotifications: false,
      },
    });
    expect(control).not.toBeNull();

    try {
      await waitForDiscovery(paths);
      const describeReply = await callHostControl(paths, "describe");
      expect(describeReply.ownerGeneration).toBe(lease.generation);
      expect(describeReply.result).toMatchObject({
        state: "ready",
        mode: "desktop",
        endpoint: null,
        profileNamespace: namespace,
      });

      // The latecomer sees authenticated evidence and fails closed on the
      // kind gate instead of fighting the lease.
      expect(peekStandaloneOwnerDiscovery(namespace)).toBe(true);
      await expect(decideStandaloneAttach(namespace)).resolves.toMatchObject({
        kind: "refuse",
        reason: "desktop-owner-admission-disabled",
        controlPaths: { profileNamespace: namespace },
      });

      // A second desktop admission never acquires: bounded reprobe, then a
      // loud refusal whose guidance matches the holder kind.
      await expect(
        admitDesktopManagedOwner({ baseDir: namespace, channel: "stable" }),
      ).rejects.toThrow(HostRootInUseError);
      await expect(
        admitDesktopManagedOwner({ baseDir: namespace, channel: "stable" }),
      ).rejects.toThrow(/Quit the running Poracode app/);
      expect(() => HostOwnerLease.acquire(paths, "desktop")).toThrow(HostRootInUseError);

      // The desktop owner mints no attach pairings: the handler failure maps
      // to the protocol's refused outcome without leaking handler detail.
      const pairingError = await callHostControl(paths, "issue-pairing").then(
        () => null,
        (error: unknown) => error,
      );
      expect(pairingError).toBeInstanceOf(HostControlRefusedError);
      expect((pairingError as HostControlRefusedError).code).toBe("unavailable");

      // Control publication is additive: it started cleanly.
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      await control?.dispose();
      lease.release();
    }
  });

  it("an orphaned backend holding the data fence refuses a fresh admission, and the failed admission does not retain its lease", async () => {
    const { namespace, paths } = fixture("desktop");
    const fence = await acquireHostDataFenceWithWait(paths.dataFencePath, 1, 10);
    try {
      // S1.3: the custody fence is a real artifact on the shared root.
      expect(existsSync(paths.dataFencePath)).toBe(true);

      // Lease is free, so admission gets past the lease and must refuse on
      // the fence probe — the orphaned-backend window is closed.
      await expect(
        admitDesktopManagedOwner({ baseDir: namespace, channel: "stable" }),
      ).rejects.toThrow(HostDataFenceInUseError);

      // The refused admission released its lease before throwing: a clean
      // owner can acquire immediately.
      const lease = HostOwnerLease.acquire(paths, "desktop");
      lease.release();
    } finally {
      fence.release();
    }
  });

  it("a concurrently quitting owner is waited out: the second admission defers through the bounded reprobe and succeeds", async () => {
    const { namespace, paths } = fixture("desktop");
    const quitting = HostOwnerLease.acquire(paths, "desktop");
    const released = new Promise<void>((resolve) =>
      setTimeout(() => {
        quitting.release();
        resolve();
      }, 300),
    );

    const started = Date.now();
    const lease = await acquireDesktopOwnerLeaseWithReprobe(namespace, {
      attempts: 6,
      delayMs: 100,
    });
    await released;
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    lease.release();
  });

  it("a genuinely held root fails loudly after the bounded reprobe instead of waiting forever", async () => {
    const { namespace, paths } = fixture("desktop");
    const holder = HostOwnerLease.acquire(paths, "desktop");
    try {
      await expect(
        acquireDesktopOwnerLeaseWithReprobe(namespace, { attempts: 2, delayMs: 10 }),
      ).rejects.toThrow(HostRootInUseError);
    } finally {
      holder.release();
    }
  });

  it("headless owner first: the latecomer attaches through the authenticated describe instead of starting a second authority", async () => {
    const { namespace, paths } = fixture("headless");
    const lease = HostOwnerLease.acquire(paths, "headless");
    prepareOwnedHostRoot(lease);
    lease.setPhase("ready");
    const control = new HostControlServer({
      lease,
      describe: () => ({
        state: "ready",
        remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        endpoint: "http://127.0.0.1:46511/",
        capabilities: {
          ssh: true,
          browserPanel: false,
          chromeBridge: true,
          computerUse: true,
          nativeSecrets: false,
          portForward: true,
          autoUpdate: false,
          osNotifications: false,
        },
      }),
      issuePairing: () => "http://127.0.0.1:46511/pair#token=drill",
    });
    await control.start();

    try {
      const decision = await decideStandaloneAttach(namespace);
      expect(decision).toMatchObject({
        kind: "attach",
        endpoint: "http://127.0.0.1:46511/",
        ownerGeneration: lease.generation,
        description: { mode: "headless" },
      });
    } finally {
      await control.dispose();
      lease.release();
    }
  });
});
