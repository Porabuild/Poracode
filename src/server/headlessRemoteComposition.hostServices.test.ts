// V5 plan 1.1 composition proof: the standalone server composes the SAME
// host services as the desktop — SSH environments, the Chrome bridge (+ its
// MCP ingress) and the computer-use MCP ingress — with no Electron anywhere
// in the graph, and publishes them as host-declared capabilities on the
// control-version-2 describe (V5 plan 1.2).

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { HOST_CONTROL_PROTOCOL_VERSION } from "@/shared/hostControlProtocol";
import { ChromeBridgeServer, ChromeMcpIngress } from "@/host/browser";
import { ComputerUseMcpIngress } from "@/host/computer-use";
import { SshConnectionManager } from "@/host/ssh/SshConnectionManager";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { requestPairingFromRunningServer } from "./pairingControl";

// The composition test must not spawn native computer-use drivers; the
// drivers module is the only Electron-free-but-platform-bound seam, so a
// fake driver keeps the construction proof deterministic on every CI host.
const drivers = vi.hoisted(() => {
  const fakeDriver = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "dispose") return () => undefined;
        if (prop === "describeStatus")
          return async () => {
            throw new Error("fixture driver has no status");
          };
        return async () => ({});
      },
    },
  );
  return {
    createComputerUseDriver: vi.fn<() => unknown>(() => fakeDriver),
    isComputerUseBackendAvailable: vi.fn<() => boolean>(() => true),
  };
});

vi.mock("@/host/computer-use/drivers", () => ({
  createComputerUseDriver: drivers.createComputerUseDriver,
  isComputerUseBackendAvailable: drivers.isComputerUseBackendAvailable,
}));

// Mutable state shared with the hoisted vi.mock factories (same harness as
// createHeadlessRemoteHost.test.ts: real ownership lease, mocked app DB and
// supervisor).
const h = vi.hoisted(() => ({
  tmpRoot: "",
  tmpBase: "",
  sharedSettings: {} as SharedSettings,
}));

// The one deliberate mock for the host application database. The E1 import
// migration collapsed two registrations onto the same specifier: a fixed
// inert app-DB fixture and the `@/host/db` importOriginal proxy below. This
// suite has no lifecycle assertions, so the union only needs the proxy: the
// fixed overrides are kept (same empty world as createHeadlessRemoteHost.
// test.ts) and the fallback keeps every other `db*` read/write inert. The B1
// durable attach / pre-launch hooks are named explicitly as no-op unit
// dependencies because the composition must start with no real application
// SQLite handle; the real BackendHostCore / HostPersistenceProducerControl
// still run against them. The ownership lease keeps its real temporary SQLite
// file through the unmocked `@/host/db/connection`.
vi.mock("@/host/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/host/db")>();
  const overrides: Record<string, unknown> = {
    initDatabase: () => undefined,
    closeDatabase: () => undefined,
    attachRuntimePersistenceDurableGapFromCurrentConnection: vi.fn<() => void>(),
    armRuntimeThreadForLaunch: vi.fn<(threadId: string) => void>(),
    addRuntimePersistenceHealthListener: vi.fn<() => () => void>(() => () => undefined),
    setRuntimePersistenceInFlightWindowBytes: vi.fn<(bytes: number | null) => void>(),
    dbGetProjects: () => [],
    dbGetProject: () => null,
    dbGetProjectNotes: () => "",
    dbGetThreads: () => [],
    dbGetThread: () => null,
    dbGetSchedules: () => [],
    dbGetSchedule: () => null,
    dbListScheduleRuns: () => [],
    dbGetPrWatches: () => [],
    dbGetPrWatch: () => null,
  };
  return new Proxy(actual, {
    get(target, property, receiver) {
      if (typeof property === "string" && property in overrides) return overrides[property];
      const value = Reflect.get(target, property, receiver);
      if (
        typeof value === "function" &&
        typeof property === "string" &&
        property.startsWith("db")
      ) {
        return () => undefined;
      }
      return value;
    },
  });
});

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = vi.fn<() => void>();
    dispose = vi.fn<() => Promise<void>>(async () => undefined);
    call = vi.fn<() => Promise<unknown>>(async () => ({}));
  },
}));

vi.mock("@/host/sharedSettingsFile", () => ({
  readSharedSettingsFile: () => h.sharedSettings,
  patchSharedSettingsFile: () => ({}),
  writeSharedSettingsFile: () => undefined,
}));

function makeHost(overrides: Partial<Parameters<typeof createHeadlessRemoteHost>[0]> = {}) {
  return createHeadlessRemoteHost({
    appVersion: "9.9.9-test",
    baseDir: h.tmpBase,
    supervisorPath: "/fixture/server-dir/supervisor.cjs",
    wslHelpersDir: "/fixture/wsl",
    environmentKey: Buffer.alloc(32, 7).toString("base64"),
    host: "127.0.0.1",
    advertisedHost: "127.0.0.1",
    port: 0,
    ...overrides,
  });
}

async function disposeQuietly(
  host: Awaited<ReturnType<typeof makeHost>> | undefined,
): Promise<void> {
  if (host) await host.dispose();
}

