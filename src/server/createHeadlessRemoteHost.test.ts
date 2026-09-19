import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { rawRequestWithAuthority } from "@/main/remote/portForward/testFixtures";
import { RelayServer } from "./relay/relayServer";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type { SupervisorEvent } from "@/shared/ipc";
import { createHeadlessRemoteHost, resolveLocalProxyBase } from "./createHeadlessRemoteHost";
import { RemoteAccessServer } from "@/main/remote/RemoteAccessServer";
import { BackendDurableServices } from "@/backend/BackendDurableServices";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { requestPairingFromRunningServer } from "./pairingControl";
import { PushRegistrationStore, pushRegistrationsFilePath } from "@/main/remote/push";
import type { SendPush } from "@/main/remote/push/pushGateway";
import * as remoteConfig from "@/main/remote/config";

// Mutable state shared with the hoisted vi.mock factories.
const h = vi.hoisted(() => ({
  tmpBase: "",
  tmpRoot: "",
  capturedOnEvent: undefined as ((event: unknown) => void) | undefined,
  capturedOnReset: undefined as (() => void) | undefined,
  supervisorStart: vi.fn<() => void>(),
  supervisorDispose: vi.fn<() => Promise<void>>(),
  supervisorCall: vi.fn<() => Promise<unknown>>(async () => ({})),
  initDatabase: vi.fn<(dbPath: string) => void>(),
  closeDatabase: vi.fn<() => void>(),
  projects: [] as unknown[],
  threads: [] as unknown[],
  sharedSettings: {} as SharedSettings,
  sendPush: vi.fn<SendPush>(async () => ({ ok: true, status: 200, unregistered: false })),
}));

vi.mock("@/main/remote/push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/main/remote/push")>();
  return { ...actual, createPushGateway: () => h.sendPush };
});

// `../db` (used by RemoteAccessServer) and `@/main/db` resolve to the same
// file, so this mock covers both importers. The ownership lease still uses a
// real temporary SQLite file; only the application database and supervisor are mocked.
vi.mock("@/main/db", () => ({
  initDatabase: (dbPath: string) => h.initDatabase(dbPath),
  closeDatabase: () => h.closeDatabase(),
  dbGetProjects: vi.fn<() => unknown[]>(() => h.projects),
  dbGetProject: vi.fn<(projectId: string) => unknown>(
    (projectId) =>
      h.projects.find(
        (project) =>
          typeof project === "object" &&
          project !== null &&
          "id" in project &&
          project.id === projectId,
      ) ?? null,
  ),
  dbGetProjectNotes: vi.fn<() => string>(() => ""),
  dbUpdateProject: vi.fn<() => void>(),
  dbUpsertProject: vi.fn<() => void>(),
  dbDeleteProject: vi.fn<() => void>(),
  dbGetPrWatches: vi.fn<() => unknown[]>(() => []),
  dbGetPrWatch: vi.fn<() => unknown>(() => null),
  dbUpsertPrWatch: vi.fn<() => void>(),
  dbDeletePrWatch: vi.fn<() => void>(),
  dbGetThreads: vi.fn<() => unknown[]>(() => h.threads),
  dbGetThread: vi.fn<() => unknown>(() => null),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => unknown>(() => null),
  dbGetLatestThreadRuntimeAnchorItemId: vi.fn<() => null>(() => null),
  dbAppendThreadCompletedTurn: vi.fn<() => void>(),
  dbApplyThreadRuntimeEvents: vi.fn<() => void>(),
  dbClaimRemoteCommand: vi.fn<() => { state: "claimed" }>(() => ({ state: "claimed" })),
  dbCompleteRemoteCommand: vi.fn<() => void>(),
  dbFailRemoteCommand: vi.fn<() => void>(),
  dbReplaceThreadRuntimeSnapshot: vi.fn<() => void>(),
  dbUpsertThread: vi.fn<() => void>(),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(),
  dbAppendThreadTerminalOutput: vi.fn<() => void>(),
  dbClearThreadTerminalScrollback: vi.fn<() => void>(),
  dbGetThreadTerminalScrollback: vi.fn<() => null>(() => null),
  dbDeleteThread: vi.fn<() => void>(),
  dbGetSchedules: vi.fn<() => unknown[]>(() => []),
  dbGetSchedule: vi.fn<() => unknown>(() => null),
  dbUpsertSchedule: vi.fn<() => void>(),
  dbDeleteSchedule: vi.fn<() => void>(),
  dbInsertScheduleRun: vi.fn<() => void>(),
  dbUpdateScheduleRun: vi.fn<() => void>(),
  dbListScheduleRuns: vi.fn<() => unknown[]>(() => []),
  dbDeleteScheduleRuns: vi.fn<() => void>(),
  dbInterruptScheduleRuns: vi.fn<() => void>(),
}));

