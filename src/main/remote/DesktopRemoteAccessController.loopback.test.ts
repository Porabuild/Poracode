import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import {
  managedLoopbackBootstrapSchema,
  type ManagedLoopbackBootstrap,
} from "@/shared/managedLoopback";
import type { RemoteAccessServerInfo, RemoteAccessServerOptions } from "./RemoteAccessServer";

/**
 * Managed always-on loopback guarantee (V5 plan 2.5 completion): the desktop
 * ALWAYS has its loopback RemoteAccessServer running from readiness — full
 * bind when remote access is enabled, loopback-only (reachable, never
 * advertised) otherwise — and the renderer's attach credential exists BEFORE
 * the renderer asks.
 */

const h = vi.hoisted(() => {
  class RemoteAccessServerFixture {
    static nextId = 0;
    readonly id = ++RemoteAccessServerFixture.nextId;
    readonly options: RemoteAccessServerOptions;
    private info: RemoteAccessServerInfo | null = null;
    started = false;
    disposed = false;
    mintedCredentials: string[] = [];
    issuePairingUrlCalls = 0;

    constructor(options: RemoteAccessServerOptions) {
      this.options = options;
      h.servers.push(this);
    }

    async start(): Promise<RemoteAccessServerInfo> {
      this.started = true;
      const port = 43123 + this.id;
      this.info = {
        httpBaseUrl: `http://127.0.0.1:${port}/`,
        localHttpBaseUrl: `http://127.0.0.1:${port}`,
        wsBaseUrl: `ws://127.0.0.1:${port}/ws`,
        pairingUrl: `http://127.0.0.1:${port}/pair#token=startup-${this.id}`,
        pairingExpiresAt: "2026-09-13T00:10:00.000Z",
      };
      return this.info;
    }

    async dispose() {
      this.disposed = true;
      this.info = null;
    }

    getInfo() {
      return this.info;
    }

    listAccessSessions() {
      return [];
    }

    publishSupervisorEvent() {}

    issuePairingUrl() {
      this.issuePairingUrlCalls += 1;
      return `http://127.0.0.1:43123/pair#token=rotated-${this.issuePairingUrlCalls}`;
    }

    mintLoopbackRendererCredential(): {
      endpoint: string;
      pairingUrl: string;
      expiresAt: string;
    } | null {
      if (!this.info) return null;
      const credential = `renderer-${this.id}-${this.mintedCredentials.length + 1}`;
      this.mintedCredentials.push(credential);
      return {
        endpoint: this.info.localHttpBaseUrl,
        pairingUrl: `${this.info.localHttpBaseUrl}/pair#token=${credential}`,
        expiresAt: "2026-09-13T00:10:00.000Z",
      };
    }
  }
  return {
    settings: {} as SharedSettings,
    servers: [] as Array<
      InstanceType<typeof RemoteAccessServerFixture> & { disposed: boolean; started: boolean }
    >,
    RemoteAccessServerFixture,
  };
});

vi.mock("./RemoteAccessServer", () => ({
  RemoteAccessServer: h.RemoteAccessServerFixture,
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
vi.mock("./config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./config")>()),
  remoteAccessAdvertisedHost: () => "127.0.0.1",
  remoteAccessHost: () => "127.0.0.1",
  remoteAccessPairingAppUrl: () => undefined,
  remoteForwardBaseUrl: () => undefined,
  resolveRemoteAccessPort: async () => 43123,
}));
vi.mock("./identity", () => ({
  readOrCreateRemoteAccessIdentity: () => ({ desktopId: "fixture-host", label: "Fixture" }),
}));
vi.mock("./auth", () => ({ createPersistentRemoteAuthStore: () => ({}) }));
vi.mock("./portForward/portForwarding", () => ({
  createPortForwarding: () => ({ gateway: {}, proxy: {}, dispose() {} }),
}));
vi.mock("./RemoteBrowserGateway", () => ({ RemoteBrowserGateway: class {} }));
vi.mock("./tailscale", () => ({
  buildTailscaleHttpsUrl: () => "https://fixture.test",
  disableTailscaleServe: async () => {},
  enableTailscaleServe: async () => ({ ok: true }),
  launchTailscaleApp: async () => ({ ok: true }),
  probeTailscaleStatus: async () => ({ state: "not-running" }),
}));

