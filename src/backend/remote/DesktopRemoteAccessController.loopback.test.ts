import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import {
  managedLoopbackBootstrapSchema,
  type ManagedLoopbackBootstrap,
} from "@/shared/managedLoopback";
import type { ImagePreviewEntry, ImagePreviewGenerator } from "@/host/remote/server/imagePreview";
import type {
  RemoteAccessServerInfo,
  RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";

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
    publishedOrigins: string[] = [];

    constructor(options: RemoteAccessServerOptions) {
      this.options = options;
      h.servers.push(this);
    }

    async start(): Promise<RemoteAccessServerInfo> {
      this.started = true;
      const port = 43123 + this.id;
      const localHttpBaseUrl = `http://127.0.0.1:${port}`;
      const httpBaseUrl = this.options.advertisedBaseUrl
        ? `${new URL(this.options.advertisedBaseUrl).origin}/`
        : `${localHttpBaseUrl}/`;
      this.info = {
        httpBaseUrl,
        localHttpBaseUrl,
        wsBaseUrl: `${httpBaseUrl.replace(/^http/u, "ws")}ws`,
        pairingUrl: `${httpBaseUrl}#token=startup-${this.id}`,
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

    publishAdvertisedEndpoint(input: { advertisedBaseUrl: string; tailscaleHttpBaseUrl?: string }) {
      if (!this.info) throw new Error("Fixture server is not ready.");
      const advertised = new URL(input.advertisedBaseUrl);
      const httpBaseUrl = `${advertised.origin}/`;
      this.publishedOrigins.push(advertised.origin);
      const pairing = new URL(this.info.pairingUrl);
      const token = new URLSearchParams(pairing.hash.slice(1)).get("token");
      if (!token) throw new Error("Fixture pairing token is missing.");
      this.info = {
        ...this.info,
        httpBaseUrl,
        wsBaseUrl: `${advertised.protocol === "https:" ? "wss:" : "ws:"}//${advertised.host}/ws`,
        pairingUrl: `${httpBaseUrl}#token=${token}`,
        ...(input.tailscaleHttpBaseUrl
          ? { tailscaleHttpBaseUrl: new URL(input.tailscaleHttpBaseUrl).origin }
          : {}),
      };
      this.options.onPairingChanged?.();
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

    tlsFingerprint(): string | null {
      return "ab".repeat(32);
    }
  }
  return {
    settings: {} as SharedSettings,
    tailscaleStatus: undefined as
      | { readonly state: "running"; readonly dnsName: string; readonly httpsAvailable: boolean }
      | undefined,
    tailscaleServePromise: undefined as Promise<{ readonly ok: true }> | undefined,
    tailscaleServeCalls: 0,
    tailscaleProbeCalls: 0,
    previewStorePromise: undefined as Promise<void> | undefined,
    pairingUpdates: [] as unknown[],
    tailscaleServeDisabled: 0,
    portForwardingBinds: [] as Array<{ bindHost: string; remoteAccessPort: number }>,
    servers: [] as Array<
      InstanceType<typeof RemoteAccessServerFixture> & { disposed: boolean; started: boolean }
    >,
    RemoteAccessServerFixture,
  };
});

vi.mock("@/host/remote/RemoteAccessServer", () => ({
  RemoteAccessServer: h.RemoteAccessServerFixture,
}));

vi.mock("@/host/db", () => ({
  dbGetProjects: () => [],
  dbGetThreads: () => [],
  dbGetProject: () => null,
  dbGetThread: () => null,
  dbUpdateProject: vi.fn<(project: unknown) => void>(),
  dbUpsertProject: vi.fn<(project: unknown, index: number) => void>(),
}));
vi.mock("@/host/sharedSettingsFile", () => ({
  readSharedSettingsFile: () => h.settings,
  patchSharedSettingsFile: (_path: string, patch: Partial<SharedSettings>) => {
    h.settings = { ...h.settings, ...patch };
    return h.settings;
  },
}));
vi.mock("@/host/remote/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/host/remote/config")>()),
  remoteAccessAdvertisedHost: () => "127.0.0.1",
  remoteAccessPairingAppUrl: () => undefined,
  remoteForwardBaseUrl: () => undefined,
  resolveRemoteAccessPort: async () => 43123,
}));
vi.mock("@/host/remote/identity", () => ({
  readOrCreateRemoteAccessIdentity: () => ({ desktopId: "fixture-host", label: "Fixture" }),
}));
vi.mock("@/host/remote/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/host/remote/auth")>()),
  createPersistentRemoteAuthStore: () => ({}),
}));
vi.mock("@/host/remote/portForward/portForwarding", () => ({
  createPortForwarding: (options: { bindHost: string; remoteAccessPort: number }) => {
    h.portForwardingBinds.push({
      bindHost: options.bindHost,
      remoteAccessPort: options.remoteAccessPort,
    });
    return { gateway: {}, proxy: {}, dispose() {} };
  },
}));
vi.mock("@/host/remote/RemoteBrowserGateway", () => ({ RemoteBrowserGateway: class {} }));
vi.mock("@/host/remote/tailscale", () => ({
  buildTailscaleHttpsUrl: () => "https://fixture.test",
  disableTailscaleServe: async () => {
    h.tailscaleServeDisabled += 1;
  },
  enableTailscaleServe: async () => {
    h.tailscaleServeCalls += 1;
    return (await h.tailscaleServePromise) ?? { ok: true };
  },
  launchTailscaleApp: async () => ({ ok: true }),
  probeTailscaleStatus: async () => {
    h.tailscaleProbeCalls += 1;
    return h.tailscaleStatus ?? ({ state: "not-running" } as const);
  },
}));
vi.mock("@/host/remote/server/imagePreview", () => ({
  IMAGE_PREVIEW_MAX_ENTRIES: 512,
  IMAGE_PREVIEW_MAX_BYTES: 1024 * 1024,
  IMAGE_PREVIEW_MAX_ENTRY_BYTES: 4096,
  setImagePreviewGenerator:
    vi.fn<
      (
        generator: ImagePreviewGenerator | null,
        onGenerated?: (entry: ImagePreviewEntry) => void,
      ) => void
    >(),
  setImagePreviewStoreDir: async () => await h.previewStorePromise,
}));

