/**
 * Generic ACP → canonical RuntimeEvent mapper.
 *
 * This is the SINGLE source of truth for translating ACP protocol messages
 * (`@agentclientprotocol/sdk`) into Poracode's canonical chat events. It is
 * consumed by every ACP-speaking adapter — Copilot, future Gemini-ACP,
 * user-registered generic-ACP instances, and the `codex-acp` Rust shim.
 *
 * **Zero provider-specific branches.** The mapper imports types from the ACP
 * SDK only; provider identity is irrelevant to the translation.
 *
 * The implementation is split by concern under `./canonicalMapping/*`; this
 * barrel preserves the original public API surface so importers (session, tests)
 * are unaffected.
 */

export { createAcpMapperState, type AcpMapperState } from "./canonicalMapping/state";
export { closeOpenTurnItems } from "./canonicalMapping/toolCallPayloads";
export {
  mapAcpCanonicalGoalUpdate,
  PORACODE_ACP_GOAL_META_KEY,
  type AcpCanonicalGoalUpdate,
} from "./canonicalMapping/goals";
export {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  getDetachedSubAgentToolCallIdForNotification,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "./canonicalMapping/subagents";
export { mapAcpSessionUpdate } from "./canonicalMapping/dispatch";
export { mapAcpElicitationRequest, mapAcpPermissionRequest } from "./canonicalMapping/permissions";
