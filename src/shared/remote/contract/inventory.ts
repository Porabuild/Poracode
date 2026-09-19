import { runtimeEventSchema } from "../../contracts/runtimeEvent";
import {
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { REMOTE_REPLAYABLE_EVENT_TYPES } from "./protocolFacts";
import { BLOCKED_PROCEDURE_RESULTS, REMOTE_PROCEDURE_CONTRACTS } from "./procedures";
import { REMOTE_HTTP_ROUTES } from "./routes";
import type { RemoteContractInventory } from "./types";

function discriminatedOptionCount(schema: unknown): number {
  return ((schema as { options?: readonly unknown[] }).options ?? []).length;
}

export function buildRemoteContractInventory(): RemoteContractInventory {
  const voidResultCount = REMOTE_PROCEDURE_CONTRACTS.filter(
    (procedure) => procedure.resultKind === "omitted",
  ).length;
  return {
    routes: REMOTE_HTTP_ROUTES.length,
    procedures: REMOTE_PROCEDURE_CONTRACTS.length,
    voidProcedureResults: voidResultCount,
    jsonProcedureResults: REMOTE_PROCEDURE_CONTRACTS.length - voidResultCount,
    blockedProcedureResults: BLOCKED_PROCEDURE_RESULTS,
    webSocketClientMessages: discriminatedOptionCount(remoteWebSocketClientMessageSchema),
    webSocketServerMessages: discriminatedOptionCount(remoteWebSocketServerMessageSchema),
    replayableEventTypes: REMOTE_REPLAYABLE_EVENT_TYPES.length,
    runtimeEventTypes: discriminatedOptionCount(runtimeEventSchema),
  };
}
