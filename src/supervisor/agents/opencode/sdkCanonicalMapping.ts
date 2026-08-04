/**
 * OpenCode SDK → canonical RuntimeEvent mapper (public barrel).
 *
 * Translates events emitted by the legacy client's `event.subscribe`
 * into Poracode's canonical chat events. Mirrors the role of
 * `acp/canonicalMapping.ts` for the ACP protocol.
 *
 * Reconciliation note: OpenCode interleaves `message.part.delta` (incremental)
 * with `message.part.updated` (full part snapshot). To avoid double-emit we
 * track the text we have already streamed per part-id and use
 * `suffixPrefixOverlap` to detect what's new in a snapshot.
 *
 * The implementation is split under `./canonicalMapping/` (leaf readers →
 * domain modules → dispatch); this file preserves the public surface.
 */

export {
  createOpenCodeMapperState,
  isOpenCodeChildSession,
  markOpenCodeUsageScopeSampled,
  openCodeUsageScopeForSession,
  setOpenCodeMainSessionId,
  type OpenCodeMapperState,
  type OpenCodeSubAgentSessionState,
} from "./sdkCanonicalMappingState";

export { mapOpenCodeEvent } from "./canonicalMapping/dispatch";
export { closeOpenItems } from "./canonicalMapping/textItems";
