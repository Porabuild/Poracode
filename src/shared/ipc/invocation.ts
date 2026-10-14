import {
  assertIpcProcedureMapVersion,
  IPC_PROCEDURE_MAP_VERSION,
  ipcProcedureMap,
  type IpcProcedureName,
} from "./procedureMap";

/**
 * The common renderer→host procedure invocation envelope (hop 17, see
 * `clientHostHop.ts`): the renderer-supplied declaration of the procedure-map
 * version it compiled against, plus the procedure name and its raw argument
 * list.
 *
 * The declared version is minted in the RENDERER bundle by
 * {@link createClientProcedureInvocation} — it is the factory's own compiled
 * {@link IPC_PROCEDURE_MAP_VERSION}, never a caller parameter and never
 * manufactured or overwritten by preload. Preload forwards the envelope
 * unchanged, so main can treat the declared version as the producer's own
 * statement; a legacy positional call cannot acquire the current version
 * because nothing in the crossing mints one.
 */
export interface ClientProcedureInvocation {
  readonly ipcProcedureMapVersion: typeof IPC_PROCEDURE_MAP_VERSION;
  readonly name: IpcProcedureName;
  readonly args: unknown[];
}

/**
 * Builds one complete invocation envelope in the renderer. The version is
 * read from this module's own compiled constant: a bundle that compiled
 * against hop 16 stamps 16 and is refused by a hop-17 main, typed — it can
 * never be silently upgraded in transit.
 */
export function createClientProcedureInvocation(
  name: IpcProcedureName,
  args: unknown[],
): ClientProcedureInvocation {
  return { ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION, name, args };
}

/**
 * Main-side ingress admission for the checked exchange, shared by the managed
 * handler (`registerIpcHandlers`) and standalone attach. Order is the fence:
 * the DECLARED version is asserted (existing
 * {@link assertIpcProcedureMapVersion} primitive, typed
 * `IpcProcedureMapVersionError`) BEFORE any name/args parse or dispatch — a
 * missing/malformed declaration counts as version 0 (legacy peer), the
 * previous hop's 16 and any future version reject with their own peer version.
 * Only after admission do the existing shape patterns apply; a current-version
 * envelope with a bad name/args rejects as the shape error, never as a faked
 * legacy version.
 */
export function parseClientProcedureInvocation(request: unknown): {
  name: IpcProcedureName;
  args: unknown[];
} {
  assertIpcProcedureMapVersion(
    (request as { ipcProcedureMapVersion?: unknown } | null | undefined)?.ipcProcedureMapVersion,
  );
  const envelope = request as { name?: unknown; args?: unknown };
  if (
    typeof envelope?.name !== "string" ||
    !Object.hasOwn(ipcProcedureMap, envelope.name) ||
    !Array.isArray(envelope.args)
  ) {
    throw new Error("Invalid client procedure request.");
  }
  return { name: envelope.name as IpcProcedureName, args: envelope.args };
}
