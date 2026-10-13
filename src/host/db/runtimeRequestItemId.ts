import { RUNTIME_REQUEST_ITEM_TYPE } from "@/shared/contracts";

/** Item id for a persisted open request, keyed by its request id. */
export function runtimeRequestItemId(requestId: string): string {
  return `${RUNTIME_REQUEST_ITEM_TYPE}:${requestId}`;
}
