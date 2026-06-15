import { describe, expect, it, vi } from "vitest";
import { createLocalIpcHandlers } from "@/main/ipc/localHandlers";
import { createSupervisorIpcHandlers } from "@/supervisor/ipcHandlers";
import {
  createInvokeBridge,
  ipcProcedureMap,
  MAIN_LOCAL_PROCEDURE_NAMES,
  type MainLocalProcedureName,
} from "./ipc";

describe("ipcProcedureMap", () => {
  it("defines a channel and payload schema for every procedure", () => {
    for (const [name, procedure] of Object.entries(ipcProcedureMap)) {
      expect(name.length).toBeGreaterThan(0);
      expect(procedure.channel).toMatch(/^lightcode:/);
      expect(procedure.payloadSchema).toBeDefined();
    }
  });

  it("creates bridge methods for every procedure", () => {
    const bridge = createInvokeBridge(async () => undefined);
    for (const name of Object.keys(ipcProcedureMap)) {
      expect(typeof bridge[name as keyof typeof bridge]).toBe("function");
    }
  });

  it("covers every main-local procedure with a local handler", () => {
    const handlers = createLocalIpcHandlers({
      getMainWindow: () => null as never,
      getBrowserPanelManager: () => null,
      requireLightcodePaths: () =>
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
        checkForUpdate: vi.fn<() => Promise<void>>(),
        startUpdateDownload: vi.fn<() => Promise<void>>(),
        installUpdate: vi.fn<() => void>(),
      },
      requestRelaunch: vi.fn<() => void>(),
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
      lspSendMessage: vi.fn<() => Promise<unknown>>().mockResolvedValue(result),
    } as never;

    const handlers = createSupervisorIpcHandlers(runtime);

    await expect(handlers.lspSendMessage({ sessionId: "session", message: {} })).resolves.toBe(
      result,
    );
  });
});
