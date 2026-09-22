import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { publishHostControlDiscovery } from "@/backend/ownership/hostControlDiscovery";
import { createHostControlResponseProof } from "@/backend/ownership/hostControlAuth";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import { resolveHostRootPaths, type HostRootPaths } from "@/backend/ownership/hostRootPaths";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { hostControlRequestSchema } from "@/shared/hostControlProtocol";
import {
  probeRunningOwner,
  readReleaseBuildIdentity,
  RunningOwnerRefusedError,
  RunningOwnerUnreachableError,
  stopRunningOwner,
  verifyCandidateStatus,
  type ExpectedCandidateBuild,
  type RunningOwnerProbe,
} from "./serverUpgradeIdentity";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const BUILD = {
  version: "1.8.1",
  sourceRevision: null,
  entrypointSha256: "a".repeat(64),
  root: "/opt/poracode/releases/release-fixture",
  layoutKind: "prefix" as const,
};

async function ownerFixture(
  options: { kind?: "headless" | "desktop"; withStatus?: boolean } = {},
): Promise<{ paths: HostRootPaths; lease: HostOwnerLease }> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-upgrade-identity-")));
  const paths = resolveHostRootPaths(join(root, "profile"));
  const lease = HostOwnerLease.acquire(paths, options.kind ?? "headless");
  prepareOwnedHostRoot(lease);
  const control = new HostControlServer({
    lease,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: 12,
      endpoint: "http://127.0.0.1:1/",
      capabilities: {
        ssh: false,
        browserPanel: false,
        chromeBridge: false,
        computerUse: false,
        nativeSecrets: false,
        portForward: false,
        autoUpdate: false,
        osNotifications: false,
      },
    }),
    ...(options.withStatus === false
      ? {}
      : {
          status: () => ({
            state: "ready" as const,
            admission: "open" as const,
            endpoint: "http://127.0.0.1:1/",
            build: BUILD,
          }),
        }),
    issuePairing: () => "https://fixture.test/pair#token=fixture",
  });
  await control.start();
  cleanups.push(async () => {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  return { paths, lease };
}

describe("owner identity probing (D4)", () => {
  it("returns the authenticated status identity for a D4 owner", async () => {
    const { paths, lease } = await ownerFixture();
    const probe = await probeRunningOwner(paths);
    expect(probe).toMatchObject({
      generation: lease.generation,
      kind: "headless",
      status: { admission: "open", build: BUILD },
    });
  });

  it("treats a pre-D4 owner as drain-only without weakening authentication", async () => {
    const { paths } = await ownerFixture({ withStatus: false });
    const probe = await probeRunningOwner(paths);
    expect(probe?.status).toBeNull();
    expect(probe?.description.operations).toEqual(["describe", "issue-pairing"]);
  });

  it("refuses a desktop owner instead of draining it", async () => {
    const { paths } = await ownerFixture({ kind: "desktop" });
    await expect(probeRunningOwner(paths)).rejects.toBeInstanceOf(RunningOwnerRefusedError);
  });

  it("fails closed when the status reply cannot be authenticated", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-upgrade-forged-")));
    const paths = resolveHostRootPaths(join(root, "profile"));
    const lease = HostOwnerLease.acquire(paths, "headless");
    prepareOwnedHostRoot(lease);
    const secret = randomBytes(32).toString("base64url");
    const server = createServer((request, response) => {
      void (async () => {
        const body = await readBoundedNodeRequestBody(
          request,
          4_096,
          () => new Error("fixture size"),
        );
        const input = hostControlRequestSchema.parse(JSON.parse(body.toString("utf8")));
        if (input.operation === "describe") {
          const bytes = Buffer.from(
            JSON.stringify({
              version: 2,
              requestId: input.requestId,
              ownerGeneration: input.ownerGeneration,
              ok: true,
              result: {
                profileNamespace: paths.profileNamespace,
                dataRoot: paths.dataRoot,
                mode: "headless",
                state: "ready",
                operations: ["describe", "issue-pairing"],
                capabilities: {
                  ssh: false,
                  browserPanel: false,
                  chromeBridge: false,
                  computerUse: false,
                  nativeSecrets: false,
                  portForward: false,
                  autoUpdate: false,
                  osNotifications: false,
                },
                remoteProtocolVersion: 12,
                endpoint: null,
              },
            }),
          );
          response.setHeader(
            "x-poracode-control-proof",
            createHostControlResponseProof(secret, request.headers.authorization!, 200, bytes),
          );
          response.end(bytes);
          return;
        }
        // A forged status reply: correct shape, wrong (unsigned) proof.
        const bytes = Buffer.from(
          JSON.stringify({
            version: 2,
            requestId: input.requestId,
            ownerGeneration: input.ownerGeneration,
            ok: true,
            result: {
              profileNamespace: paths.profileNamespace,
              dataRoot: paths.dataRoot,
              mode: "headless",
              state: "ready",
              admission: "held",
              endpoint: null,
              build: BUILD,
            },
          }),
        );
        response.setHeader("x-poracode-control-proof", randomBytes(32).toString("base64url"));
        response.end(bytes);
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture listen failed");
    publishHostControlDiscovery(lease, address.port, secret);
    cleanups.push(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      lease.release();
      rmSync(root, { recursive: true, force: true });
    });
    await expect(probeRunningOwner(paths)).rejects.toBeInstanceOf(RunningOwnerUnreachableError);
  });

  it("refuses to signal a probe whose recorded PID was reused", async () => {
    const probe: RunningOwnerProbe = {
      paths: resolveHostRootPaths(
        join(mkdtempSync(join(tmpdir(), "poracode-upgrade-reuse-")), "p"),
      ),
      generation: randomUUID(),
      pid: process.pid,
      processIdentity: "identity-that-cannot-match",
      kind: "headless",
      phase: "ready",
      description: {} as RunningOwnerProbe["description"],
      status: null,
    };
    await expect(stopRunningOwner(probe)).rejects.toBeInstanceOf(RunningOwnerUnreachableError);
  });
});

describe("owner probe null semantics (V6)", () => {
  it("returns null for a profile with no owner record", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-upgrade-null-")));
    cleanups.push(async () => rmSync(root, { recursive: true, force: true }));
    const paths = resolveHostRootPaths(join(root, "profile"));
    await expect(probeRunningOwner(paths)).resolves.toBeNull();
  });

  it("returns null for a stopped record even while its recorded PID is still alive", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-upgrade-stopped-")));
    cleanups.push(async () => rmSync(root, { recursive: true, force: true }));
    const paths = resolveHostRootPaths(join(root, "profile"));
    const lease = HostOwnerLease.acquire(paths, "headless");
    // Same process, so the recorded PID stays alive after the explicit stop;
    // null here means "no live owner", not "process proof absent".
    lease.release();
    await expect(probeRunningOwner(paths)).resolves.toBeNull();
  });
});

describe("candidate identity verification (D4)", () => {
  const expected: ExpectedCandidateBuild = {
    profileNamespace: "/profile",
    dataRoot: "/profile.host-v1",
    releaseRoot: BUILD.root,
    version: BUILD.version,
    entrypointSha256: BUILD.entrypointSha256,
  };
  const status = {
    profileNamespace: "/profile",
    dataRoot: "/profile.host-v1",
    mode: "headless" as const,
    state: "starting" as const,
    admission: "held" as const,
    endpoint: null,
    build: BUILD,
  };

  it("accepts the exact build and reports every mismatch otherwise", () => {
    expect(verifyCandidateStatus(status, expected, { requireAdmission: "held" })).toEqual([]);
    expect(
      verifyCandidateStatus({ ...status, build: { ...BUILD, version: "9.9.9" } }, expected, {
        requireAdmission: "held",
      }),
    ).toMatchObject([{ field: "build.version", expected: "1.8.1", actual: "9.9.9" }]);
    expect(
      verifyCandidateStatus({ ...status, build: { ...BUILD, entrypointSha256: null } }, expected, {
        requireAdmission: "held",
      }),
    ).toMatchObject([{ field: "build.entrypointSha256" }]);
    expect(
      verifyCandidateStatus({ ...status, dataRoot: "/other.host-v1" }, expected, {
        requireAdmission: "held",
      }),
    ).toMatchObject([{ field: "dataRoot" }]);
    expect(
      verifyCandidateStatus({ ...status, admission: "open" }, expected, {
        requireAdmission: "held",
      }),
    ).toMatchObject([{ field: "admission" }]);
    expect(verifyCandidateStatus(status, expected, { requireAdmission: "open" })).toMatchObject([
      { field: "admission" },
    ]);
  });
});

describe("release build identity (D4)", () => {
  it("reads the artifact version and entrypoint hash of a staged prefix release", () => {
    const release = mkdtempSync(join(tmpdir(), "poracode-upgrade-release-"));
    cleanups.push(async () => rmSync(release, { recursive: true, force: true }));
    mkdirSync(join(release, "lib"), { recursive: true });
    mkdirSync(join(release, "resources"), { recursive: true });
    writeFileSync(join(release, "package.json"), `${JSON.stringify({ version: "2.3.4" })}\n`);
    writeFileSync(join(release, "lib", "server.cjs"), "entrypoint\n");
    const identity = readReleaseBuildIdentity(release);
    expect(identity).toMatchObject({
      root: release,
      layoutKind: "prefix",
      version: "2.3.4",
    });
    expect(identity.entrypointSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("reports missing metadata instead of inventing an identity", () => {
    const release = mkdtempSync(join(tmpdir(), "poracode-upgrade-release-bare-"));
    cleanups.push(async () => rmSync(release, { recursive: true, force: true }));
    mkdirSync(join(release, "lib"), { recursive: true });
    writeFileSync(join(release, "lib", "server.cjs"), "entrypoint\n");
    const identity = readReleaseBuildIdentity(release);
    expect(identity.layoutKind).toBeNull();
    expect(identity.version).toBeNull();
  });
});
