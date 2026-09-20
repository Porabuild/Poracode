import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type {
  RemoteAccessServerInfo,
  RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";
import type { SendPush } from "@/host/remote/push/pushGateway";
import {
  PushRegistrationStore,
  pushRegistrationsFilePath,
} from "@/host/remote/push/PushRegistrationStore";

const h = vi.hoisted(() => ({
  settings: {} as SharedSettings,
  sendPush: vi.fn<SendPush>(),
  servers: [] as Array<{ options: RemoteAccessServerOptions }>,
  serverDispose: vi.fn<() => Promise<void>>(),
}));

vi.mock("../db", () => ({
  dbGetProjects: () => [],
  dbGetThreads: () => [],
  dbGetProject: () => null,
  dbGetThread: () => null,
  dbUpdateProject: vi.fn<(project: unknown) => void>(),
}));
vi.mock("../sharedSettingsFile", () => ({
  readSharedSettingsFile: () => h.settings,
  patchSharedSettingsFile: (_path: string, patch: Partial<SharedSettings>) => {
    h.settings = { ...h.settings, ...patch };
    return h.settings;
  },
}));
vi.mock("@/host/remote/config", () => ({
  remoteAccessAdvertisedHost: () => "127.0.0.1",
  remoteAccessHost: () => "127.0.0.1",
  remoteAccessPairingAppUrl: () => undefined,
  remoteForwardBaseUrl: () => undefined,
  resolveRemoteAccessPort: async () => 43123,
}));
vi.mock("@/host/remote/identity", () => ({
  readOrCreateRemoteAccessIdentity: () => ({ desktopId: "fixture-host", label: "Fixture" }),
}));
vi.mock("@/host/remote/auth", () => ({ createPersistentRemoteAuthStore: () => ({}) }));
vi.mock("@/host/remote/portForward/portForwarding", () => ({
  createPortForwarding: () => ({ gateway: {}, proxy: {}, dispose() {} }),
}));
vi.mock("@/host/remote/RemoteBrowserGateway", () => ({ RemoteBrowserGateway: class {} }));
vi.mock("@/host/remote/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/host/remote/push")>()),
  createPushGateway: () => h.sendPush,
}));
vi.mock("@/host/remote/tailscale", () => ({
  buildTailscaleHttpsUrl: () => "https://fixture.test",
  disableTailscaleServe: async () => {},
  enableTailscaleServe: async () => ({ ok: true }),
  launchTailscaleApp: async () => ({ ok: true }),
  probeTailscaleStatus: async () => ({ state: "not-running" }),
}));
vi.mock("@/host/remote/RemoteAccessServer", () => ({
  RemoteAccessServer: class {
    private info: RemoteAccessServerInfo | null = null;
    constructor(readonly options: RemoteAccessServerOptions) {
      h.servers.push(this);
    }
    async start() {
      this.info = {
        httpBaseUrl: "http://127.0.0.1:43123/",
        localHttpBaseUrl: "http://127.0.0.1:43123",
        wsBaseUrl: "ws://127.0.0.1:43123/ws",
        pairingUrl: "http://127.0.0.1:43123/pair#token=synthetic",
        pairingExpiresAt: "2026-09-13T00:10:00.000Z",
      };
      return this.info;
    }
    async dispose() {
      await h.serverDispose();
      this.info = null;
    }
    getInfo() {
      return this.info;
    }
    listAccessSessions() {
      return [];
    }
    publishSupervisorEvent() {}
  },
}));

import {
  createDesktopRemoteAccessController,
  type DesktopRemoteAccessController,
} from "./DesktopRemoteAccessController";

const fixtures: Array<{ root: string; controller: DesktopRemoteAccessController }> = [];

