/**
 * Provider hook for agent-text and background-task quirks the shared ACP
 * mapper must not know about.
 *
 * Some agents multiplex protocol-shaped payloads through plain
 * `agent_message_chunk` text (Antigravity streams background-task reports as
 * XML/markdown blocks inside assistant prose). Parsing those belongs to the
 * provider, not to the shared mapper, so an adapter supplies an extension and
 * the mapper only calls the four lifecycle points below.
 *
 * The extension owns its own state through {@link getExtensionStore}; the
 * shared `AcpMapperState` carries no provider-shaped fields.
 */

import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { CanonicalItemType, RuntimeEvent } from "@/shared/contracts";
import type { AcpMapperState } from "./state";

/** The subset of an ACP `tool_call` / `tool_call_update` an extension may read. */
export interface AcpExtensionToolCallSource {
  toolCallId: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  content?: unknown;
}

export interface AcpAgentTextInput {
  text: string;
  state: AcpMapperState;
  /** Subagent tool call whose transcript owns this chunk, if any. */
  parentToolCallId: string | undefined;
  /** The turn was interrupted — buffered text must not be painted as prose. */
  suppressOutput: boolean;
}

export interface AcpAgentTextResult {
  events: RuntimeEvent[];
  /** The chunk with extension-owned blocks removed, to stream as assistant text. */
  text: string;
}

export interface AcpExtensionToolCallInput {
  state: AcpMapperState;
  itemType: CanonicalItemType;
  itemId: string;
  payload: Record<string, unknown>;
  toolCall: AcpExtensionToolCallSource;
}

export interface AcpTextStreamExtension {
  /** Stable key for this extension's slot in the mapper's extension store. */
  readonly id: string;
  /** Split a streamed agent-text chunk into events plus residual assistant text. */
  handleAgentText?(input: AcpAgentTextInput): AcpAgentTextResult;
  /** Observe a completing tool call so later async reports can update its row. */
  trackToolCall?(input: AcpExtensionToolCallInput): void;
  /**
   * Observe every `session/update` before the shared mapper handles it and
   * return events to emit first, e.g. to settle rows the agent itself reports
   * late. Must not consume the update; the mapper still maps it.
   */
  observeSessionUpdate?(input: { state: AcpMapperState; update: SessionUpdate }): RuntimeEvent[];
  /**
   * The client just served an `fs/readTextFile` request for `path` (as the
   * agent spelled it). Lets a provider settle the tool row that requested it.
   */
  handleClientFileRead?(input: { state: AcpMapperState; path: string }): RuntimeEvent[];
  /** Emit or discard anything still buffered when a turn closes. */
  flushTurnBoundary?(state: AcpMapperState): RuntimeEvent[];
  /** Drop per-turn buffers once a turn has ended. */
  resetForTurnEnd?(state: AcpMapperState): void;
}

/**
 * Lazily resolve this extension's private slot on the mapper state. The shared
 * mapper never reads it — only the extension that owns the id does.
 */
export function getExtensionStore<T>(state: AcpMapperState, id: string, create: () => T): T {
  const existing = state.extensionStore.get(id);
  if (existing !== undefined) return existing as T;
  const created = create();
  state.extensionStore.set(id, created);
  return created;
}

export function applyAgentTextExtension(input: AcpAgentTextInput): AcpAgentTextResult {
  const handled = input.state.textStreamExtension?.handleAgentText?.(input);
  return handled ?? { events: [], text: input.text };
}

export function trackToolCallExtension(input: AcpExtensionToolCallInput): void {
  input.state.textStreamExtension?.trackToolCall?.(input);
}

export function flushTextStreamExtension(state: AcpMapperState): RuntimeEvent[] {
  return state.textStreamExtension?.flushTurnBoundary?.(state) ?? [];
}

export function resetTextStreamExtension(state: AcpMapperState): void {
  state.textStreamExtension?.resetForTurnEnd?.(state);
}

export function observeSessionUpdateExtension(
  state: AcpMapperState,
  update: SessionUpdate,
): RuntimeEvent[] {
  return state.textStreamExtension?.observeSessionUpdate?.({ state, update }) ?? [];
}

export function applyClientFileReadExtension(state: AcpMapperState, path: string): RuntimeEvent[] {
  return state.textStreamExtension?.handleClientFileRead?.({ state, path }) ?? [];
}
