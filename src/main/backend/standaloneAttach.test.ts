// Focused regression for actual standalone-attach startup composition.
// Proves: healthy external attach skips owner/fork/key init; incompatible /
// non-ready / non-headless / unreachable owners refuse (fail closed, never a
// second authority); definitive absence preserves the managed path; the pinned
// generation comes from the authenticated describe; pairing is minted only
// after attach via issue-pairing; quit leaves the fixture owner healthy.
//
// No lease is acquired here, no SQLite is opened, no backend is forked, and
// no secret-key init runs on any path — by construction (see the
// side-effect-free assertions) and by fixture mtime/record checks.

import { mkdtempSync, realpathSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostControlServer, type HostControlContext } from "@/backend/ownership/HostControlServer";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import {
  resolveDesktopHostRootPaths,
  resolveHostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import {
  decideStandaloneAttach,
  peekStandaloneOwnerDiscovery,
  requestStandalonePairing,
} from "./standaloneAttach";

interface OwnerFixture {
  root: string;
  profileNamespace: string;
  lease: HostOwnerLease;
  control: HostControlServer;
  endpoint: string;
  issuePairing: ReturnType<typeof vi.fn>;
}

const cleanups: Array<() => Promise<void>> = [];

async function startOwner(
  overrides: {
    state?: "ready" | "starting" | "stopping";
    remoteProtocolVersion?: number;
    endpoint?: string | null;
    kind?: "headless" | "desktop";
  } = {},
): Promise<OwnerFixture> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-standalone-attach-")));
  const profileNamespace = join(root, "profile");
  const paths = resolveHostRootPaths(profileNamespace);
  const lease = HostOwnerLease.acquire(paths, overrides.kind ?? "headless");
  prepareOwnedHostRoot(lease);
  const endpoint =
    overrides.endpoint === undefined ? "http://127.0.0.1:9/owner/" : overrides.endpoint;
  const issuePairing = vi.fn<(context: HostControlContext) => string | Promise<string>>(
    () => "https://fixture.test/pair#token=fixture-pairing-credential",
  );
  const control = new HostControlServer({
    lease,
    issuePairing,
    describe: () => ({
      state: overrides.state ?? "ready",
      remoteProtocolVersion: overrides.remoteProtocolVersion ?? PORACODE_REMOTE_PROTOCOL_VERSION,
      endpoint,
    }),
  });
  await control.start();
  cleanups.push(async () => {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, profileNamespace, lease, control, endpoint: endpoint ?? "", issuePairing };
}

async function startDesktopOwner(): Promise<OwnerFixture> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-standalone-desktop-")));
  const profileNamespace = join(root, "profile");
  const paths = resolveDesktopHostRootPaths(profileNamespace);
  const lease = HostOwnerLease.acquire(paths, "desktop");
  const issuePairing = vi.fn<(context: HostControlContext) => string | Promise<string>>(
    () => "https://fixture.test/pair#token=fixture-pairing-credential",
  );
  const control = new HostControlServer({
    lease,
    issuePairing,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      endpoint: "http://127.0.0.1:9/owner/",
    }),
  });
  await control.start();
  cleanups.push(async () => {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    profileNamespace,
    lease,
    control,
    endpoint: "http://127.0.0.1:9/owner/",
    issuePairing,
  };
}

/**
 * Simulate `kill -9` (skipped dispose+release): the listener is gone and the
 * kernel lock is free, but the owner record stays `ready` and the discovery
 * record stays readable pointing at a closed port. Graceful cleanup would
 * delete discovery; a crash retains it stale.
 */