import {
  createDesktopRemoteAccessController,
  type DesktopRemoteAccessController,
} from "./DesktopRemoteAccessController";

const fixtures: Array<{ root: string; controller: DesktopRemoteAccessController }> = [];

beforeEach(() => {
  h.settings = { ...defaultSharedSettings };
  h.servers.length = 0;
  h.RemoteAccessServerFixture.nextId = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  for (const { root, controller } of fixtures.splice(0)) {
    await controller.dispose().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

async function fixture(): Promise<DesktopRemoteAccessController> {
  const root = mkdtempSync(join(tmpdir(), "poracode-desktop-loopback-"));
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
  return controller;
}

describe("managed always-on loopback server", () => {
  it("starts a loopback-bound server from readiness even with remote access disabled", async () => {
    // remoteAccessEnabled stays absent (the default desktop).
    const controller = await fixture();
    await controller.startIfEnabled();

    expect(h.servers).toHaveLength(1);
    const server = h.servers[0]!;
    expect(server.started).toBe(true);
    // Loopback bind is pinned for the always-on instance, whatever bind-mode
    // env would otherwise say.
    expect(server.options.host).toBe("127.0.0.1");
    // Reachable but not discoverable: the user-facing pairing surface reports
    // the disabled state and no QR credential is rotated or logged.
    expect(controller.getPairingInfo().status).toBe("disabled");
    expect(controller.isUserEnabled()).toBe(false);
    expect(server.issuePairingUrlCalls).toBe(0);
  });

  it("resolves the managed bootstrap behind readiness, with the credential minted before the renderer asks", async () => {
    const controller = await fixture();
    const bootstrapPromise = controller.getManagedLoopbackBootstrap();
    await controller.startIfEnabled();
    const bootstrap = await bootstrapPromise;

    expect(bootstrap).not.toBeNull();
    const parsed = managedLoopbackBootstrapSchema.parse(bootstrap);
    expect(parsed.endpoint.startsWith("http://127.0.0.1:")).toBe(true);
    expect(parsed.pairingUrl.startsWith(parsed.endpoint)).toBe(true);
    expect(parsed.pairingUrl).toContain("#token=renderer-1-1");
    // The renderer credential is minted per ask, without rotating the QR.
    const second = await controller.getManagedLoopbackBootstrap();
    expect((second as ManagedLoopbackBootstrap).pairingUrl).toContain("#token=renderer-1-2");
    expect(h.servers[0]!.issuePairingUrlCalls).toBe(0);
  });

  it("keeps reporting disabled while only the loopback instance runs, then upgrades on enable", async () => {
    const controller = await fixture();
    await controller.startIfEnabled();
    expect(controller.getPairingInfo().status).toBe("disabled");

    await controller.setEnabled(true);
    // The loopback-only instance was replaced by the full server.
    expect(h.servers.length).toBeGreaterThanOrEqual(2);
    expect(h.servers[0]!.disposed).toBe(true);
    expect(controller.getPairingInfo().status).toBe("ready");
    expect(controller.isUserEnabled()).toBe(true);

    // Disabling downgrades to the always-on loopback instance instead of
    // stopping (asynchronously, like the old stop): the unified leg keeps a
    // server to attach to.
    await controller.setEnabled(false);
    await vi.waitFor(() => {
      const running = h.servers.filter((server) => !server.disposed);
      expect(running).toHaveLength(1);
    });
    expect(controller.getPairingInfo().status).toBe("disabled");
    await expect(controller.getManagedLoopbackBootstrap()).resolves.not.toBeNull();
  });

  it("survives a failed always-on start without failing readiness", async () => {
    const controller = await fixture();
    vi.spyOn(h.RemoteAccessServerFixture.prototype, "start").mockRejectedValueOnce(
      Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" }),
    );
    await expect(controller.startIfEnabled()).resolves.toBeUndefined();
  });
});
