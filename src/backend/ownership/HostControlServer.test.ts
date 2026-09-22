import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedNodeRequestBody } from "@/shared/http";
import {
  HOST_CONTROL_DISCOVERY_FILE,
  HOST_CONTROL_PROTOCOL_VERSION,
  type HostControlAdmitPayload,
} from "@/shared/hostControlProtocol";
import {
  HostControlServer,
  type HostControlContext,
  type HostControlStatusSource,
} from "./HostControlServer";
import { HostOwnerLease, HostRootInUseError } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";
import { prepareOwnedHostRoot } from "./hostRootManifest";
import { callHostControl } from "./hostControlClient";
import { readHostControlDiscovery } from "./hostControlDiscovery";
import { createHostControlRequestProof } from "./hostControlAuth";

const cleanup: Array<() => Promise<void>> = [];

async function fixture(
  options: {
    issuePairing?: (context: HostControlContext) => string | Promise<string>;
    start?: boolean;
    reportError?: (error: unknown) => void;
    status?: () => HostControlStatusSource;
    admit?: (
      context: HostControlContext,
      expected: HostControlAdmitPayload,
    ) => void | Promise<void>;
  } = {},
) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-owner-control-")));
  const paths = resolveHostRootPaths(join(root, "profile"));
  const lease = HostOwnerLease.acquire(paths, "headless");
  prepareOwnedHostRoot(lease);
  const issuePairing = vi.fn<(context: HostControlContext) => string | Promise<string>>(
    options.issuePairing ?? (() => "https://fixture.test/pair#token=fixture"),
  );
  let now = Date.now();
  const control = new HostControlServer({
    lease,
    issuePairing,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: 12,
      endpoint: "https://fixture.test/s/host/",
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
    receiptNow: () => now,
    ...(options.reportError ? { reportError: options.reportError } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.admit ? { admit: options.admit } : {}),
  });
  cleanup.push(async () => {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  if (options.start !== false) await control.start();
  return {
    control,
    lease,
    paths,
    issuePairing,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

async function rawCall(
  test: Awaited<ReturnType<typeof fixture>>,
  changed: {
    method?: string;
    path?: string;
    host?: string;
    headers?: Record<string, string>;
    payload?: Record<string, unknown>;
    rawBody?: Buffer;
    issuedAt?: number;
  } = {},
) {
  const discovery = readHostControlDiscovery(test.paths);
  const method = changed.method ?? "POST";
  const path = changed.path ?? "/control";
  const authority = changed.host ?? `127.0.0.1:${discovery.transport.port}`;
  const body =
    changed.rawBody ??
    Buffer.from(
      JSON.stringify({
        version: HOST_CONTROL_PROTOCOL_VERSION,
        requestId: randomUUID(),
        ownerGeneration: test.lease.generation,
        operation: "issue-pairing",
        payload: {},
        ...changed.payload,
      }),
    );
  return new Promise<number>((resolve, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port: discovery.transport.port,
        method,
        path,
        agent: false,
        headers: {
          host: authority,
          authorization: createHostControlRequestProof(
            discovery.token,
            { method, path, authority, body },
            changed.issuedAt,
          ),
          "content-type": "application/json",
          "content-length": body.length,
          ...changed.headers,
        },
      },
      (response) => {
        void readBoundedNodeRequestBody(response, 16_384, () => new Error("fixture response size"))
          .then(() => resolve(response.statusCode!))
          .catch(reject);
      },
    );
    outgoing.once("error", reject);
    outgoing.end(body);
  });
}

describe("live owner control", () => {
  it("shares concurrent listen and only advertises supported management with a preserved base path", async () => {
    const test = await fixture({ start: false });
    const first = test.control.start();
    expect(test.control.start()).toBe(first);
    await first;
    await expect(callHostControl(test.paths, "describe")).resolves.toMatchObject({
      result: {
        profileNamespace: test.paths.profileNamespace,
        dataRoot: test.paths.dataRoot,
        mode: "headless",
        operations: ["describe", "issue-pairing"],
        endpoint: "https://fixture.test/s/host/",
      },
    });
    expect(
      () =>
        new HostControlServer({
          lease: test.lease,
          describe: () => ({
            state: "ready",
            remoteProtocolVersion: 12,
            endpoint: null,
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
          issuePairing: test.issuePairing,
        }),
    ).toThrow("already has");
  });

  it("joins a concurrent listen during stop without publishing usable discovery", async () => {
    const test = await fixture({ start: false });
    const starting = test.control.start();
    const outcome = starting.catch((error: unknown) => error);
    const stopping = test.control.dispose();
    expect(test.control.dispose()).toBe(stopping);
    await stopping;
    expect(await outcome).toBeInstanceOf(Error);
    expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
    await expect(test.control.start()).rejects.toThrow("stopping");
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "finishes a confirmed stop when discovery unlink fails and leaves a refused stale record",
    async () => {
      const reportError = vi.fn<(error: unknown) => void>(() => {
        throw new Error("synthetic diagnostic sink failure");
      });
      const test = await fixture({ reportError });
      await callHostControl(test.paths, "describe");
      const discoveryPath = join(test.paths.dataRoot, HOST_CONTROL_DISCOVERY_FILE);
      chmodSync(test.paths.dataRoot, 0o500);
      try {
        await test.control.dispose();
        expect(reportError).toHaveBeenCalledWith(
          new Error("Closed host control discovery could not be removed."),
        );
        expect(existsSync(discoveryPath)).toBe(true);
        await expect(callHostControl(test.paths, "describe")).rejects.toThrow(
          "could not be reached",
        );
        test.lease.release();
        expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
        const successor = HostOwnerLease.acquire(test.paths, "desktop");
        try {
          expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
        } finally {
          successor.release();
        }
      } finally {
        chmodSync(test.paths.dataRoot, 0o700);
      }
    },
  );

  it.each([
    { method: "GET" },
    { path: "/other" },
    { host: "foreign.test" },
    { headers: { origin: "http://127.0.0.1" } },
    { headers: { origin: "https://foreign.test" } },
    { headers: { "content-type": "text/plain" } },
    { headers: { "content-encoding": "gzip" } },
  ])("refuses browser and alternate routing surfaces (%j)", async (changed) => {
    const test = await fixture();
    expect(await rawCall(test, changed)).toBe(403);
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it.each([
    { headers: { authorization: "Bearer fixture-remote-access-token" } },
    { issuedAt: Date.now() - 60_000 },
    { issuedAt: Date.now() + 60_000 },
  ])("refuses foreign or expired authentication (%j)", async (changed) => {
    const test = await fixture();
    expect(await rawCall(test, changed)).toBe(401);
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it.each([
    { version: 1 },
    { version: 3 },
    { operation: "attach" },
    { operation: "call-database" },
    { payload: { baseDir: "/other" } },
    { actor: "administrator" },
  ])("refuses old, future or expanded management contracts (%j)", async (payload) => {
    const test = await fixture();
    expect(await rawCall(test, { payload })).toBe(400);
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses a correctly signed request for a retired generation", async () => {
    const test = await fixture();
    expect(await rawCall(test, { payload: { ownerGeneration: randomUUID() } })).toBe(200);
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for authenticated malformed JSON and stays usable", async () => {
    const test = await fixture();
    expect(await rawCall(test, { rawBody: Buffer.from("{") })).toBe(400);
    expect(test.issuePairing).not.toHaveBeenCalled();
    await expect(callHostControl(test.paths, "describe")).resolves.toMatchObject({
      result: { profileNamespace: test.paths.profileNamespace },
    });
  });

  it("deduplicates concurrent mutation calls and refuses operation reuse within the receipt window", async () => {
    const held = Promise.withResolvers<string>();
    const test = await fixture({ issuePairing: () => held.promise });
    const requestId = randomUUID();
    const calls = [
      callHostControl(test.paths, "issue-pairing", { requestId }),
      callHostControl(test.paths, "issue-pairing", { requestId }),
    ];
    try {
      await vi.waitFor(() => expect(test.issuePairing).toHaveBeenCalledOnce());
      held.resolve("https://fixture.test/pair#token=once");
      const replies = await Promise.all(calls);
      expect(replies[0]!.result).toEqual(replies[1]!.result);
      await expect(callHostControl(test.paths, "describe", { requestId })).rejects.toMatchObject({
        code: "invalid-request",
      });
    } finally {
      held.resolve("https://fixture.test/pair#token=once");
      await Promise.allSettled(calls);
    }
  });

  it("rejects capacity without evicting retained mutations and allows explicit retry after expiry", async () => {
    const test = await fixture();
    const ids = Array.from({ length: 64 }, () => randomUUID());
    for (const requestId of ids) await callHostControl(test.paths, "issue-pairing", { requestId });
    await expect(callHostControl(test.paths, "issue-pairing")).rejects.toMatchObject({
      code: "capacity",
    });
    await callHostControl(test.paths, "issue-pairing", { requestId: ids[0]! });
    expect(test.issuePairing).toHaveBeenCalledTimes(64);
    test.advance(60_001);
    await callHostControl(test.paths, "issue-pairing", { requestId: ids[0]! });
    expect(test.issuePairing).toHaveBeenCalledTimes(65);
  });

  it("retains a completed mutation when its first response is lost", async () => {
    const abort = new AbortController();
    const test = await fixture({
      issuePairing: () => {
        abort.abort();
        return "https://fixture.test/pair#token=retained";
      },
    });
    const requestId = randomUUID();
    await expect(
      callHostControl(test.paths, "issue-pairing", { requestId, signal: abort.signal }),
    ).rejects.toThrow("cancelled");
    await expect(
      callHostControl(test.paths, "issue-pairing", { requestId }),
    ).resolves.toMatchObject({
      result: { pairingUrl: "https://fixture.test/pair#token=retained" },
    });
    expect(test.issuePairing).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"])(
    "joins held admitted work before the caller can release the lease (%s)",
    async (outcome) => {
      const held = Promise.withResolvers<void>();
      const entered = Promise.withResolvers<void>();
      const minted = vi.fn<() => void>();
      const test = await fixture({
        issuePairing: async (context) => {
          entered.resolve();
          await held.promise;
          if (outcome === "failure") throw new Error("synthetic action failure");
          context.assertActive();
          minted();
          return "https://fixture.test/pair#token=cancelled";
        },
      });
      const call = callHostControl(test.paths, "issue-pairing").catch((error: unknown) => error);
      await entered.promise;
      let closed = false;
      const closing = test.control.dispose().then(() => {
        closed = true;
        test.lease.release();
      });
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        expect(closed).toBe(false);
        expect(() => HostOwnerLease.acquire(test.paths, "desktop")).toThrow(HostRootInUseError);
        held.resolve();
        await closing;
        expect(await call).toBeInstanceOf(Error);
        expect(minted).not.toHaveBeenCalled();
        const successor = HostOwnerLease.acquire(test.paths, "desktop");
        successor.release();
      } finally {
        held.resolve();
        await closing;
        await call;
      }
    },
  );
});

describe("D4 authenticated upgrade identity", () => {
  const expectedBuild = {
    version: "1.8.1",
    sourceRevision: null,
    entrypointSha256: "b".repeat(64),
    root: "/opt/poracode/releases/release-fixture",
    layoutKind: "prefix" as const,
  };

  function stagedFixture() {
    const state = { admission: "held" as "held" | "open", admitted: 0 };
    return {
      state,
      fixture: fixture({
        status: () => ({
          state: "starting",
          admission: state.admission,
          endpoint: null,
          build: expectedBuild,
        }),
        admit: () => {
          state.admitted += 1;
          state.admission = "open";
        },
      }),
    };
  }

  it("answers status while admission is held and releases it only for the exact build", async () => {
    const { state, fixture: create } = stagedFixture();
    const test = await create;
    const status = await callHostControl(test.paths, "status");
    expect(status.result).toMatchObject({
      profileNamespace: test.paths.profileNamespace,
      dataRoot: test.paths.dataRoot,
      mode: "headless",
      state: "starting",
      admission: "held",
      build: expectedBuild,
    });
    // The strict describe list stays old-peer compatible: status/admit are
    // discovered by attempting them, never advertised.
    const described = await callHostControl(test.paths, "describe");
    expect(described.result.operations).toEqual(["describe", "issue-pairing"]);

    await expect(
      callHostControl(test.paths, "admit", {
        payload: { expectedVersion: "1.8.1", expectedEntrypointSha256: "c".repeat(64) },
      }),
    ).rejects.toMatchObject({ code: "identity-mismatch" });
    await expect(
      callHostControl(test.paths, "admit", {
        payload: {
          expectedVersion: "9.9.9",
          expectedEntrypointSha256: expectedBuild.entrypointSha256,
        },
      }),
    ).rejects.toMatchObject({ code: "identity-mismatch" });
    expect(state.admitted).toBe(0);

    const admitted = await callHostControl(test.paths, "admit", {
      payload: {
        expectedVersion: expectedBuild.version,
        expectedEntrypointSha256: expectedBuild.entrypointSha256,
      },
    });
    expect(admitted.result).toMatchObject({ admission: "open" });
    expect(state.admitted).toBe(1);
    // A retried admit after a lost reply is idempotent, not a second release.
    await callHostControl(test.paths, "admit", {
      payload: {
        expectedVersion: expectedBuild.version,
        expectedEntrypointSha256: expectedBuild.entrypointSha256,
      },
    });
    expect(state.admitted).toBe(1);
  });

  it("rejects status and admit exactly like a pre-D4 owner when not composed", async () => {
    const test = await fixture();
    expect(await rawCall(test, { payload: { operation: "status", payload: {} } })).toBe(400);
    expect(
      await rawCall(test, {
        payload: {
          operation: "admit",
          payload: {
            expectedVersion: "1.8.1",
            expectedEntrypointSha256: expectedBuild.entrypointSha256,
          },
        },
      }),
    ).toBe(400);
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated status request without leaking identity", async () => {
    const { fixture: create } = stagedFixture();
    const test = await create;
    expect(
      await rawCall(test, {
        headers: { authorization: "Bearer fixture-remote-access-token" },
        payload: { operation: "status", payload: {} },
      }),
    ).toBe(401);
  });
});