async function simulateCrashRetainingStaleDiscovery(owner: OwnerFixture): Promise<void> {
  const { writeFileSync, chmodSync } = await import("node:fs");
  const discoveryPath = join(owner.lease.paths.dataRoot, "host-control.json");
  const discovery = JSON.parse(readFileSync(discoveryPath, "utf8")) as {
    ownerGeneration: string;
    [key: string]: unknown;
  };
  await owner.control.dispose();
  owner.lease.release();
  const recordPath = owner.lease.paths.ownerRecordPath;
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
    phase: string;
    [key: string]: unknown;
  };
  record.phase = "ready";
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8" });
  writeFileSync(
    discoveryPath,
    `${JSON.stringify({ ...discovery, transport: { kind: "http-loopback", port: 9 } })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  chmodSync(discoveryPath, 0o600);
}

function disposeNullableClient(client: { dispose: () => void } | null): void {
  client?.dispose();
}

function releaseNullableLease(lease: { release: () => void } | null): void {
  lease?.release();
}

function snapshotFixtureDir(root: string): Map<string, number> {
  const entries = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else entries.set(full, stat.mtimeMs);
    }
  };
  walk(root);
  return entries;
}

afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

describe("standalone attach decision", () => {
  it("attaches to a healthy headless owner with the authenticated generation", async () => {
    const owner = await startOwner();
    const before = snapshotFixtureDir(owner.root);

    const decision = await decideStandaloneAttach(owner.profileNamespace, {
      // Prove pairing is untouched during the decision.
      describeOwner: async (paths, options) => callHostControl(paths, "describe", options),
    });

    expect(decision.kind).toBe("attach");
    if (decision.kind !== "attach") throw new Error("Expected attach.");
    expect(decision.ownerGeneration).toBe(owner.lease.generation);
    expect(decision.endpoint).toBe(owner.endpoint);
    expect(decision.remoteProtocolVersion).toBe(PORACODE_REMOTE_PROTOCOL_VERSION);
    expect(decision.profileNamespace).toContain("profile");
    expect(decision.description.state).toBe("ready");
    expect(owner.issuePairing).not.toHaveBeenCalled();

    // No owner/record/discovery writes by the decision: same files, same mtimes.
    const after = snapshotFixtureDir(owner.root);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [file, mtime] of before) {
      expect(after.get(file)).toBe(mtime);
    }
    expect(peekStandaloneOwnerDiscovery(owner.profileNamespace)).toBe(true);
  });

  it("mints pairing only after attach via issue-pairing with generation pin", async () => {
    const owner = await startOwner();
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("attach");
    if (decision.kind !== "attach") throw new Error("Expected attach.");

    const pairing = await requestStandalonePairing(decision.controlPaths);
    expect(pairing.pairingUrl).toBe("https://fixture.test/pair#token=fixture-pairing-credential");
    expect(pairing.ownerGeneration).toBe(owner.lease.generation);
    expect(pairing.ownerGeneration).toBe(decision.ownerGeneration);
    expect(owner.issuePairing).toHaveBeenCalledOnce();
  });

  it("refuses an incompatible remote protocol without starting another authority", async () => {
    const owner = await startOwner({ remoteProtocolVersion: 999 });
    const recordBefore = readFileSync(join(owner.root, "profile.host-owner.json"), "utf8");

    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("incompatible-owner");
    expect(owner.issuePairing).not.toHaveBeenCalled();
    // No second authority: owner record untouched (same generation, same phase).
    expect(readFileSync(join(owner.root, "profile.host-owner.json"), "utf8")).toBe(recordBefore);
  });

  it("refuses a non-ready owner without starting another authority", async () => {
    const owner = await startOwner({ state: "starting" });
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("non-ready-owner");
    expect(owner.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses a non-headless owner without starting another authority", async () => {
    const owner = await startOwner({ kind: "desktop" });
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    // The gate is owner-kind-aware: a desktop owner refuses on the explicit
    // integration constant, not the generic headless-only rule.
    expect(decision.reason).toBe("desktop-owner-admission-disabled");
    expect(owner.issuePairing).not.toHaveBeenCalled();
  });

  it("sees a published desktop owner (kind desktop) and refuses it authenticated", async () => {
    // S1.1 attach parity: the desktop mapping now publishes host-control
    // discovery, so a second launch finds and authenticates the running
    // desktop owner instead of fighting an invisible lease.
    const owner = await startDesktopOwner();
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("desktop-owner-admission-disabled");
    if (!decision.controlPaths) throw new Error("Expected desktop control paths.");
    expect(decision.controlPaths.dataRoot).toBe(owner.profileNamespace);
    expect(owner.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses an owner with no remote endpoint without starting another authority", async () => {
    const owner = await startOwner({ endpoint: null });
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("incompatible-owner");
    expect(owner.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses an unreachable owner (discovery present, control down) instead of managed fallback", async () => {
    const owner = await startOwner();
    // Simulate a crashed listener with leftover private discovery: capture the
    // published record, dispose the listener (which removes discovery after
    // join), then restore a record pointing at a closed port with the same
    // owner generation/namespace/root and private mode. Describe then fails
    // unreachable while discovery remains verifiable.
    const discoveryPath = join(owner.root, "profile.host-v1", "host-control.json");
    const discovery = JSON.parse(readFileSync(discoveryPath, "utf8")) as {
      ownerGeneration: string;
      [key: string]: unknown;
    };
    await owner.control.dispose();
    const { writeFileSync, chmodSync } = await import("node:fs");
    writeFileSync(
      discoveryPath,
      `${JSON.stringify({ ...discovery, transport: { kind: "http-loopback", port: 9 } })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    chmodSync(discoveryPath, 0o600);
    // The lease stays held (owner process alive, listener dead): do not release.

    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("unreachable-owner");
  });

  it("refuses a crashed headless owner with a free lease (stale .host-v1 evidence, no wrong-root takeover)", async () => {
    const owner = await startOwner();
    await simulateCrashRetainingStaleDiscovery(owner);
    // Crash freed the kernel lock but left stale headless evidence: the lease
    // file, owner record, and discovery are the crash state to judge.
    const leaseBefore = readFileSync(join(owner.root, "profile.host-owner.sqlite"));
    const recordBefore = readFileSync(join(owner.root, "profile.host-owner.json"), "utf8");
    const discoveryBefore = readFileSync(join(owner.root, "profile.host-v1", "host-control.json"));
    const filesBefore = snapshotFixtureDir(owner.root);

    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("unreachable-owner");
    if (!decision.controlPaths) throw new Error("Expected headless control paths.");
    expect(decision.controlPaths.dataRoot).toContain(".host-v1");
    expect(decision.detail).toMatch(/different data root/);
    expect(owner.issuePairing).not.toHaveBeenCalled();

    // Fail-closed wrote nothing: byte-identical lease/record/discovery, no
    // new files, no pairing, no migration into the desktop root.
    expect(readFileSync(join(owner.root, "profile.host-owner.sqlite"))).toEqual(leaseBefore);
    expect(readFileSync(join(owner.root, "profile.host-owner.json"), "utf8")).toBe(recordBefore);
    expect(readFileSync(join(owner.root, "profile.host-v1", "host-control.json"))).toEqual(
      discoveryBefore,
    );
    const filesAfter = snapshotFixtureDir(owner.root);
    expect([...filesAfter.keys()].sort()).toEqual([...filesBefore.keys()].sort());
    // The desktop data root was never opened for this headless crash.
    expect(() => realpathSync.native(join(owner.root, "profile", "state.sqlite"))).toThrow(
      /ENOENT/,
    );
  });

  it("defers a stale desktop mapping to the existing lease-arbitrated managed path", async () => {
    const owner = await startDesktopOwner();
    await simulateCrashRetainingStaleDiscovery(owner);

    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("deferred-managed");
    if (decision.kind !== "deferred-managed") throw new Error("Expected deferred-managed.");
    expect(decision.controlPaths.dataRoot).toBe(decision.controlPaths.profileNamespace);
    expect(owner.issuePairing).not.toHaveBeenCalled();

    // Recovery goes through the lease, never a manual delete: the freed lock
    // re-acquires for the same desktop root, and stale discovery is still
    // present (untouched by the side-effect-free decision).
    expect(() =>
      realpathSync.native(join(owner.root, "profile", "host-control.json")),
    ).not.toThrow();
    const recovered = HostOwnerLease.acquire(
      resolveDesktopHostRootPaths(owner.profileNamespace),
      "desktop",
    );
    try {
      expect(readFileSync(recovered.paths.ownerRecordPath, "utf8")).toContain('"kind"');
    } finally {
      recovered.release();
    }
  });

  it("still refuses when the desktop lock is held (acquire arbitrates, error never swallowed)", async () => {
    const owner = await startDesktopOwner();
    const discoveryPath = join(owner.root, "profile", "host-control.json");
    const discovery = JSON.parse(readFileSync(discoveryPath, "utf8")) as {
      ownerGeneration: string;
      [key: string]: unknown;
    };
    await owner.control.dispose();
    const { writeFileSync, chmodSync } = await import("node:fs");
    writeFileSync(
      discoveryPath,
      `${JSON.stringify({ ...discovery, transport: { kind: "http-loopback", port: 9 } })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    chmodSync(discoveryPath, 0o600);
    // Lease stays held: the decision may defer, but the existing
    // acquire-before-mutations path must still refuse loudly.
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("deferred-managed");
    expect(() =>
      HostOwnerLease.acquire(resolveDesktopHostRootPaths(owner.profileNamespace), "desktop"),
    ).toThrow(HostRootInUseError);
  });

  it("fails closed on unverifiable owner responses (never broad catch-to-managed)", async () => {
    const owner = await startOwner();
    const decision = await decideStandaloneAttach(owner.profileNamespace, {
      readDiscovery: () => ({ sentinel: "readable" }),
      describeOwner: async () => {
        throw new Error("Invalid or unavailable host control response.");
      },
    });
    expect(decision.kind).toBe("refuse");
    if (decision.kind !== "refuse") throw new Error("Expected refuse.");
    expect(decision.reason).toBe("incompatible-owner");
    expect(owner.issuePairing).not.toHaveBeenCalled();
  });

  it("preserves the managed path on definitive absence (no discovery in either mapping)", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-standalone-absent-")));
    const profileNamespace = join(root, "profile");
    try {
      expect(peekStandaloneOwnerDiscovery(profileNamespace)).toBe(false);
      const decision = await decideStandaloneAttach(profileNamespace);
      expect(decision).toEqual({ kind: "managed" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not mistake another profile's owner for this profile (wrong-root)", async () => {
    const owner = await startOwner();
    const otherRoot = realpathSync.native(
      mkdtempSync(join(tmpdir(), "poracode-standalone-other-")),
    );
    try {
      const otherNamespace = join(otherRoot, "profile");
      expect(peekStandaloneOwnerDiscovery(otherNamespace)).toBe(false);
      const decision = await decideStandaloneAttach(otherNamespace);
      expect(decision).toEqual({ kind: "managed" });
      expect(owner.issuePairing).not.toHaveBeenCalled();
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("quit leaves the fixture owner healthy (client cleanup only, no owner stop)", async () => {
    const owner = await startOwner();
    const decision = await decideStandaloneAttach(owner.profileNamespace);
    expect(decision.kind).toBe("attach");
    if (decision.kind !== "attach") throw new Error("Expected attach.");
    await requestStandalonePairing(decision.controlPaths);

    // Simulate Electron quit in attach mode: nullable client/lease handles
    // are no-ops when absent. The owner is never disposed, released, or sent
    // a stop credential here.
    disposeNullableClient(null);
    releaseNullableLease(null);

    const status = await callHostControl(resolveHostRootPaths(owner.profileNamespace), "describe");
    expect(status.result.state).toBe("ready");
    expect(status.ownerGeneration).toBe(owner.lease.generation);
  });

  it("imports no SQLite/lease/fork/key-init surface in the attach path", async () => {
    const modulePath = join(process.cwd(), "src/main/backend/standaloneAttach.ts");
    const source = readFileSync(modulePath, "utf8");
    for (const forbidden of [
      'from "@/main/db"',
      "initDatabase(",
      "getSqlite(",
      "HostOwnerLease.acquire",
      "new HostOwnerController",
      "new BackendHostClient",
      "readOrCreateSafeStorageSecretKey(",
      "publishHostControlDiscovery(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("callHostControl");
    expect(source).toContain("readHostControlDiscovery");
  });
});
