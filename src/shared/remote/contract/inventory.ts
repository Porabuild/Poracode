import { runtimeEventSchema } from "../../contracts/runtimeEvent";
import {
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { readProtocolManifest } from "./manifestRead";
import { BLOCKED_PROCEDURE_RESULTS, REMOTE_PROCEDURE_CONTRACTS } from "./procedures";
import { REMOTE_HTTP_ROUTES } from "./routes";
import type { RemoteContractInventory } from "./types";

function discriminatedOptionCount(schema: unknown): number {
  return ((schema as { options?: readonly unknown[] }).options ?? []).length;
}

function manifestWebSocketLists(manifest: unknown): {
  readonly replayableEventTypes: number;
  readonly runtimeEventTypes: number;
} {
  const webSocket = (manifest as { webSocket?: Record<string, unknown> }).webSocket ?? {};
  const replayable = webSocket.replayableEventTypes;
  const runtime = webSocket.runtimeEventTypes;
  return {
    replayableEventTypes: Array.isArray(replayable) ? replayable.length : 0,
    runtimeEventTypes: Array.isArray(runtime) ? runtime.length : 0,
  };
}

export function buildRemoteContractInventory(): RemoteContractInventory {
  const voidResultCount = REMOTE_PROCEDURE_CONTRACTS.filter(
    (procedure) => procedure.resultKind === "omitted",
  ).length;
  const manifestLists = manifestWebSocketLists(readProtocolManifest());
  return {
    routes: REMOTE_HTTP_ROUTES.length,
    procedures: REMOTE_PROCEDURE_CONTRACTS.length,
    voidProcedureResults: voidResultCount,
    jsonProcedureResults: REMOTE_PROCEDURE_CONTRACTS.length - voidResultCount,
    blockedProcedureResults: BLOCKED_PROCEDURE_RESULTS,
    webSocketClientMessages: discriminatedOptionCount(remoteWebSocketClientMessageSchema),
    webSocketServerMessages: discriminatedOptionCount(remoteWebSocketServerMessageSchema),
    replayableEventTypes: manifestLists.replayableEventTypes,
    runtimeEventTypes: discriminatedOptionCount(runtimeEventSchema),
  };
}
