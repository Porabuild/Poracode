/**
 * B4 bounded history reads — public composition barrel.
 *
 * The implementation is split by responsibility so no module owns more than
 * one concern:
 *
 * - `historyReadNegotiation.ts` — `reads=bounded-v1` and per-route params;
 * - `historyReadBudget.ts` — soft packing, exact trim, proven pre-fetch
 *   refusal, typed refusal bodies;
 * - `historyReadBuilders.ts` — the three bounded page builders (fence-held
 *   phase 1 + phase 2, exact measurement);
 * - `historyReadFence.ts` — B1 fence flush and the typed persistence refusal
 *   mapping (delegating to `persistenceRefusals.ts` where compatible);
 * - `historyReadHandlers.ts` — the standalone HTTP handlers;
 * - `historyReadSchemas.ts` — local response schema extensions.
 *
 * C0 wires the handlers into the route table; until then nothing advertises
 * `reads=bounded-v1`. Undeclared clients keep the legacy path byte-for-byte.
 * See `tmp/v2-production/b4-host-final-corrections.md` for the exact handoff.
 */
export { HistoryItemTooLargeError } from "./historyReadBudget";
export {
  buildBoundedCompletedTurnPage,
  buildBoundedThreadHistoryItems,
  buildBoundedThreadSnapshot,
  type BoundedHistoryItemsInput,
  type BoundedHistorySnapshotOptions,
} from "./historyReadBuilders";
export { mapHistoryPersistenceRefusal } from "./historyReadFence";
export {
  handleBoundedThreadHistory,
  handleBoundedThreadHistoryItems,
  handleBoundedThreadTurns,
} from "./historyReadHandlers";
export { parseHistoryReadNegotiation, type HistoryReadNegotiation } from "./historyReadNegotiation";
export { boundedRuntimeItemsPageSchema, boundedThreadSnapshotSchema } from "./historyReadSchemas";
