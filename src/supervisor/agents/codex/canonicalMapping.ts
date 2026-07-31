/**
 * Codex app-server → canonical RuntimeEvent mapper (public barrel).
 *
 * Codex app-server JSON-RPC notifications mapped to Poracode's canonical
 * runtime-event vocabulary. The shape we emit is intentionally small, based on
 * our `CanonicalItemType` / `RuntimeContentStreamKind` unions.
 *
 * Codex's actual notification vocabulary (relevant subset):
 *   - `turn/started`, `turn/completed`, `turn/aborted`
 *   - `item/started`           — lifecycle, payload `{ item: { id, type, ... } }`
 *   - `item/completed`         — lifecycle, payload `{ item: { id, ... } }`
 *   - `item/agentMessage/delta`           → assistant_text delta
 *   - `item/reasoning/textDelta`          → reasoning_text delta
 *   - `item/reasoning/summaryTextDelta`   → reasoning_text delta
 *   - `item/commandExecution/outputDelta` → command_output delta
 *   - `item/fileChange/outputDelta`       → file_change_output delta
 *   - `item/plan/delta`                   → plan_text delta
 *
 * The implementation is split under `./canonicalMapping/` (leaf readers →
 * domain modules → dispatch); this file preserves the public surface.
 */

export { createCodexMapperState, type CodexMapperState } from "./canonicalMappingState";

export { mapCodexNotification } from "./canonicalMapping/dispatch";
export {
  mapCodexServerRequest,
  translateCodexCanonicalResponse,
} from "./canonicalMapping/serverRequest";
export { createCodexUsageSpentEvent } from "./canonicalMapping/usage";
export { CodexUsageScopeTracker } from "./canonicalMapping/usageScope";
