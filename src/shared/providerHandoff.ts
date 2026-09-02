import type { ProviderHandoffContextStrategy, ThreadPresentationMode } from "./contracts";
import { continuesInPlace } from "./continueProviderRanking";

export interface ProviderHandoffStrategyInput {
  sourcePresentationMode: ThreadPresentationMode;
  targetPresentationMode: ThreadPresentationMode;
  /** True for a mirrored thread, whose transcript lives on its host. */
  isMirroredThread: boolean;
  /** Current settings leave the built-in `read_thread` tool callable. */
  readThreadToolEnabled: boolean;
  /** The thread's last session actually resolved `read_thread` at launch. */
  threadResolvedReadThreadTool: boolean;
  /** The target runtime guarantees its effective MCP set remains available. */
  targetReadThreadToolGuaranteed: boolean;
}

/**
 * How a handoff hands the prior conversation to the incoming provider.
 *
 * - **chat → chat**, switch or fork, is "thread-transcript": the source
 *   thread's rows stay in the app database, so the new provider reads them
 *   itself with the built-in `read_thread` tool. An in-place switch reads its
 *   own thread; a fork reads the source thread through a thread mention in
 *   its first prompt. Nothing is copied or summarized, and the new provider
 *   pulls only as much history as it needs instead of carrying it all in its
 *   first message.
 * - **chat → cli**, **cli → cli**, and **cli → chat** are "context-file": a
 *   PTY has no persisted rows to read and cannot call the tool, so the
 *   context has to travel with the prompt.
 *
 * The transcript route additionally needs the thread to be local (a mirrored
 * thread's transcript lives on its host) and `read_thread` to be reachable —
 * per current settings, which decide the next launch's MCP snapshot, and per
 * the thread's last session, which is the only evidence that the built-in
 * server actually resolves for it. When either says no, the handoff falls back
 * to a context file rather than starting the new provider blind.
 */
export function resolveProviderHandoffStrategy(
  input: ProviderHandoffStrategyInput,
): ProviderHandoffContextStrategy {
  const chatToChat = continuesInPlace(input.sourcePresentationMode, input.targetPresentationMode);
  return chatToChat &&
    !input.isMirroredThread &&
    input.readThreadToolEnabled &&
    input.threadResolvedReadThreadTool &&
    input.targetReadThreadToolGuaranteed
    ? "thread-transcript"
    : "context-file";
}