describe("standalone host service composition (V5 1.1)", () => {
  beforeEach(() => {
    h.tmpRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "lc-host-services-")));
    h.tmpBase = join(h.tmpRoot, "profile");
    h.sharedSettings = { ...defaultSharedSettings, mcpServers: [], disabledBuiltInMcpServers: {} };
  });

  afterEach(() => {
    rmSync(h.tmpRoot, { recursive: true, force: true });
  });

  it("constructs SSH, the Chrome bridge and computer-use ingress with no native shell", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      host = await makeHost({
        agentPluginsDir: "/fixture/agent-plugins",
        computerUseHelperRoot: "/fixture/computer-use-helper",
      });
      const services = host.hostServices;
      expect(services.sshConnectionManager).toBeInstanceOf(SshConnectionManager);
      expect(services.chromeBridgeServer).toBeInstanceOf(ChromeBridgeServer);
      expect(services.chromeMcpIngress).toBeInstanceOf(ChromeMcpIngress);
      expect(services.computerUseMcpIngress).toBeInstanceOf(ComputerUseMcpIngress);
      // No Electron shell on the standalone server: no browser panel.
      expect(services.browserMcpIngress).toBeNull();
      expect(services.capabilities).toEqual({
        ssh: true,
        browserPanel: false,
        chromeBridge: true,
        computerUse: true,
        nativeSecrets: false,
        portForward: true,
        autoUpdate: false,
        osNotifications: false,
      });
      // The composed services settle their starts without failing startup.
      await expect(host.start()).resolves.toMatchObject({
        httpBaseUrl: expect.stringContaining("http://127.0.0.1:"),
      });
    } finally {
      await disposeQuietly(host);
    }
  });

  it.each(["ssh", "services"] as const)(
    "retains ownership and retries the %s handle after its shutdown join fails",
    async (resource) => {
      const host = await makeHost({ agentPluginsDir: "/fixture/agent-plugins" });
      const target =
        resource === "ssh" ? host.hostServices.sshConnectionManager! : host.hostServices;
      const dispose = vi
        .spyOn(target, "dispose")
        .mockRejectedValueOnce(new Error("join unconfirmed"));
      try {
        await host.start();
        await expect(host.dispose()).rejects.toThrow("did not shut down cleanly");
        expect(dispose).toHaveBeenCalledTimes(1);
        // The existing process owner is still live: a successor must not be
        // admitted after the failed composition join.
        await expect(makeHost()).rejects.toThrow("This process already owns a headless host.");
        await expect(host.dispose()).resolves.toBeUndefined();
        expect(dispose).toHaveBeenCalledTimes(2);
      } finally {
        dispose.mockRestore();
        await host.dispose();
      }
    },
  );

  it("F2: attempts the strongest SSH cleanup even when the environment handoff rejects", async () => {
    // One durable (desired-disabled) environment so the borrowed-manager
    // handoff has a connection to join; the store is the real one under the
    // owned root (the host API does not expose the composition). The owned
    // root must be initialized by a real host first (it requires a host-root
    // manifest), then the seeded registry is read by the next composition.
    const seededEnvironmentId = "11111111-1111-4111-8111-111111111111";
    const bootstrap = await makeHost({ agentPluginsDir: "/fixture/agent-plugins" });
    await bootstrap.dispose();
    const ownedRoot = `${h.tmpBase}.host-v1`;
    writeFileSync(
      join(ownedRoot, "environments.json"),
      `${JSON.stringify(
        {
          formatVersion: 1,
          environments: [
            {
              environmentId: seededEnvironmentId,
              revision: 1,
              label: "Seeded",
              target: "dev@example.test",
              trust: { state: "unknown" },
              runtime: { hash: "a".repeat(64) },
              legacyConnectionIds: [],
              desired: "disabled",
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const host = await makeHost({ agentPluginsDir: "/fixture/agent-plugins" });
    const manager = host.hostServices.sshConnectionManager!;
    const disconnect = vi
      .spyOn(manager, "disconnect")
      .mockRejectedValueOnce(new Error("borrowed-manager handoff unconfirmed"));
    const dispose = vi.spyOn(manager, "dispose");
    try {
      await host.start();
      await expect(host.dispose()).rejects.toThrow("did not shut down cleanly");
      // The rejected environment handoff did not skip the manager's own
      // strongest cleanup attempt.
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(disconnect).toHaveBeenCalledWith(seededEnvironmentId);
      expect(dispose).toHaveBeenCalledTimes(1);
      // Both handles/custody are retained: a successor is still refused and
      // the retry re-attempts only the outstanding environment handoff (the
      // confirmed manager join is never repeated).
      await expect(makeHost()).rejects.toThrow("This process already owns a headless host.");
      await expect(host.dispose()).resolves.toBeUndefined();
      expect(disconnect).toHaveBeenCalledTimes(2);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      disconnect.mockRestore();
      dispose.mockRestore();
      await host.dispose().catch(() => {});
    }
  });

  it("publishes the composed capabilities on the control-version-2 describe", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      host = await makeHost({
        agentPluginsDir: "/fixture/agent-plugins",
        computerUseHelperRoot: "/fixture/computer-use-helper",
      });
      const info = await host.start();
      const descriptor = await fetch(
        new URL("/.well-known/poracode/environment", info.httpBaseUrl),
      );
      expect(await descriptor.json()).toMatchObject({
        capabilities: { sshEnvironments: { versions: [1] } },
      });
      const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
      const exchange = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential }),
      });
      expect(exchange.status).toBe(200);
      const { accessToken } = (await exchange.json()) as { accessToken: string };
      const environments = await fetch(new URL("/api/environments", info.httpBaseUrl), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(environments.status).toBe(200);
      expect(await environments.json()).toEqual({ environments: [] });
      const reply = await callHostControl(resolveHostRootPaths(host.profileNamespace), "describe");
      expect(reply.result).toMatchObject({
        mode: "headless",
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
      });
      // The reply parsed under the versioned schema, so this also proves the
      // v2 describe shape (operations list + capabilities object) end to end.
      expect(HOST_CONTROL_PROTOCOL_VERSION).toBe(2);
    } finally {
      await disposeQuietly(host);
    }
  });

  it("declares no SSH or computer-use capability without the staged inputs", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      host = await makeHost({});
      const services = host.hostServices;
      expect(services.sshConnectionManager).toBeNull();
      expect(services.computerUseMcpIngress).toBeNull();
      // The Chrome bridge has no Electron dependency, so it composes even
      // without any staged inputs.
      expect(services.chromeBridgeServer).toBeInstanceOf(ChromeBridgeServer);
      expect(services.capabilities).toEqual({
        ssh: false,
        browserPanel: false,
        chromeBridge: true,
        computerUse: false,
        nativeSecrets: false,
        portForward: true,
        autoUpdate: false,
        osNotifications: false,
      });
    } finally {
      await disposeQuietly(host);
    }
  });

  it("D4: holds remote admission for a staged candidate and admits only the exact build", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      const buildIdentity = {
        version: "9.9.9-test",
        sourceRevision: null,
        entrypointSha256: "b".repeat(64),
        root: h.tmpBase,
        layoutKind: "prefix" as const,
      };
      host = await makeHost({ staging: true, stagingDeadlineMs: 30_000, buildIdentity });
      const paths = resolveHostRootPaths(host.profileNamespace);
      const starting = host.start();
      await vi.waitFor(
        async () => {
          const reply = await callHostControl(paths, "status");
          expect(reply.result).toMatchObject({
            state: "starting",
            admission: "held",
            build: buildIdentity,
          });
        },
        { timeout: 10_000 },
      );
      // Admission is not a formality: a caller naming another build is refused.
      await expect(
        callHostControl(paths, "admit", {
          payload: { expectedVersion: "9.9.9-test", expectedEntrypointSha256: "c".repeat(64) },
        }),
      ).rejects.toMatchObject({ code: "identity-mismatch" });
      const admitted = await callHostControl(paths, "admit", {
        payload: {
          expectedVersion: buildIdentity.version,
          expectedEntrypointSha256: buildIdentity.entrypointSha256,
        },
      });
      expect(admitted.result.admission).toBe("open");
      const info = await starting;
      expect(info.httpBaseUrl).toContain("http://127.0.0.1:");
      await vi.waitFor(async () => {
        const reply = await callHostControl(paths, "status");
        expect(reply.result).toMatchObject({ state: "ready", admission: "open" });
      });
    } finally {
      await disposeQuietly(host);
    }
  });

  it("D4: a staged candidate that is never admitted exits at its deadline", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      host = await makeHost({ staging: true, stagingDeadlineMs: 50 });
      await expect(host.start()).rejects.toThrow(/admission/u);
    } finally {
      await disposeQuietly(host);
    }
  });

  it("C.1: standalone SSH environment() case over HTTP describe after pairing", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      host = await makeHost({
        agentPluginsDir: "/fixture/agent-plugins",
        computerUseHelperRoot: "/fixture/computer-use-helper",
      });
      const info = await host.start();
      const discovered = host.hostServices.sshConnectionManager!.discoverHosts();
      expect(Array.isArray(discovered)).toBe(true);

      const pairing = await requestPairingFromRunningServer(h.tmpBase);
      const credential = new URLSearchParams(new URL(pairing.pairingUrl).hash.slice(1)).get(
        "token",
      );
      expect(credential).toBeTruthy();
      const tokenResponse = await fetch(new URL("oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(info.httpBaseUrl).origin },
        body: JSON.stringify({
          grantType: "pairing-token",
          credential,
          scopes: ["session:read"],
          client: { label: "c1", deviceType: "desktop" },
        }),
      });
      expect(tokenResponse.status).toBe(200);
      const { accessToken } = (await tokenResponse.json()) as { accessToken: string };
      const describeResponse = await fetch(new URL("/api/host/describe", info.httpBaseUrl), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(describeResponse.status).toBe(200);
      const body = (await describeResponse.json()) as {
        capabilities?: { ssh?: boolean; computerUse?: boolean };
      };
      expect(body.capabilities).toMatchObject({ ssh: true, computerUse: true });
    } finally {
      await disposeQuietly(host);
    }
  });
});