beforeEach(() => {
  h.settings = { ...defaultSharedSettings, remotePushEnabled: true };
  h.servers.length = 0;
  h.sendPush.mockReset();
  h.serverDispose.mockReset().mockResolvedValue();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  for (const { root, controller } of fixtures.splice(0)) {
    await controller.dispose().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "poracode-desktop-push-drain-"));
  const controller = createDesktopRemoteAccessController({
    appVersion: "fixture",
    channel: "stable",
    paths: { baseDir: root, settingsPath: join(root, "settings.json") },
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(),
    truncateThreadRuntime: vi.fn<NonNullable<RemoteAccessServerOptions["truncateThreadRuntime"]>>(),
    dispatchThreadCommand: () => false,
    settingsWrites: {
      commitCompatPatch: async (patch) => {
        const merged = { ...h.settings } as Record<string, unknown>;
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) merged[key] = value;
        }
        h.settings = merged as SharedSettings;
        return h.settings;
      },
      editSettingsField: async (field, compute) => {
        const next = compute(h.settings);
        if (next === undefined) delete (h.settings as Record<string, unknown>)[field];
        else (h.settings as Record<string, unknown>)[field] = next;
        return {
          status: "committed",
          authorityId: "00000000-0000-4000-8000-000000000000",
          sequence: 0,
          changes: [],
          revisions: {},
        };
      },
    },
    notifyRemoteAccessPairingChanged() {},
    notifyProjectStateChanged() {},
    notifyEventInterestsChanged() {},
    reportError() {},
    scheduleService: {} as never,
    prWatchService: {} as never,
    gitStateService: {} as never,
    updates: {} as never,
  });
  fixtures.push({ root, controller });
  await controller.setEnabled(true);
  const registration = {
    deviceId: "fixture-device",
    platform: "android" as const,
    deviceToken: "synthetic-token",
  };
  h.servers[0]!.options.pushRegistrations!.upsert(registration);
  const delivery = Promise.withResolvers<Awaited<ReturnType<SendPush>>>();
  h.sendPush.mockImplementation(() => delivery.promise);
  controller.handleSupervisorEvent({
    type: "thread-state",
    threadId: "fixture-thread",
    status: "finished",
    attention: "none",
    canResumeWithConfig: false,
  });
  await vi.waitFor(() => expect(h.sendPush).toHaveBeenCalledOnce());
  return { root, controller, delivery, path: pushRegistrationsFilePath(root) };
}

it.each(["final-stop", "disabled-before-stop"])(
  "joins an actual held push and prevents late file writes after %s",
  async (mode) => {
    const value = await fixture();
    const before = readFileSync(value.path);
    if (mode === "disabled-before-stop") await value.controller.setEnabled(false);
    let settled = false;
    const stopping = value.controller.dispose().finally(() => {
      settled = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      value.delivery.resolve({ ok: false, status: 410, unregistered: true });
      await stopping;
      expect(readFileSync(value.path)).toEqual(before);
    } finally {
      value.delivery.resolve({ ok: true, status: 200, unregistered: false });
      await stopping;
    }
  },
);

it("retires the old push generation before a restarted server owns registrations", async () => {
  const value = await fixture();
  let settled = false;
  const restarting = value.controller.setAdvertisedUrl("https://fixture.test").finally(() => {
    settled = true;
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    value.delivery.resolve({ ok: false, status: 410, unregistered: true });
    await restarting;
    expect(h.servers).toHaveLength(2);
    expect(new PushRegistrationStore(value.root).get("fixture-device")?.deviceToken).toBe(
      "synthetic-token",
    );
  } finally {
    value.delivery.resolve({ ok: true, status: 200, unregistered: false });
    await restarting;
  }
});

it("joins held push work even when the HTTP stop has already failed", async () => {
  const value = await fixture();
  h.serverDispose.mockRejectedValueOnce(new Error("synthetic HTTP stop failure"));
  let settled = false;
  const stopping = value.controller.dispose().then(
    () => {
      settled = true;
      return undefined;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    value.delivery.resolve({ ok: false, status: 410, unregistered: true });
    expect(await stopping).toBeInstanceOf(Error);
  } finally {
    value.delivery.resolve({ ok: true, status: 200, unregistered: false });
    await stopping;
  }
});

it("keeps a disabled generation's HTTP work in the final shutdown barrier", async () => {
  const value = await fixture();
  value.delivery.resolve({ ok: true, status: 200, unregistered: false });
  const httpClosed = Promise.withResolvers<void>();
  h.serverDispose.mockImplementationOnce(() => httpClosed.promise);
  await value.controller.setEnabled(false);
  let settled = false;
  const stopping = value.controller.dispose().finally(() => {
    settled = true;
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
  } finally {
    httpClosed.resolve();
    await stopping;
  }
});

it("retains a failed disabled generation after its active promise has settled", async () => {
  const value = await fixture();
  value.delivery.resolve({ ok: true, status: 200, unregistered: false });
  h.serverDispose.mockRejectedValueOnce(new Error("synthetic retiring HTTP stop failure"));
  await value.controller.setEnabled(false);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await expect(value.controller.dispose()).rejects.toThrow("shut down cleanly");
});

it("waits for a disabled generation before a new enable opens its replacement", async () => {
  const value = await fixture();
  await value.controller.setEnabled(false);
  let settled = false;
  const enabling = value.controller.setEnabled(true).finally(() => {
    settled = true;
  });
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(h.servers).toHaveLength(1);
    value.delivery.resolve({ ok: false, status: 410, unregistered: true });
    await enabling;
    expect(h.servers).toHaveLength(2);
    expect(new PushRegistrationStore(value.root).get("fixture-device")?.deviceToken).toBe(
      "synthetic-token",
    );
  } finally {
    value.delivery.resolve({ ok: true, status: 200, unregistered: false });
    await enabling;
  }
});