vi.mock("@/main/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = h.supervisorStart;
    dispose = h.supervisorDispose;
    call = h.supervisorCall;
    constructor(options: { onEvent: (event: unknown) => void; onReset: () => void }) {
      h.capturedOnEvent = options.onEvent;
      h.capturedOnReset = options.onReset;
    }
  },
}));

vi.mock("@/main/sharedSettingsFile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/main/sharedSettingsFile")>();
  return {
    readSharedSettingsFile: () => h.sharedSettings,
    patchSharedSettingsFile: () => ({}),
    writeSharedSettingsFile: (path: string, settings: SharedSettings) => {
      actual.writeSharedSettingsFile(path, settings);
      h.sharedSettings = settings;
    },
  };
});

function makeHost(overrides: Partial<Parameters<typeof createHeadlessRemoteHost>[0]> = {}) {
  return createHeadlessRemoteHost({
    appVersion: "9.9.9-test",
    baseDir: h.tmpBase,
    supervisorPath: "/dev/null/supervisor.cjs",
    wslHelpersDir: "/dev/null/wsl",
    environmentKey: Buffer.alloc(32, 7).toString("base64"),
    // Loopback + ephemeral port: no LAN probing, no port conflicts.
    host: "127.0.0.1",
    advertisedHost: "127.0.0.1",
    port: 0,
    ...overrides,
  });
}

