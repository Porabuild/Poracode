import { ipcMain, type WebContents } from "electron";
import {
  ipcProcedureMap,
  IPC_WINDOW_CHANNELS,
  parseIpcProcedureArgs,
  type IpcProcedureName,
  type IpcProcedurePayload,
  type IpcProcedureResult,
  type MainLocalIpcHandlerMap,
  type SupervisorProcedureName,
} from "@/shared/ipc";
import { parseClientProcedureInvocation } from "@/shared/ipc/invocation";

interface RegisterIpcHandlersOptions {
  localHandlers: MainLocalIpcHandlerMap;
  callSupervisor<Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  // Main-local handlers may need the invoking webContents (per-window state);
  // supervisor calls carry no per-window metadata since A2 removed the
  // terminal-bootstrap relay window.
  const invoke = async (
    name: IpcProcedureName,
    args: unknown[],
    sender?: WebContents,
  ): Promise<unknown> => {
    const procedure = ipcProcedureMap[name];
    if (!procedure) throw new Error(`Unknown client procedure: ${String(name)}`);
    const payload = parseIpcProcedureArgs(name, args);
    if (procedure.transport === "main-local") {
      const handler = options.localHandlers[name as keyof MainLocalIpcHandlerMap] as (
        payload: unknown,
        sender?: WebContents,
      ) => unknown;
      return handler(payload, sender);
    }
    return options.callSupervisor(name as SupervisorProcedureName, payload as never);
  };
  // Hop 17: the only procedure ingress is the versioned envelope channel. The
  // obsolete unversioned per-procedure channels (`procedure.channel`, dialed
  // only by the unused `createInvokeBridge`) are no longer registered — the
  // current renderer calls every procedure through this envelope, and a
  // channel-dialed alias now fails loudly ("No handler registered") instead of
  // mutating without the version fence.
  ipcMain.handle(IPC_WINDOW_CHANNELS.clientProcedureInvoke, (event, request: unknown) => {
    // Checked exchange: the renderer-supplied envelope declares the hop
    // version, asserted BEFORE any payload parse or dispatch (see
    // `shared/ipc/invocation.ts`). A legacy positional caller's bare payload
    // rejects typed here, before any effect.
    const { name, args } = parseClientProcedureInvocation(request);
    return invoke(name, args, event.sender);
  });
}
