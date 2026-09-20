// Focused regression for the extracted Electron bootstrap helpers: namespace
// mapping, sync peek side-effect-freedom, deferred outcomes, refusal text,
// ephemeral shell state isolation, attach-mode database guards, and the S1.4
// attach-session generation re-verification.

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import {
  createEphemeralShellState,
  createStandaloneAttachSession,
  decideDeferredStandaloneAttach,
  describeAttachRefusal,
  resolveDesktopBaseDir,
  shouldDeferLeaseForAttachProbe,
} from "./standaloneAttachBootstrap";

const cleanups: Array<() => Promise<void>> = [];

/** Real fixture owner on the desktop mapping: lease + published control. */
async function startFixtureOwner(): Promise<{
  profileNamespace: string;
  controlPaths: ReturnType<typeof resolveDesktopHostRootPaths>;
  lease: HostOwnerLease;
  control: HostControlServer;
}> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-attach-session-")));
  const profileNamespace = join(root, "profile");
  const controlPaths = resolveDesktopHostRootPaths(profileNamespace);
  const lease = HostOwnerLease.acquire(controlPaths, "desktop");
  const control = new HostControlServer({
    lease,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      endpoint: null,
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
    }),
    issuePairing: () => Promise.reject(new Error("Fixture owner mints no pairings.")),
  });
  await control.start();
  cleanups.push(async () => {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  return { profileNamespace, controlPaths, lease, control };
}

function sessionInput(
  owner: Awaited<ReturnType<typeof startFixtureOwner>>,
): Parameters<typeof createStandaloneAttachSession>[0] {
  return {
    controlPaths: owner.controlPaths,
    mode: owner.lease.kind,
    info: {
      profileNamespace: owner.profileNamespace,
      dataRoot: owner.controlPaths.dataRoot,
      endpoint: "http://127.0.0.1:9/owner/",
      ownerGeneration: owner.lease.generation,
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      pairingUrl: "https://fixture.test/pair#token=fixture-pairing-credential",
    },
  };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("standalone attach bootstrap", () => {
  it("maps the desktop base dir like managed startup", () => {
    expect(
      resolveDesktopBaseDir({
        baseDirOverride: "/tmp/custom-profile",
        isDev: false,
        channel: "stable",
      }),
    ).toBe("/tmp/custom-profile");
    expect(resolveDesktopBaseDir({ isDev: true, channel: "stable" })).toContain(".poracode-dev");
    expect(resolveDesktopBaseDir({ isDev: false, channel: "stable" })).toContain(".poracode");
  });

  it("peeks without side effects on definitive absence", () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-attach-peek-")));
    try {
      const namespace = join(root, "profile");
      expect(shouldDeferLeaseForAttachProbe(namespace)).toBe(false);
      // Peek created no lease, record, or discovery files.
      expect(() => realpathSync.native(join(root, "profile.host-owner.sqlite"))).toThrow(/ENOENT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns no-probe when startup took the synchronous managed path", async () => {
    await expect(decideDeferredStandaloneAttach(null)).resolves.toEqual({ kind: "no-probe" });
  });

  it("returns managed when deferred discovery vanished (owner stopped)", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-attach-deferred-")));
    try {
      await expect(
        decideDeferredStandaloneAttach({ baseDir: join(root, "profile") }),
      ).resolves.toEqual({ kind: "managed", baseDir: join(root, "profile") });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("describes refusals without leaking secrets", () => {
    const text = describeAttachRefusal({
      kind: "refuse",
      baseDir: "/tmp/profile",
      reason: "incompatible-owner",
      detail: "Existing owner remote protocol is 999; this build requires 12.",
    });
    expect(text).toContain("cannot attach");
    expect(text).toContain("incompatible-owner");
    expect(text).not.toContain("pairing");
    expect(text).not.toContain("token");
  });

  it("keeps ephemeral shell state off the owned root", async () => {
    const state = createEphemeralShellState();
    expect(state.get("window-bounds")).toBeNull();
    state.set("window-bounds", JSON.stringify({ width: 100, height: 100 }));
    expect(JSON.parse(state.get("window-bounds") as string)).toMatchObject({ width: 100 });
    await expect(state.close()).resolves.toBeUndefined();
  });

  it("keeps attach mode off the local backend structurally (no handlers to guard)", async () => {
    const modulePath = join(process.cwd(), "src/main/backend/standaloneAttachBootstrap.ts");
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(modulePath, "utf8");
    expect(source).not.toContain("createAttachModeDatabaseGuard");
    expect(source).not.toContain("throwWhenLocalBackendMissing");
    // Fail-closed is handler absence (attach startup never registers local
    // procedure handlers), not a guard call: nothing here may acquire a lease,
    // fork a backend, or open SQLite.
    for (const forbidden of [
      "HostOwnerLease.acquire",
      "new BackendHostClient",
      "initDatabase(",
      "getSqlite(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("standalone attach session re-verification (S1.4)", () => {
  it("re-verifies the pinned generation through an authenticated describe", async () => {
    const owner = await startFixtureOwner();
    const session = createStandaloneAttachSession(sessionInput(owner));
    await expect(session.reverify()).resolves.toBeUndefined();
  });

  it("refuses loudly when the owner generation changed (restarted under the profile)", async () => {
    const owner = await startFixtureOwner();
    const session = createStandaloneAttachSession(sessionInput(owner));
    // Simulate the owner restarting under the same root: old control down,
    // fresh lease generation, fresh control surface at the same paths.
    await owner.control.dispose();
    owner.lease.release();
    const successor = HostOwnerLease.acquire(owner.controlPaths, "desktop");
    const control = new HostControlServer({
      lease: successor,
      describe: () => ({
        state: "ready",
        remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        endpoint: null,
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
      }),
      issuePairing: () => Promise.reject(new Error("Fixture owner mints no pairings.")),
    });
    await control.start();
    try {
      await expect(session.reverify()).rejects.toThrow(/generation changed/u);
    } finally {
      await control.dispose();
      successor.release();
    }
  });

  it("refuses when the owner can no longer be re-verified (unreachable)", async () => {
    const owner = await startFixtureOwner();
    const session = createStandaloneAttachSession(sessionInput(owner));
    await owner.control.dispose();
    owner.lease.release();
    await expect(session.reverify()).rejects.toThrow(/could not be re-verified/u);
  });
});