describe("createHeadlessRemoteHost", () => {
  beforeEach(() => {
    h.tmpRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "lc-headless-")));
    h.tmpBase = join(h.tmpRoot, "profile");
    h.capturedOnEvent = undefined;
    h.capturedOnReset = undefined;
    h.supervisorStart.mockReset();
    h.supervisorDispose.mockReset();
    h.supervisorDispose.mockResolvedValue();
    h.initDatabase.mockReset();
    h.closeDatabase.mockReset();
    h.supervisorCall.mockReset();
    h.supervisorCall.mockResolvedValue({});
    h.sendPush.mockReset();
    h.sendPush.mockResolvedValue({ ok: true, status: 200, unregistered: false });
    h.projects = [];
    h.threads = [];
    h.sharedSettings = { ...defaultSharedSettings, mcpServers: [], disabledBuiltInMcpServers: {} };
  });

  afterEach(() => {
    rmSync(h.tmpRoot, { recursive: true, force: true });
  });

  it("rejects pre-cancelled construction before acquiring or preparing a root", async () => {
    const cancellation = new AbortController();
    cancellation.abort(new Error("Synthetic startup cancellation."));
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    let failure: unknown;
    try {
      try {
        host = await makeHost({ signal: cancellation.signal });
      } catch (error) {
        failure = error;
      }
      expect(failure).toEqual(cancellation.signal.reason);
      expect(h.initDatabase).not.toHaveBeenCalled();
      expect(existsSync(`${h.tmpBase}.host-owner.sqlite`)).toBe(false);
      expect(existsSync(`${h.tmpBase}.host-v1`)).toBe(false);
    } finally {
      await host?.dispose();
    }
  });

  it("joins cancelled port resolution before owner release without constructing SQLite", async () => {
    const cancellation = new AbortController();
    const entered = Promise.withResolvers<void>();
    const port = Promise.withResolvers<number>();
    const resolvePort = vi.spyOn(remoteConfig, "resolveRemoteAccessPort").mockImplementation(() => {
      entered.resolve();
      return port.promise;
    });
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    const creating = makeHost({ signal: cancellation.signal }).then(
      (value) => {
        host = value;
        return value;
      },
      (error: unknown) => error,
    );
    try {
      await entered.promise;
      cancellation.abort(new Error("Synthetic startup cancellation."));
      expect(() => HostOwnerController.acquire(h.tmpBase, "desktop")).toThrow(HostRootInUseError);
      expect(h.initDatabase).not.toHaveBeenCalled();
      port.resolve(0);
      const result = await creating;
      expect(result instanceof Error).toBe(true);
      expect((result as Error).message).toBe(cancellation.signal.reason.message);
      expect(h.initDatabase).not.toHaveBeenCalled();
      const successor = HostOwnerController.acquire(h.tmpBase, "desktop");
      await successor.close();
    } finally {
      port.resolve(0);
      await creating;
      await host?.dispose();
      resolvePort.mockRestore();
    }
  });

  it("joins admitted push delivery before closing SQLite or releasing its owner", async () => {
    const held = Promise.withResolvers<Awaited<ReturnType<SendPush>>>();
    h.sendPush.mockReturnValue(held.promise);
    h.sharedSettings = { ...h.sharedSettings, remotePushEnabled: true };
    const host = await makeHost();
    let closing: Promise<void> | undefined;
    let successor: HostOwnerController | undefined;
    try {
      const file = pushRegistrationsFilePath(host.dataRoot);
      new PushRegistrationStore(host.dataRoot).upsert({
        deviceId: "synthetic-first",
        platform: "android",
        deviceToken: "synthetic-first-token",
      });
      h.capturedOnEvent?.({
        type: "thread-state",
        threadId: "synthetic-thread",
        status: "finished",
        attention: "none",
        canResumeWithConfig: false,
      });
      expect(h.sendPush).toHaveBeenCalledOnce();
      closing = host.dispose();
      let closed = false;
      void closing.then(() => {
        closed = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
      expect(h.closeDatabase).not.toHaveBeenCalled();
      expect(() => HostOwnerController.acquire(h.tmpBase, "desktop")).toThrow(HostRootInUseError);
      const before = readFileSync(file, "utf8");
      held.resolve({ ok: false, status: 410, unregistered: true });
      await closing;
      expect(h.closeDatabase).toHaveBeenCalledOnce();
      expect(readFileSync(file, "utf8")).toBe(before);
      successor = HostOwnerController.acquire(h.tmpBase, "desktop");
      new PushRegistrationStore(host.dataRoot).upsert({
        deviceId: "synthetic-successor",
        platform: "android",
        deviceToken: "synthetic-successor-token",
      });
      const after = readFileSync(file, "utf8");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(readFileSync(file, "utf8")).toBe(after);
    } finally {
      held.resolve({ ok: true, status: 200, unregistered: false });
      await (closing ?? host.dispose());
      await successor?.close();
    }
  });

  it("refuses headless startup before root, key or database side effects when desktop owns the namespace", async () => {
    const desktop = HostOwnerController.acquire(h.tmpBase, "desktop");
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    let failure: unknown;
    try {
      try {
        host = await makeHost();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(HostRootInUseError);
      expect(h.initDatabase).not.toHaveBeenCalled();
      expect(existsSync(h.tmpBase)).toBe(false);
      expect(existsSync(desktop.lease.paths.dataRoot)).toBe(false);
    } finally {
      await host?.dispose();
      await desktop.close();
    }
  });

  it("refuses desktop acquisition when headless owns the namespace", async () => {
    const host = await makeHost();
    let desktop: HostOwnerController | undefined;
    let failure: unknown;
    try {
      try {
        desktop = HostOwnerController.acquire(h.tmpBase, "desktop");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(HostRootInUseError);
    } finally {
      await desktop?.close();
      await host.dispose();
    }
  });

  it("preserves a nonempty legacy namespace and refuses before database initialization", async () => {
    mkdirSync(h.tmpBase);
    const candidate = '{"syntheticLegacySetting":true}\n';
    writeFileSync(join(h.tmpBase, "settings.json"), candidate);
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    let failure: unknown;
    try {
      try {
        host = await makeHost();
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "HOST_IMPORT_REQUIRED" });
      expect(h.initDatabase).not.toHaveBeenCalled();
      expect(readFileSync(join(h.tmpBase, "settings.json"), "utf8")).toBe(candidate);
      expect(existsSync(`${h.tmpBase}.host-v1`)).toBe(false);
    } finally {
      await host?.dispose();
    }
  });

  it("retains ownership until the headless supervisor and database have joined disposal", async () => {
    const host = await makeHost();
    const stopped = Promise.withResolvers<void>();
    h.supervisorDispose.mockReturnValue(stopped.promise);
    const disposing = host.dispose();
    let desktop: HostOwnerController | undefined;
    let failure: unknown;
    try {
      await vi.waitFor(() => expect(h.supervisorDispose).toHaveBeenCalledOnce());
      try {
        desktop = HostOwnerController.acquire(h.tmpBase, "desktop");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(HostRootInUseError);
      expect(h.closeDatabase).not.toHaveBeenCalled();
    } finally {
      await desktop?.close();
      stopped.resolve();
      await disposing;
    }
    desktop = HostOwnerController.acquire(h.tmpBase, "desktop");
    expect(h.closeDatabase).toHaveBeenCalledOnce();
    await desktop.close();
  });

  it("refuses a second root before replacing process-wide database or credential state", async () => {
    const first = await makeHost();
    const secondNamespace = join(h.tmpRoot, "other");
    let second: Awaited<ReturnType<typeof makeHost>> | undefined;
    let failure: unknown;
    try {
      try {
        second = await makeHost({ baseDir: secondNamespace });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(h.initDatabase).toHaveBeenCalledOnce();
      expect(existsSync(secondNamespace)).toBe(false);
      expect(existsSync(`${secondNamespace}.host-v1`)).toBe(false);
    } finally {
      await second?.dispose();
      await first.dispose();
    }
    second = await makeHost({ baseDir: secondNamespace });
    await second.dispose();
  });

  it("closes partial construction before releasing the namespace after invalid forward configuration", async () => {
    vi.stubEnv("PORACODE_REMOTE_FORWARD_BASE_URL", "http://invalid-forward.test");
    try {
      await expect(makeHost()).rejects.toThrow(/https/i);
      expect(h.initDatabase).toHaveBeenCalledOnce();
      expect(h.supervisorDispose).toHaveBeenCalledOnce();
      expect(h.closeDatabase).toHaveBeenCalledOnce();
      const successor = HostOwnerController.acquire(h.tmpBase, "desktop");
      await successor.close();
      expect(existsSync(h.tmpBase)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("joins a held startup before releasing the owner and never starts HTTP after stop", async () => {
    const host = await makeHost();
    const ingress = Promise.withResolvers<void>();
    const startIngress = vi
      .spyOn(BackendDurableServices.prototype, "startIngress")
      .mockReturnValue(ingress.promise);
    const startHttp = vi.spyOn(RemoteAccessServer.prototype, "start");
    const starting = host.start();
    const startOutcome = starting.catch((error: unknown) => error);
    const closing = host.dispose();
    let closed = false;
    void closing.then(() => {
      closed = true;
    });
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(closed).toBe(false);
      expect(h.closeDatabase).not.toHaveBeenCalled();
      expect(() => HostOwnerController.acquire(h.tmpBase, "desktop")).toThrow(HostRootInUseError);
      ingress.resolve();
      expect(await startOutcome).toBeInstanceOf(Error);
      await closing;
      expect(startHttp).not.toHaveBeenCalled();
      expect(h.closeDatabase).toHaveBeenCalledOnce();
    } finally {
      ingress.resolve();
      await startOutcome;
      await closing;
      startIngress.mockRestore();
      startHttp.mockRestore();
    }
  });

  it.each(["success", "failure"])(
    "stops durable admission and joins supervisor work while HTTP shutdown is held (%s)",
    async (outcome) => {
      const host = await makeHost();
      await host.start();
      const http = Promise.withResolvers<void>();
      const entered = Promise.withResolvers<void>();
      const supervisor = Promise.withResolvers<void>();
      h.supervisorDispose.mockReturnValue(supervisor.promise);
      const originalDispose = RemoteAccessServer.prototype.dispose;
      const stopHttp = vi
        .spyOn(RemoteAccessServer.prototype, "dispose")
        .mockImplementation(async function (this: RemoteAccessServer) {
          entered.resolve();
          await http.promise;
          // Close the real fixture listener even when injecting a shutdown failure.
          await originalDispose.call(this);
          if (outcome === "failure") throw new Error("synthetic HTTP shutdown failure");
        });
      const stopDurable = vi.spyOn(BackendDurableServices.prototype, "dispose");
      let settled = false;
      const closing = host.dispose();
      void closing.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      try {
        await entered.promise;
        await expect.soft(host.start()).rejects.toThrow("shutting down");
        expect.soft(stopDurable).toHaveBeenCalledOnce();
        expect.soft(h.supervisorDispose).toHaveBeenCalledOnce();
        expect(h.closeDatabase).not.toHaveBeenCalled();
        http.resolve();
        // Give a rejected HTTP stop the opportunity to incorrectly break the join.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect.soft(settled).toBe(false);
        expect(h.closeDatabase).not.toHaveBeenCalled();
        supervisor.resolve();
        const result = await closing.then(
          () => ({ ok: true, aggregateError: false }),
          (error: unknown) => ({ ok: false, aggregateError: error instanceof AggregateError }),
        );
        expect(result).toEqual({
          ok: outcome === "success",
          aggregateError: outcome === "failure",
        });
        expect(h.closeDatabase).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
        let successor: HostOwnerController | undefined;
        let ownerState = "owned";
        try {
          successor = HostOwnerController.acquire(h.tmpBase, "desktop");
        } catch {
          ownerState = "refused";
        } finally {
          await successor?.close();
        }
        expect(ownerState).toBe(outcome === "success" ? "owned" : "refused");
      } finally {
        http.resolve();
        supervisor.resolve();
        await closing.catch(() => undefined);
        stopHttp.mockRestore();
        stopDurable.mockRestore();
        // A reported failure retained SQLite; retry fixture cleanup with the real
        // HTTP disposer after inspecting the failed-join state.
        await host.dispose();
      }
    },
  );

  it("persists routing and confirms it before any external event observer in a headless host", async () => {
    const observed = vi.fn<(event: SupervisorEvent) => void>();
    const host = await makeHost({ onSupervisorEvent: observed });
    const override = { tags: ["review"], agentKind: "fixture-agent", updatedAt: 1 };
    try {
      h.capturedOnEvent?.({
        type: "crossagent-routing-override-changed",
        requestId: "fixture-set",
        change: { action: "set", override },
      });
      // The routing edit commits on the settings authority's queue; both the
      // persisted document and the confirmation follow that settlement.
      await vi.waitFor(() => {
        expect(
          JSON.parse(readFileSync(join(host.dataRoot, "settings.json"), "utf8"))
            .crossagentRoutingOverrides,
        ).toEqual([override]);
        expect(h.supervisorCall).toHaveBeenCalledExactlyOnceWith(
          "confirmCrossagentRoutingOverride",
          { requestId: "fixture-set", ok: true },
        );
      });
      expect(observed).not.toHaveBeenCalled();
    } finally {
      await host.dispose();
    }
  });

  const specificAddress = Object.values(networkInterfaces())
    .flat()
    .find((address) => address?.family === "IPv4" && !address.internal)?.address;
  it.each(["127.0.0.1", ...(specificAddress ? [specificAddress] : [])])(
    "serves a relay-only browser forward through production composition bound to %s",
    async (bindHost) => {
      vi.stubEnv("PORACODE_REMOTE_FORWARD_BASE_URL", undefined);
      const relay = new RelayServer({
        host: "127.0.0.1",
        port: 0,
        forwardBaseUrl: "https://apps.relay.test",
        publicBaseUrl: "https://api.relay.test",
      });
      const upstream = createServer((_req, res) => res.end("relay-only upstream"));
      const registered = Promise.withResolvers<string>();
      let host: Awaited<ReturnType<typeof makeHost>> | undefined;
      let relayStopped = false;
      try {
        const relayInfo = await relay.start();
        await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
        host = await makeHost({
          host: bindHost,
          advertisedHost: bindHost,
          relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
          relaySecret: "fixture-relay-secret",
          onRelayRegistered: registered.resolve,
          // Gate 6: the ephemeral fixture upstream must be on the host's
          // forwardable-port allowlist for the forward to start.
          forwardablePorts: [(upstream.address() as AddressInfo).port],
        });
        const info = await host.start();
        const advertisedUrl = new URL(await registered.promise);
        const relayOrigin = advertisedUrl.origin;
        const publicUrl = `http://127.0.0.1:${relayInfo.port}${advertisedUrl.pathname}`;
        expect(host.server.forwardOriginAvailability().available).toBe(false);
        const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
        const tokenResponse = await fetch(new URL("oauth/token", publicUrl), {
          method: "POST",
          headers: { "content-type": "application/json", origin: relayOrigin },
          body: JSON.stringify({
            grantType: "pairing-token",
            credential,
            scopes: ["ports:forward"],
          }),
        });
        expect(tokenResponse.status).toBe(200);
        const { accessToken } = (await tokenResponse.json()) as { accessToken: string };
        const created = await fetch(new URL("api/ports/forward", publicUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
            origin: relayOrigin,
          },
          body: JSON.stringify({ targetPort: (upstream.address() as AddressInfo).port }),
        });
        expect(created.status).toBe(200);
        const { enterPath } = (await created.json()) as { enterPath: string };
        const entered = await fetch(new URL(enterPath.slice(1), publicUrl), { redirect: "manual" });
        expect(entered.status).toBe(302);
        const child = new URL(entered.headers.get("location")!);
        expect(child.hostname.endsWith(".apps.relay.test")).toBe(true);
        const exchanged = await rawRequestWithAuthority({
          port: relayInfo.port,
          authority: child.host,
          path: child.pathname + child.search,
        });
        expect(exchanged.status).toBe(302);
        const cookie = exchanged.headers["set-cookie"]?.[0]?.split(";")[0];
        expect(cookie).toMatch(/^__Host-poracode-forward=/);
        const response = await rawRequestWithAuthority({
          port: relayInfo.port,
          authority: child.host,
          path: "/",
          headers: { cookie: cookie! },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("relay-only upstream");
        const environmentUrl = new URL("/.well-known/poracode/environment", info.httpBaseUrl);
        expect(
          (await fetch(environmentUrl, { headers: { origin: "https://foreign.example.test" } }))
            .status,
        ).toBe(403);
        await relay.dispose();
        relayStopped = true;
        await vi.waitFor(async () => {
          expect((await fetch(environmentUrl, { headers: { origin: relayOrigin } })).status).toBe(
            403,
          );
        });
        expect((await fetch(environmentUrl)).status).toBe(200);
      } finally {
        await host?.dispose();
        if (!relayStopped) await relay.dispose();
        upstream.closeAllConnections();
        await new Promise<void>((resolve) => upstream.close(() => resolve()));
        vi.unstubAllEnvs();
      }
    },
  );

  it("opens the database and starts serving without forking the supervisor", async () => {
    const host = await makeHost();
    const info = await host.start();

    expect(h.initDatabase).toHaveBeenCalledWith(join(host.dataRoot, "state.sqlite"));
    expect(h.supervisorStart).not.toHaveBeenCalled();
    expect(info.httpBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(info.wsBaseUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/$/);
    // The startup pairing link is minted against the advertised loopback host.
    expect(info.pairingUrl).toContain("token=");
    const descriptor = await fetch(
      new URL("/.well-known/poracode/environment", info.httpBaseUrl),
    ).then((response) => response.json());
    expect(descriptor).toMatchObject({
      protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      hostMode: "helper",
      appVersion: "9.9.9-test",
    });

    await host.dispose();
  });

  it("does not fork the supervisor across repeated start() calls", async () => {
    const host = await makeHost();
    await host.start();
    await host.start();
    expect(h.supervisorStart).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("exchanges two concurrent owner-control credentials without revoking either client", async () => {
    const host = await makeHost();
    try {
      const info = await host.start();
      const firstRequestId = randomUUID();
      const pairings = await Promise.all([
        requestPairingFromRunningServer(h.tmpBase, { requestId: firstRequestId }),
        requestPairingFromRunningServer(h.tmpBase),
      ]);
      expect(pairings[0]!.pairingUrl).not.toBe(pairings[1]!.pairingUrl);
      expect(host.server.getInfo()?.pairingUrl).toBe(info.pairingUrl);
      await expect(
        requestPairingFromRunningServer(h.tmpBase, { requestId: firstRequestId }),
      ).resolves.toEqual(pairings[0]);
      for (const pairing of pairings) {
        expect(Object.keys(pairing).sort()).toEqual(["pairingUrl", "requestId"]);
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
            scopes: ["ports:forward"],
          }),
        });
        expect(tokenResponse.status).toBe(200);
        const { accessToken } = (await tokenResponse.json()) as { accessToken: string };
        expect(accessToken).toBeTruthy();
      }
      const firstCredential = new URLSearchParams(
        new URL(pairings[0]!.pairingUrl).hash.slice(1),
      ).get("token");
      const replay = await fetch(new URL("oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(info.httpBaseUrl).origin },
        body: JSON.stringify({ grantType: "pairing-token", credential: firstCredential }),
      });
      expect(replay.status).toBe(401);
      expect(h.supervisorStart).not.toHaveBeenCalled();
    } finally {
      await host.dispose();
    }
    await expect(requestPairingFromRunningServer(h.tmpBase)).rejects.toThrow("unavailable");
  });

  it("does not warm Git state through the supervisor for existing idle threads", async () => {
    h.threads = [
      {
        id: "thread-1",
        projectId: "project-1",
        worktreePath: null,
        status: "idle",
        archived: false,
        updatedAt: "2026-08-10T00:00:00.000Z",
      },
    ];
    const host = await makeHost();

    await host.start();

    expect(h.supervisorCall).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("routes supervisor events to the server event stream", async () => {
    const host = await makeHost();
    await host.start();
    const publish = vi.spyOn(host.server, "publishSupervisorEvent");

    expect(h.capturedOnEvent).toBeTypeOf("function");
    h.capturedOnEvent?.({ type: "thread-status" });

    expect(publish).toHaveBeenCalledWith({ type: "thread-status" });
    await host.dispose();
  });

  it("broadcasts follow-up queue clears when the supervisor resets", async () => {
    const host = await makeHost();
    await host.start();
    h.threads = [{ id: "thread-1" }, { id: "thread-2" }];
    const publish = vi.spyOn(host.server, "publishSupervisorEvent");

    h.capturedOnReset?.();

    expect(publish).toHaveBeenCalledWith({
      type: "thread-follow-up-queue",
      threadId: "thread-1",
      queue: null,
    });
    expect(publish).toHaveBeenCalledWith({
      type: "thread-follow-up-queue",
      threadId: "thread-2",
      queue: null,
    });
    await host.dispose();
  });

  it("resolves MCP launch settings from the headless settings file and project row", async () => {
    const globalServer: SharedSettings["mcpServers"][number] = {
      id: "global-memory",
      name: "memory",
      description: "global",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "global-memory", args: [], env: {} },
    };
    const projectServer = {
      ...globalServer,
      id: "project-memory",
      name: "MEMORY",
      description: "project override",
      transport: { ...globalServer.transport, command: "project-memory" },
    };
    h.projects = [
      {
        id: "project-1",
        name: "Project",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-01-01T00:00:00.000Z",
        mcpServers: [projectServer],
      },
    ];
    h.sharedSettings = {
      ...defaultSharedSettings,
      mcpServers: [globalServer],
      disabledBuiltInMcpServers: { chrome: true },
    };

    const host = await makeHost();
    const resolver = (
      host.server as unknown as {
        options: {
          resolveMcpLaunchSnapshot?: (projectId: string) => unknown;
        };
      }
    ).options.resolveMcpLaunchSnapshot;

    expect(resolver?.("project-1")).toEqual({
      mcpServers: [projectServer],
      disabledBuiltInMcpServerIds: ["chrome"],
      disabledBuiltInMcpTools: {},
    });
    await host.dispose();
  });

  it("persists remote attachment uploads without Electron", async () => {
    const host = await makeHost();
    const save = (
      host.server as unknown as {
        options: {
          attachments?: {
            save(input: { threadId: string; fileName: string; data: Uint8Array }): string;
          };
        };
      }
    ).options.attachments?.save;

    const path = save?.({
      threadId: "thread-1",
      fileName: "notes.md",
      data: new TextEncoder().encode("helper upload"),
    });

    expect(path).toBe(join(host.dataRoot, "attachments", "thread-1", "notes.md"));
    expect(readFileSync(path!, "utf8")).toBe("helper upload");
    await host.dispose();
  });

  it("tears down the supervisor and database on dispose", async () => {
    const host = await makeHost();
    await host.start();
    await host.dispose();

    expect(h.supervisorDispose).toHaveBeenCalledTimes(1);
    expect(h.closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("does not resolve headless disposal or close SQLite before the supervisor joins", async () => {
    let finishSupervisor!: () => void;
    h.supervisorDispose.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSupervisor = resolve;
      }),
    );
    const host = await makeHost();
    await host.start();
    let disposed = false;
    const disposal = host.dispose().then(() => {
      disposed = true;
    });
    await vi.waitFor(() => expect(h.supervisorDispose).toHaveBeenCalledOnce());
    expect(disposed).toBe(false);
    expect(h.closeDatabase).not.toHaveBeenCalled();
    finishSupervisor();
    await disposal;
    expect(h.closeDatabase).toHaveBeenCalledOnce();
  });
});

describe("resolveLocalProxyBase", () => {
  it("uses 127.0.0.1 for wildcard bind hosts (server also listens on loopback)", () => {
    for (const wildcard of ["0.0.0.0", "::", "::0", "", "   ", undefined]) {
      expect(resolveLocalProxyBase(wildcard, "http://0.0.0.0:38987/")).toBe(
        "http://127.0.0.1:38987",
      );
    }
  });

  it("uses the specific IPv4 bind host so relay proxy reaches the actual listener", () => {
    // A Tailscale/VPN IP: the server does NOT listen on 127.0.0.1 here.
    expect(resolveLocalProxyBase("100.64.1.2", "http://100.64.1.2:38987/")).toBe(
      "http://100.64.1.2:38987",
    );
  });

  it("brackets IPv6 literal bind hosts", () => {
    expect(resolveLocalProxyBase("fd7a:115c:a1e0::1", "http://[fd7a:115c:a1e0::1]:38987/")).toBe(
      "http://[fd7a:115c:a1e0::1]:38987",
    );
    // Already-bracketed literals are left as-is.
    expect(resolveLocalProxyBase("[fd7a:115c:a1e0::1]", "http://[fd7a:115c:a1e0::1]:38987/")).toBe(
      "http://[fd7a:115c:a1e0::1]:38987",
    );
  });

  it("passes hostnames through unchanged", () => {
    expect(resolveLocalProxyBase("my-server.local", "http://my-server.local:38987/")).toBe(
      "http://my-server.local:38987",
    );
  });

  it("always takes the port from the actually-listening httpBaseUrl", () => {
    // Ephemeral-port bind (port 0 requested) resolves to a real port at listen.
    expect(resolveLocalProxyBase("0.0.0.0", "http://0.0.0.0:54321/")).toBe(
      "http://127.0.0.1:54321",
    );
  });
});
