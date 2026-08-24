import { describe, expect, it, vi } from "vitest";
import { createLocalIpcHandlers } from "@/main/ipc/localHandlers";
import { createSupervisorIpcHandlers } from "@/supervisor/ipcHandlers";
import {
  createInvokeBridge,
  createProcedureBridge,
  ipcProcedureMap,
  MAIN_LOCAL_PROCEDURE_NAMES,
  type MainLocalProcedureName,
} from "./ipc";

describe("ipcProcedureMap", () => {
  it("defines a channel and payload schema for every procedure", () => {
    for (const [name, procedure] of Object.entries(ipcProcedureMap)) {
      expect(name.length).toBeGreaterThan(0);
      expect(procedure.channel).toMatch(/^poracode:/);
      expect(procedure.payloadSchema).toBeDefined();
    }
  });

  it("creates bridge methods for every procedure", () => {
    const bridge = createInvokeBridge(async () => undefined);
    for (const name of Object.keys(ipcProcedureMap)) {
      expect(typeof bridge[name as keyof typeof bridge]).toBe("function");
    }
  });

  it("can generate a bridge while preserving procedure names and arguments", async () => {
    const invoke = vi.fn<(name: string, args: unknown[]) => Promise<unknown>>(async () => null);
    const bridge = createProcedureBridge(invoke);

    await bridge.dbGetProjectNotes("project-1");

    expect(invoke).toHaveBeenCalledWith("dbGetProjectNotes", ["project-1"]);
  });

  it("repairs blank legacy thread models at the database persistence boundary", () => {
    const baseThread = {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "claude" as const,
      status: "idle" as const,
      attention: "none" as const,
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const parsed = ipcProcedureMap.dbSyncAll.parseArgs(
      [],
      [
        { ...baseThread, config: { model: "", effort: "high" } },
        { ...baseThread, id: "thread-2", config: { model: "sonnet", effort: "low" } },
      ],
      JSON.stringify({ kind: "home" }),
    );

    expect(parsed.threads[0]?.config).toEqual({ model: "auto", effort: "high" });
    expect(parsed.threads[1]?.config).toEqual({ model: "sonnet", effort: "low" });
  });

  it("covers every main-local procedure with a local handler", () => {
    const handlers = createLocalIpcHandlers({
      getMainWindow: () => null as never,
      getBrowserPanelManager: () => null,
      getRemoteAccessServer: () => null,
      setRemoteAccessEnabled: vi.fn<(enabled: boolean) => Promise<never>>(),
      getRemoteAccessTailscaleStatus: vi.fn<() => Promise<never>>(),
      setRemoteAccessTailscaleHttps: vi.fn<(enabled: boolean) => Promise<never>>(),
      startTailscale: vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
      setRemoteAccessAdvertisedUrl: vi.fn<(url: string) => Promise<never>>(),
      sshConnectionManager: {
        discoverHosts: vi.fn<() => never[]>(() => []),
        connect: vi.fn<() => Promise<never>>(),
        disconnect: vi.fn<() => Promise<void>>(),
      } as never,
      requirePoracodePaths: () =>
        ({
          baseDir: "C:\\tmp",
          dbPath: "C:\\tmp\\db.sqlite",
          logsDir: "C:\\tmp\\logs",
          terminalLogsDir: "C:\\tmp\\logs",
          attachmentsDir: "C:\\tmp\\attachments",
          worktreesDir: "C:\\tmp\\worktrees",
          cacheDir: "C:\\tmp\\cache",
          settingsPath: "C:\\tmp\\settings.json",
          keybindingsPath: "C:\\tmp\\keybindings.json",
          statusCachePath: "C:\\tmp\\status-cache.json",
        }) as never,
      updatePowerSaveBlocker: vi.fn<() => void>(),
      autoUpdater: {
        initialize: vi.fn<() => void>(),
        getStatus: vi.fn<() => null>(() => null),
        checkForUpdate: vi.fn<() => Promise<void>>(),
        startUpdateDownload: vi.fn<() => Promise<void>>(),
        installUpdate: vi.fn<() => void>(),
      },
      extractBrowserToWindow: vi.fn<() => void>(),
      injectBrowserToMain: vi.fn<() => void>(),
      requestRelaunch: vi.fn<() => void>(),
      scheduleService: {} as never,
      prWatchService: {} as never,
    });

    expect(Object.keys(handlers).sort()).toEqual([...MAIN_LOCAL_PROCEDURE_NAMES].sort());
  });

  it("covers every supervisor procedure with a dispatcher handler", () => {
    const runtime = new Proxy(
      {},
      {
        get: () => vi.fn<(...args: never[]) => unknown>(),
      },
    ) as never;
    const handlers = createSupervisorIpcHandlers(runtime);
    const supervisorProcedureNames = Object.keys(ipcProcedureMap).filter(
      (name) => !MAIN_LOCAL_PROCEDURE_NAMES.includes(name as MainLocalProcedureName),
    );

    expect(Object.keys(handlers).sort()).toEqual(supervisorProcedureNames.sort());
  });

  it("returns LSP request results from the supervisor dispatcher", async () => {
    const result = { items: [{ label: "completion" }] };
    const runtime = {
      lspManager: {
        sendMessage: vi.fn<() => Promise<unknown>>().mockResolvedValue(result),
      },
    } as never;

    const handlers = createSupervisorIpcHandlers(runtime);

    await expect(handlers.lspSendMessage({ sessionId: "session", message: {} })).resolves.toBe(
      result,
    );
  });
});
