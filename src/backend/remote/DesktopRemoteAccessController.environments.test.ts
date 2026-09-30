import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { composeHostEnvironments } from "@/host/environments/composeHostEnvironments";
import type { EnvironmentRuntimeService } from "@/host/environments/environmentRuntimeService";
import type {
  RemoteAccessServerInfo,
  RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";

/**
 * F-3 execution coverage (C1 composed-server review): the desktop hop
 * `createDesktopRemoteAccessController({ environments })` →
 * `performDesktopRemoteAccessStart` → `environmentRemoteAccessOptions` →
 * `RemoteAccessServer` was source/typecheck-verified only. This suite builds
 * the REAL server (only main-only dependencies are mocked) over a real
 * environment composition and proves the composed capability is advertised
 * and its management route is wired.
 */

const h = vi.hoisted(() => ({
  settings: {} as SharedSettings,
}));

vi.mock("@/host/db", () => ({
  dbGetProjects: () => [],
  dbGetThreads: () => [],
  dbGetProject: () => null,
  dbGetThread: () => null,
  dbUpdateProject: vi.fn<(project: unknown) => void>(),
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
  remoteAccessHost: () => "127.0.0.1",
  remoteAccessPairingAppUrl: () => undefined,
  remoteForwardBaseUrl: () => undefined,
  resolveRemoteAccessPort: async () => 0,
}));
vi.mock("@/host/remote/identity", () => ({
  readOrCreateRemoteAccessIdentity: () => ({ desktopId: "fixture-host", label: "Fixture" }),
}));
vi.mock("@/host/remote/portForward/portForwarding", () => ({
  createPortForwarding: () => ({ gateway: {}, proxy: {}, dispose() {} }),
}));
vi.mock("@/host/remote/tailscale", () => ({
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

async function exchangeToken(info: RemoteAccessServerInfo): Promise<string> {
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

const fixtures: Array<{ root: string; controller: DesktopRemoteAccessController }> = [];
const environmentRoots: string[] = [];

beforeEach(() => {
  h.settings = { ...defaultSharedSettings };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  for (const { root, controller } of fixtures.splice(0)) {
    await controller.dispose().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
  for (const root of environmentRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function fixture(options: {
  readonly environments?: EnvironmentRuntimeService;
}): Promise<DesktopRemoteAccessController> {
  const root = mkdtempSync(join(tmpdir(), "poracode-desktop-environments-"));
  const controller = createDesktopRemoteAccessController({
    appVersion: "fixture",
    channel: "stable",
    paths: { baseDir: root, settingsPath: join(root, "settings.json") },
    ...(options.environments ? { environments: options.environments } : {}),
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

describe("desktop-composed environment capability", () => {
  it("advertises sshEnvironments and wires the management route through the real desktop hop", async () => {
    const environmentRoot = mkdtempSync(join(tmpdir(), "poracode-desktop-env-composition-"));
    environmentRoots.push(environmentRoot);
    const composition = await composeHostEnvironments({
      lease: { paths: { dataRoot: environmentRoot }, generation: "fixture", assertActive() {} },
      baseDir: environmentRoot,
      inputs: {
        mainBundleDir: environmentRoot,
        agentPluginsDir: environmentRoot,
        wslHelpersDir: environmentRoot,
      },
      runtimeProvider: async () => ({ hash: "a".repeat(64) }),
      createSshManager: () => ({
        connect: async () => {
          throw new Error("SSH is not part of this desktop composition fixture");
        },
        disconnect: async () => {},
        dispose: async () => {},
      }),
    });
    const controller = await fixture({ environments: composition.runtimeService });
    try {
      await controller.startIfEnabled();
      const server = controller.getServer();
      expect(server).not.toBeNull();
      const info: RemoteAccessServerInfo = server!.getInfo()!;
      const descriptor = await fetch(
        new URL("/.well-known/poracode/environment", info.localHttpBaseUrl),
      );
      expect(descriptor.status).toBe(200);
      expect(await descriptor.json()).toMatchObject({
        capabilities: { sshEnvironments: { versions: [1] } },
      });
      // The management route is the composed runtime (the real registry
      // answers an authenticated list), not the bounded 503 of an
      // uncomposed server.
      const accessToken = await exchangeToken(info);
      const management = await fetch(new URL("/api/environments", info.localHttpBaseUrl), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(management.status).toBe(200);
      expect(await management.json()).toEqual({ environments: [] });
    } finally {
      await controller.dispose();
      await composition.dispose();
    }
  });

  it("keeps the capability absent without an environment composition", async () => {
    const controller = await fixture({});
    try {
      await controller.startIfEnabled();
      const info = controller.getServer()!.getInfo()!;
      const descriptor = await fetch(
        new URL("/.well-known/poracode/environment", info.localHttpBaseUrl),
      );
      const body = (await descriptor.json()) as {
        capabilities?: { sshEnvironments?: unknown };
      };
      expect(body.capabilities?.sshEnvironments).toBeUndefined();
      const accessToken = await exchangeToken(info);
      const management = await fetch(new URL("/api/environments", info.localHttpBaseUrl), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(management.status).toBe(503);
    } finally {
      await controller.dispose();
    }
  });
});
