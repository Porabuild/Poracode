import { ipcProcedureMap } from "../../ipc/procedureMap";
import { omittedResultSchema } from "../../ipc/resultCodec";
import { REMOTE_PROCEDURE_SPECS, type RemoteProcedureName } from "../procedures";
import type { RemoteProcedureContract } from "./types";

export const BLOCKED_PROCEDURE_RESULTS: readonly string[] = [];

function procedureContract(name: RemoteProcedureName): RemoteProcedureContract {
  const spec = REMOTE_PROCEDURE_SPECS[name];
  const ipc = ipcProcedureMap[name];
  // R1: the allowlist is supervisor-typed; this fail-closed assertion keeps a
  // main-local procedure out of the generated contract surface even if the
  // compile-time constraint is ever weakened.
  if (ipc.transport !== "supervisor") {
    throw new Error(
      `Remote procedure "${name}" is not a supervisor procedure ` +
        `(transport "${ipc.transport}"). Main-local procedures must never enter ` +
        "the generic remote passthrough contract.",
    );
  }
  const resultSchema = ipc.resultSchema;
  if (!resultSchema) {
    throw new Error(
      `Remote procedure "${name}" is missing an authoritative resultSchema. ` +
        "Do not invent a shape; add a real codec or list it in BLOCKED_PROCEDURE_RESULTS.",
    );
  }
  const resultKind = resultSchema === omittedResultSchema ? "omitted" : "json";
  return {
    name,
    scope: spec.scope,
    owner: spec.owner,
    ...("timeout" in spec && spec.timeout ? { timeout: spec.timeout } : {}),
    requestSchema: ipc.payloadSchema,
    resultKind,
    resultSchema,
  };
}

export const REMOTE_PROCEDURE_CONTRACTS: readonly RemoteProcedureContract[] = (
  Object.keys(REMOTE_PROCEDURE_SPECS) as RemoteProcedureName[]
).map(procedureContract);
