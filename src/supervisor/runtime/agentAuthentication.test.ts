import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";

// Isolation (a first harness wrote into the real ~/.poracode/settings.json):
// the service gets explicit temp paths, the home and data dir resolve to a temp
// dir, and every native process, native-runtime and network entry point throws
// and is asserted unused. No SupervisorRuntime is built, so its boot-time
// native Node prefetch (a login-shell probe) never starts.
const isolatedHome = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "poracode-auth-home-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("PORACODE_DATA_DIR", home);
  return home;
});
// A plain array, not a mock: `clearMocks` must not erase import-time attempts.
const nativeAttempts = vi.hoisted((): string[] => []);
const nativeDispatch = vi.hoisted(() => (entry: string): never => {
  nativeAttempts.push(entry);
  throw new Error(`Native dispatch is blocked in this test: ${entry}`);
});
vi.hoisted(() => vi.stubGlobal("fetch", () => nativeDispatch("fetch")));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const blocked = Object.fromEntries(
    ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"].map((name) => [
      name,
      () => nativeDispatch(`child_process.${name}`),
    ]),
  );
  return { ...actual, ...blocked, default: { ...actual, ...blocked } };
});
vi.mock("node-pty", () => ({ spawn: () => nativeDispatch("node-pty.spawn") }));
vi.mock("../native/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/runtime")>()),
  resolveNativeNode: () => nativeDispatch("resolveNativeNode"),
  probeUserNode: () => nativeDispatch("probeUserNode"),
  installNativeRuntime: () => nativeDispatch("installNativeRuntime"),
}));

const dispatchAcpAuthenticateMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      adapter: unknown;
      methodId: string;
      envKind?: "windows" | "wsl";
      wslDistro?: string;
    }) => Promise<void>
  >(),
);
const verifyAcpGenericAuthenticationMock = vi.hoisted(() =>
  vi.fn<(instance: unknown, ctx?: unknown) => Promise<boolean>>(),
);

vi.mock("../agents/acp", async (importActual) => {
  const actual = await importActual<typeof import("../agents/acp")>();
  return {
    ...actual,
    dispatchAcpAuthenticate: dispatchAcpAuthenticateMock,
  };
});

vi.mock("../agents/acp-generic", async (importActual) => {
  const actual = await importActual<typeof import("../agents/acp-generic")>();
  return {
    ...actual,
    verifyAcpGenericAuthentication: verifyAcpGenericAuthenticationMock,
  };
});

import { AgentRegistryService } from "./agentRegistryService";
import type { AgentStatusService } from "./agentStatusService";
import type { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";
import { fileSettingsWriter } from "./supervisorSettingsWriter.testFixtures";

const tempDirs: string[] = [];

function makeService(settingsPath: string, root: string): AgentRegistryService {
  if (!settingsPath.startsWith(`${tmpdir()}${sep}`)) {
    throw new Error("Auth tests must use an explicit temp settings path.");
  }
  // Stand in for the backend settings owner on this test's file only.
  const service = new AgentRegistryService({
    adapters: new Map(),
    settingsPath,
    settingsWriter: fileSettingsWriter(settingsPath),
    baseDir: root,
    acpIconsDir: join(root, "icons"),
    sharedSettingsCache: { invalidate: () => {} } as unknown as SupervisorSharedSettingsCache,
    // `authenticateAcpAgent` fires an unawaited status refresh; keep it inert.
    getAgentStatusService: () =>
      ({
        invalidateAgentStatuses: () => {},
        refreshAgentStatuses: async () => ({ windows: [], wsl: [], fromCache: false }),
      }) as unknown as AgentStatusService,
    getActiveWslProjectDistros: () => [],
    closeThreadsForAgentKind: async (_agentKind: AgentKind) => {},
  });
  service.refreshAgentRegistryAdapters();
  return service;
}

afterEach(() => {
  // Fails the test that made the attempt, including one a caller swallowed.
  const attempts = nativeAttempts.splice(0);
  if (attempts.length > 0) throw new Error(`Native dispatch attempted: ${attempts.join(", ")}`);
  dispatchAcpAuthenticateMock.mockReset();
  verifyAcpGenericAuthenticationMock.mockReset();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(isolatedHome, { recursive: true, force: true });
});

function writeGenericAcpSettings(authAcknowledged?: {
  native?: boolean;
  wsl?: Record<string, boolean>;
}): { root: string; settingsPath: string } {
  const root = mkdtempSync(join(tmpdir(), "poracode-runtime-auth-"));
  tempDirs.push(root);
  const settingsPath = join(root, "settings.json");
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        ...defaultSharedSettings,
        agentInstances: {
          "my-acp": {
            id: "my-acp",
            driver: "acp-generic",
            displayName: "My ACP",
            ...(authAcknowledged ? { authAcknowledged } : {}),
            config: {
              binary: "my-acp",
              args: ["--stdio"],
              cwd: "project",
              authMode: "none",
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return { root, settingsPath };
}

describe("authenticateAcpAgent", () => {
  it("persists generic ACP auth only after verification succeeds", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    dispatchAcpAuthenticateMock.mockResolvedValue(undefined);
    verifyAcpGenericAuthenticationMock.mockResolvedValueOnce(true);

    await makeService(settingsPath, root).authenticateAcpAgent({
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    });

    expect(dispatchAcpAuthenticateMock).toHaveBeenCalledWith(
      expect.objectContaining({ methodId: "browser-login" }),
    );
    expect(verifyAcpGenericAuthenticationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "my-acp" }),
      undefined,
    );
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      agentInstances: Record<string, { authAcknowledged?: { native?: boolean } }>;
    };
    expect(settings.agentInstances["my-acp"]?.authAcknowledged?.native).toBe(true);
  });

  it("clears generic ACP auth when browser login does not complete", async () => {
    const { root, settingsPath } = writeGenericAcpSettings({ native: true });
    dispatchAcpAuthenticateMock.mockResolvedValue(undefined);
    verifyAcpGenericAuthenticationMock.mockResolvedValueOnce(false);

    await expect(
      makeService(settingsPath, root).authenticateAcpAgent({
        agentKind: "acp-generic:my-acp",
        methodId: "browser-login",
      }),
    ).rejects.toThrow(
      "My ACP reported authentication success, but Poracode could not verify it. Configure My ACP directly, then try again.",
    );

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      agentInstances: Record<string, { authAcknowledged?: { native?: boolean } }>;
    };
    expect(settings.agentInstances["my-acp"]?.authAcknowledged).toBeUndefined();
  });
});
