import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
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
      envKind?: "windows" | "wsl" | "posix";
      wslDistro?: string;
      signal?: AbortSignal;
      onProcess?: (process: ChildProcessLifetime) => void;
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
        reconcileAgentRegistry: () => {},
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
  it("keeps cancellation pending through actual pipe-close confirmation and rejects duplicate IDs", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    const entered = Promise.withResolvers<void>();
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const lifetime = new ChildProcessLifetime(child);
    dispatchAcpAuthenticateMock.mockImplementation(async ({ signal, onProcess }) => {
      onProcess!(lifetime);
      entered.resolve();
      await new Promise((_, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }),
      );
    });
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    const failed = service.controlAcpAuthentication(start).catch((error: unknown) => error);
    await entered.promise;
    await expect(service.controlAcpAuthentication(start)).rejects.toThrow("already used");
    let cancelled = false;
    const cancellation = service
      .controlAcpAuthentication({ version: 1, action: "cancel", operationId: start.operationId })
      .then(() => {
        cancelled = true;
      });
    await Promise.resolve();
    child.emit("exit", 0, null);
    await Promise.resolve();
    expect(cancelled).toBe(false);
    child.emit("close", 0, null);
    await cancellation;
    expect(await failed).toBeInstanceOf(Error);
    expect(verifyAcpGenericAuthenticationMock).not.toHaveBeenCalled();
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    await expect(service.controlAcpAuthentication(start)).rejects.toThrow("already used");
    expect(dispatchAcpAuthenticateMock).toHaveBeenCalledOnce();
  });

  it("refuses cancel-before-start, repeated cancel, future versions, and unsupported WSL without launching", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    await expect(service.controlAcpAuthentication(start)).rejects.toThrow("already used");
    await expect(
      service.controlAcpAuthentication({ ...start, version: 2 } as never),
    ).rejects.toThrow("Invalid input");
    await expect(
      service.controlAcpAuthentication({ ...start, operationId: "invalid" }),
    ).rejects.toThrow("Invalid UUID");
    await expect(
      service.controlAcpAuthentication({
        ...start,
        operationId: randomUUID(),
        envKind: "wsl",
        wslDistro: "Ubuntu",
      }),
    ).rejects.toThrow("selected distro");
    await expect(
      service.controlAcpAuthentication({
        ...start,
        operationId: randomUUID(),
        wslDistro: "Ubuntu",
      }),
    ).rejects.toThrow("selected distro");
    expect(dispatchAcpAuthenticateMock).not.toHaveBeenCalled();
  });

  it("cancels a routed start before its asynchronous preparation can run", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    const failed = service.controlAcpAuthentication(start).catch((error: unknown) => error);
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    expect(await failed).toBeInstanceOf(Error);
    expect(dispatchAcpAuthenticateMock).not.toHaveBeenCalled();
  });

  it("keeps unconfirmed child custody for a scoped cancellation retry", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const lifetime = new ChildProcessLifetime(child);
    const stop = vi
      .spyOn(lifetime, "stop")
      .mockRejectedValueOnce(new Error("Fixture pipe closure unconfirmed"));
    const entered = Promise.withResolvers<void>();
    dispatchAcpAuthenticateMock.mockImplementation(async ({ signal, onProcess }) => {
      onProcess!(lifetime);
      entered.resolve();
      await new Promise((_, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }),
      );
    });
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    const failed = service.controlAcpAuthentication(start).catch((error: unknown) => error);
    await entered.promise;
    await expect(
      service.controlAcpAuthentication({
        version: 1,
        action: "cancel",
        operationId: start.operationId,
      }),
    ).rejects.toBeInstanceOf(AggregateError);
    await expect(service.controlAcpAuthentication(start)).rejects.toThrow("already used");
    stop.mockImplementationOnce(async () => {
      child.emit("close", 0, null);
      await lifetime.closed;
    });
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    expect(await failed).toBeInstanceOf(Error);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("bounds active operations and joins every held request when stopping", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    dispatchAcpAuthenticateMock.mockImplementation(async ({ signal }) => {
      await new Promise((_, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }),
      );
    });
    const start = {
      version: 1,
      action: "start",
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    const failed = Array.from({ length: 8 }, () =>
      service
        .controlAcpAuthentication({ ...start, operationId: randomUUID() })
        .catch((error: unknown) => error),
    );
    try {
      await expect(
        service.controlAcpAuthentication({ ...start, operationId: randomUUID() }),
      ).rejects.toThrow("Too many active");
    } finally {
      await service.disposeAcpAuthentications();
      expect((await Promise.all(failed)).every((error) => error instanceof Error)).toBe(true);
    }
  });

  it("makes late/repeated cancellation harmless after a completed authentication", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    dispatchAcpAuthenticateMock.mockResolvedValue(undefined);
    verifyAcpGenericAuthenticationMock.mockResolvedValue(true);
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    await service.controlAcpAuthentication(start);
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    await expect(service.controlAcpAuthentication(start)).rejects.toThrow("already used");
    expect(
      JSON.parse(readFileSync(settingsPath, "utf8")).agentInstances["my-acp"].authAcknowledged
        .native,
    ).toBe(true);
    expect(dispatchAcpAuthenticateMock).toHaveBeenCalledOnce();
  });

  it("does not cancel a different UUID and joins all held authentications on shutdown", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    const entered = Promise.withResolvers<void>();
    let signal: AbortSignal | undefined;
    dispatchAcpAuthenticateMock.mockImplementation(async (input) => {
      signal = input.signal;
      entered.resolve();
      await new Promise((_, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }),
      );
    });
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    const failed = service.controlAcpAuthentication(start).catch((error: unknown) => error);
    await entered.promise;
    await service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: randomUUID(),
    });
    expect(signal!.aborted).toBe(false);
    await service.disposeAcpAuthentications();
    expect(signal!.aborted).toBe(true);
    expect(await failed).toBeInstanceOf(Error);
    await expect(
      service.controlAcpAuthentication({ ...start, operationId: randomUUID() }),
    ).rejects.toThrow("shutting down");
    expect(verifyAcpGenericAuthenticationMock).not.toHaveBeenCalled();
  });

  it("does not persist a late authentication acknowledgement after cancellation", async () => {
    const { root, settingsPath } = writeGenericAcpSettings();
    const service = makeService(settingsPath, root);
    const entered = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    dispatchAcpAuthenticateMock.mockImplementation(async () => {
      entered.resolve();
      await released.promise;
    });
    const start = {
      version: 1,
      action: "start",
      operationId: randomUUID(),
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    } as const;
    const failed = service.controlAcpAuthentication(start).catch((error: unknown) => error);
    await entered.promise;
    const cancelled = service.controlAcpAuthentication({
      version: 1,
      action: "cancel",
      operationId: start.operationId,
    });
    released.resolve();
    await cancelled;
    expect(await failed).toBeInstanceOf(Error);
    expect(verifyAcpGenericAuthenticationMock).not.toHaveBeenCalled();
    expect(
      JSON.parse(readFileSync(settingsPath, "utf8")).agentInstances["my-acp"].authAcknowledged,
    ).toBeUndefined();
  });

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