import {
  createDesktopRemoteAccessController,
  type DesktopRemoteAccessController,
} from "./DesktopRemoteAccessController";
import { ProjectWatchLeases } from "@/host/gitState";

const fixtures: Array<{ root: string; controller: DesktopRemoteAccessController }> = [];

beforeEach(() => {
  vi.stubEnv("PORACODE_REMOTE_ACCESS_HOST", undefined);
  vi.stubEnv("PORACODE_REMOTE_BIND_MODE", undefined);
  h.settings = { ...defaultSharedSettings };
  h.tailscaleStatus = undefined;
  h.tailscaleServePromise = undefined;
  h.tailscaleServeCalls = 0;
  h.tailscaleProbeCalls = 0;
  h.previewStorePromise = undefined;
  h.pairingUpdates.length = 0;
  h.tailscaleServeDisabled = 0;
  h.portForwardingBinds.length = 0;
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
  vi.unstubAllEnvs();
});

async function fixture(
  overrides: {
    readonly projectWatchLeases?: ProjectWatchLeases;
    readonly runThreadMutation?: RemoteAccessServerOptions["runThreadMutation"];
  } = {},
): Promise<DesktopRemoteAccessController> {
  const root = mkdtempSync(join(tmpdir(), "poracode-desktop-loopback-"));
  const controller = createDesktopRemoteAccessController({
    ...overrides,
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
      editSettingsFields: async (fields, compute) => {
        const next = compute(h.settings);
        const settings = { ...h.settings } as Record<string, unknown>;
        for (const field of fields) {
          if (next[field] === undefined) delete settings[field];
          else settings[field] = next[field];
        }
        h.settings = settings as SharedSettings;
        return {
          status: "committed",
          authorityId: "00000000-0000-4000-8000-000000000000",
          sequence: 0,
          changes: [],
          revisions: {},
        };
      },
    },
    notifyRemoteAccessPairingChanged(info) {
      h.pairingUpdates.push(info);
    },
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
  it("listens on the LAN once remote access is enabled, ignoring the retired LAN preference", async () => {
    h.settings.remoteAccessEnabled = true;
    // A settings file written before the toggle was removed still stores false.
    h.settings.remoteAccessLanEnabled = false;
    const controller = await fixture();
    await controller.startIfEnabled();
    expect(h.servers.at(-1)?.options).toMatchObject({
      host: "0.0.0.0",
      plaintextLanAcknowledged: true,
    });
  });

  it("hands every rebuilt server the same durable watch and thread mutation services", async () => {
    const projectWatchLeases = new ProjectWatchLeases({
      call: async () => undefined,
      getProject: () => undefined,
    });
    const runThreadMutation: NonNullable<RemoteAccessServerOptions["runThreadMutation"]> = async (
      _id,
      operation,
    ) => operation();
    const controller = await fixture({ projectWatchLeases, runThreadMutation });
    await controller.startIfEnabled();
    await controller.setEnabled(true);
    await controller.setEnabled(false);
    await vi.waitFor(() => {
      expect(h.servers.length).toBeGreaterThanOrEqual(3);
    });
    for (const server of h.servers) {
      expect(server.options.projectWatches).toBe(projectWatchLeases);
      expect(server.options.runThreadMutation).toBe(runThreadMutation);
    }
  });

  it("returns to loopback when remote access is disabled", async () => {
    h.settings.remoteAccessEnabled = true;
    const controller = await fixture();
    await controller.startIfEnabled();
    expect(h.servers.at(-1)?.options.host).toBe("0.0.0.0");
    await controller.setEnabled(false);
    await vi.waitFor(() => {
      expect(h.servers.filter((server) => !server.disposed)).toHaveLength(1);
    });
    const running = h.servers.filter((server) => !server.disposed);
    expect(running[0]?.options.host).toBe("127.0.0.1");
    expect(running[0]?.options.plaintextLanAcknowledged).toBeUndefined();
  });

  it("rebuilds port forwarding for the new bind when remote access is toggled", async () => {
    const controller = await fixture();
    await controller.startIfEnabled();
    await controller.setEnabled(true);
    await controller.setEnabled(false);
    await vi.waitFor(() => {
      expect(h.portForwardingBinds.map((bind) => bind.bindHost)).toEqual([
        "127.0.0.1",
        "0.0.0.0",
        "127.0.0.1",
      ]);
    });
  });

  it("keeps a saved LAN preference off the disabled desktop's listener", async () => {
    h.settings.remoteAccessLanEnabled = true;
    const controller = await fixture();
    await controller.startIfEnabled();
    expect(h.servers).toHaveLength(1);
    expect(h.servers[0]?.options.host).toBe("127.0.0.1");
    expect(controller.getPairingInfo()).toEqual({ status: "disabled" });
  });

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

  it("publishes the local listener and managed bootstrap before Tailscale and preview warming finish", async () => {
    h.settings.remoteAccessEnabled = true;
    h.settings.remoteAccessTailscaleHttps = true;
    h.tailscaleStatus = {
      state: "running",
      dnsName: "fixture.tailnet.ts.net",
      httpsAvailable: true,
    };
    let finishServe!: (result: { readonly ok: true }) => void;
    h.tailscaleServePromise = new Promise((resolve) => {
      finishServe = resolve;
    });
    let finishPreviewStore!: () => void;
    h.previewStorePromise = new Promise((resolve) => {
      finishPreviewStore = resolve;
    });
    const controller = await fixture();

    await controller.startIfEnabled();
    const server = h.servers[0]!;
    expect(server.started).toBe(true);
    expect(server.options.advertisedBaseUrl).toBeUndefined();
    expect(server.options.isAdvertisedEndpointPending?.()).toBe(true);
    const bootstrap = await controller.getManagedLoopbackBootstrap();
    expect(bootstrap?.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:/u);
    const beforePromotion = controller.getPairingInfo();
    if (beforePromotion.status !== "ready") throw new Error("Remote listener is not ready.");
    const beforePairing = new URL(beforePromotion.pairingUrl);
    const beforeToken = new URLSearchParams(beforePairing.hash.slice(1)).get("token");

    finishServe({ ok: true });
    await vi.waitFor(() => {
      const info = controller.getPairingInfo();
      if (info.status !== "ready") throw new Error("Published listener is not ready.");
      expect(info.tailscaleHttpBaseUrl).toBe("https://fixture.test");
    });
    const afterPromotion = controller.getPairingInfo();
    if (afterPromotion.status !== "ready") throw new Error("Published listener is not ready.");
    expect(server.publishedOrigins).toEqual(["https://fixture.test"]);
    expect(new URL(afterPromotion.wsBaseUrl).protocol).toBe("wss:");
    expect(new URLSearchParams(new URL(afterPromotion.pairingUrl).hash.slice(1)).get("token")).toBe(
      beforeToken,
    );
    expect(afterPromotion.pairingExpiresAt).toBe(beforePromotion.pairingExpiresAt);
    expect(h.pairingUpdates.at(-1)).toMatchObject({
      status: "ready",
      tailscaleHttpBaseUrl: "https://fixture.test",
    });
    expect(server.options.isAdvertisedEndpointPending?.()).toBe(false);

    finishPreviewStore();
  });

  it("keeps the Tailscale settings operation pending until the promoted URL is published", async () => {
    h.settings.remoteAccessEnabled = true;
    const controller = await fixture();
    await controller.startIfEnabled();
    h.tailscaleStatus = {
      state: "running",
      dnsName: "fixture.tailnet.ts.net",
      httpsAvailable: true,
    };
    let finishServe!: (result: { readonly ok: true }) => void;
    h.tailscaleServePromise = new Promise((resolve) => {
      finishServe = resolve;
    });
    let settled = false;
    const update = controller.setTailscaleHttps(true).then((info) => {
      settled = true;
      return info;
    });
    await vi.waitFor(() => expect(h.servers.at(-1)?.started).toBe(true));
    expect(settled).toBe(false);
    expect(h.servers.at(-1)?.getInfo()?.tailscaleHttpBaseUrl).toBeUndefined();

    finishServe({ ok: true });
    const info = await update;
    if (info.status !== "ready") throw new Error("Published listener is not ready.");
    expect(settled).toBe(true);
    expect(info.tailscaleHttpBaseUrl).toBe("https://fixture.test");
  });

  it("keeps the configured custom URL as the fallback and skips Tailscale when the environment host overrides advertisement", async () => {
    h.settings.remoteAccessEnabled = true;
    h.settings.remoteAccessTailscaleHttps = true;
    h.settings.remoteAccessAdvertisedUrl = "https://custom.example";
    const controller = await fixture();
    await controller.startIfEnabled();
    const info = controller.getPairingInfo();
    if (info.status !== "ready") throw new Error("Custom listener is not ready.");
    expect(info.httpBaseUrl).toBe("https://custom.example/");
    expect(h.tailscaleServeCalls).toBe(0);
    await vi.waitFor(() => expect(h.tailscaleProbeCalls).toBe(1));
    await vi.waitFor(() =>
      expect(h.servers[0]?.options.isAdvertisedEndpointPending?.()).toBe(false),
    );
    await controller.dispose();

    vi.stubEnv("PORACODE_REMOTE_ACCESS_ADVERTISED_HOST", "env-custom.example");
    h.servers.length = 0;
    const environmentController = await fixture();
    await environmentController.startIfEnabled();
    await vi.waitFor(() =>
      expect(h.servers[0]?.options.isAdvertisedEndpointPending?.()).toBe(false),
    );
    expect(h.tailscaleProbeCalls).toBe(1);
    expect(h.tailscaleServeCalls).toBe(0);
    expect(h.servers[0]?.publishedOrigins).toEqual([]);
  });

  it("closes an enabled listener immediately when disabled during held Tailscale setup, then restores loopback after owned Serve cleanup", async () => {
    h.settings.remoteAccessEnabled = true;
    h.settings.remoteAccessTailscaleHttps = true;
    h.tailscaleStatus = {
      state: "running",
      dnsName: "fixture.tailnet.ts.net",
      httpsAvailable: true,
    };
    let finishServe!: (result: { readonly ok: true }) => void;
    h.tailscaleServePromise = new Promise((resolve) => {
      finishServe = resolve;
    });
    const controller = await fixture();
    await controller.startIfEnabled();
    const enabledServer = h.servers[0]!;
    expect(enabledServer.started).toBe(true);
    expect(enabledServer.options.isAdvertisedEndpointPending?.()).toBe(true);

    const pairing = await controller.setEnabled(false);
    expect(pairing.status).toBe("disabled");
    expect(enabledServer.options.isAdvertisedEndpointPending?.()).toBe(true);
    await vi.waitFor(() => expect(enabledServer.disposed).toBe(true));
    expect(h.servers).toHaveLength(1);

    finishServe({ ok: true });
    await vi.waitFor(() => expect(h.servers).toHaveLength(2));
    const loopbackServer = h.servers[1]!;
    expect(loopbackServer.options.host).toBe("127.0.0.1");
    expect(loopbackServer.started).toBe(true);
    expect(enabledServer.publishedOrigins).toEqual([]);
    expect(h.tailscaleServeDisabled).toBe(1);
    expect(controller.getPairingInfo().status).toBe("disabled");
  });

  it("joins held Tailscale and preview work on final disposal without changing final Serve behavior", async () => {
    h.settings.remoteAccessEnabled = true;
    h.settings.remoteAccessTailscaleHttps = true;
    h.tailscaleStatus = {
      state: "running",
      dnsName: "fixture.tailnet.ts.net",
      httpsAvailable: true,
    };
    let finishServe!: (result: { readonly ok: true }) => void;
    h.tailscaleServePromise = new Promise((resolve) => {
      finishServe = resolve;
    });
    let finishPreviewStore!: () => void;
    h.previewStorePromise = new Promise((resolve) => {
      finishPreviewStore = resolve;
    });
    const controller = await fixture();
    await controller.startIfEnabled();
    const server = h.servers[0]!;
    let disposed = false;
    const disposal = controller.dispose().then(() => {
      disposed = true;
    });
    await vi.waitFor(() => expect(server.disposed).toBe(true));
    expect(disposed).toBe(false);

    finishServe({ ok: true });
    finishPreviewStore();
    await disposal;
    expect(disposed).toBe(true);
    expect(server.publishedOrigins).toEqual([]);
    expect(h.tailscaleServeDisabled).toBe(0);
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
    const { dbUpsertProject } = await import("@/host/db");
    expect(dbUpsertProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "__lightcode_home__", disabled: true }),
      0,
    );
    // The renderer credential is minted per ask, without rotating the QR.
    const second = await controller.getManagedLoopbackBootstrap();
    expect((second as ManagedLoopbackBootstrap).pairingUrl).toContain("#token=renderer-1-2");
    expect(h.servers[0]!.issuePairingUrlCalls).toBe(0);
  });

  it("still mints the managed loopback bootstrap when TLS is configured (V6 B.3)", async () => {
    const controller = await fixture();
    await controller.startIfEnabled();
    await expect(controller.getManagedLoopbackBootstrap()).resolves.toMatchObject({
      endpoint: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+/),
    });
    expect(h.servers[0]!.tlsFingerprint()).toHaveLength(64);
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
