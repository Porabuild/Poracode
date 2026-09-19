// V5 plan 1.1 composition proof: the standalone server composes the SAME
// host services as the desktop — SSH environments, the Chrome bridge (+ its
// MCP ingress) and the computer-use MCP ingress — with no Electron anywhere
// in the graph, and publishes them as host-declared capabilities on the
// control-version-2 describe (V5 plan 1.2).

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import { HOST_CONTROL_PROTOCOL_VERSION } from "@/shared/hostControlProtocol";
import { ChromeBridgeServer, ChromeMcpIngress } from "@/main/browser";
import { ComputerUseMcpIngress } from "@/main/computer-use";
import { SshConnectionManager } from "@/main/ssh/SshConnectionManager";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";

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
    resolveComputerUseHelperBinaryPath: vi.fn<() => string>(() => "/fixture/poracode-computer-use"),
  };
});

vi.mock("@/main/computer-use/drivers", () => ({
  createComputerUseDriver: drivers.createComputerUseDriver,
  resolveComputerUseHelperBinaryPath: drivers.resolveComputerUseHelperBinaryPath,
}));

// Mutable state shared with the hoisted vi.mock factories (same harness as
// createHeadlessRemoteHost.test.ts: real ownership lease, mocked app DB and
// supervisor).
const h = vi.hoisted(() => ({
  tmpRoot: "",
  tmpBase: "",
  sharedSettings: {} as SharedSettings,
}));

vi.mock("@/main/db", () => ({
  initDatabase: () => undefined,
  closeDatabase: () => undefined,
  dbGetProjects: () => [],
  dbGetProject: () => null,
  dbGetProjectNotes: () => "",
  dbUpdateProject: () => undefined,
  dbUpsertProject: () => undefined,
  dbDeleteProject: () => undefined,
  dbGetPrWatches: () => [],
  dbGetPrWatch: () => null,
  dbUpsertPrWatch: () => undefined,
  dbDeletePrWatch: () => undefined,
  dbGetThreads: () => [],
  dbGetThread: () => null,
  dbGetThreadRuntimeItems: () => [],
  dbGetThreadCompletedTurns: () => [],
  dbGetThreadContextUsage: () => null,
  dbGetLatestThreadRuntimeAnchorItemId: () => null,
  dbAppendThreadCompletedTurn: () => undefined,
  dbApplyThreadRuntimeEvents: () => undefined,
  dbClaimRemoteCommand: () => ({ state: "claimed" }),
  dbCompleteRemoteCommand: () => undefined,
  dbFailRemoteCommand: () => undefined,
  dbReplaceThreadRuntimeSnapshot: () => undefined,
  dbUpsertThread: () => undefined,
  dbMarkLiveThreadsInactive: () => undefined,
  dbAppendThreadTerminalOutput: () => undefined,
  dbClearThreadTerminalScrollback: () => undefined,
  dbGetThreadTerminalScrollback: () => null,
  dbDeleteThread: () => undefined,
  dbGetSchedules: () => [],
  dbGetSchedule: () => null,
  dbUpsertSchedule: () => undefined,
  dbDeleteSchedule: () => undefined,
  dbInsertScheduleRun: () => undefined,
  dbUpdateScheduleRun: () => undefined,
  dbListScheduleRuns: () => [],
  dbDeleteScheduleRuns: () => undefined,
  dbInterruptScheduleRuns: () => undefined,
}));

vi.mock("@/main/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = vi.fn<() => void>();
    dispose = vi.fn<() => Promise<void>>(async () => undefined);
    call = vi.fn<() => Promise<unknown>>(async () => ({}));
  },
}));

vi.mock("@/main/sharedSettingsFile", () => ({
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
      });
      // The composed services settle their starts without failing startup.
      await expect(host.start()).resolves.toMatchObject({
        httpBaseUrl: expect.stringContaining("http://127.0.0.1:"),
      });
    } finally {
      await disposeQuietly(host);
    }
  });

  it("publishes the composed capabilities on the control-version-2 describe", async () => {
    let host: Awaited<ReturnType<typeof makeHost>> | undefined;
    try {
      host = await makeHost({
        agentPluginsDir: "/fixture/agent-plugins",
        computerUseHelperRoot: "/fixture/computer-use-helper",
      });
      await host.start();
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
      });
    } finally {
      await disposeQuietly(host);
    }
  });
});
