import { ipcMain } from "electron";
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

interface RegisterIpcHandlersOptions {
  localHandlers: MainLocalIpcHandlerMap;
  callSupervisor<Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const invoke = async (name: IpcProcedureName, args: unknown[]): Promise<unknown> => {
    const procedure = ipcProcedureMap[name];
    if (!procedure) throw new Error(`Unknown client procedure: ${String(name)}`);
    const payload = parseIpcProcedureArgs(name, args);
    if (procedure.transport === "main-local") {
      const handler = options.localHandlers[name as keyof MainLocalIpcHandlerMap] as (
        payload: unknown,
      ) => unknown;
      return handler(payload);
    }
    return options.callSupervisor(name as SupervisorProcedureName, payload as never);
  };
  const procedureNames = Object.keys(ipcProcedureMap) as IpcProcedureName[];
  for (const name of procedureNames) {
    const procedure = ipcProcedureMap[name];
    ipcMain.handle(procedure.channel, (_event, ...args: unknown[]) => invoke(name, args));
  }
  ipcMain.handle(
    IPC_WINDOW_CHANNELS.clientProcedureInvoke,
    (_event, request: { name?: unknown; args?: unknown }) => {
      if (
        typeof request?.name !== "string" ||
        !Object.hasOwn(ipcProcedureMap, request.name) ||
        !Array.isArray(request.args)
      ) {
        throw new Error("Invalid client procedure request.");
      }
      return invoke(request.name as IpcProcedureName, request.args);
    },
  );
}
