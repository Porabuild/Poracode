import type { ProviderHandoffContextStrategy, ThreadPresentationMode } from "./contracts";
import { continuesInPlace } from "./continueProviderRanking";

/** What the user asked the handoff dialog for: a replacement thread, or a switch. */
export type ProviderHandoffIntent = "fork" | "switch";

export interface ProviderHandoffStrategyInput {
  intent: ProviderHandoffIntent;
  sourcePresentationMode: ThreadPresentationMode;
  targetPresentationMode: ThreadPresentationMode;
  /** True for a mirrored thread, whose transcript lives on its host. */
  isMirroredThread: boolean;
  /** Current settings leave the built-in `read_thread` tool callable. */
  readThreadToolEnabled: boolean;
  /** The thread's last session actually resolved `read_thread` at launch. */
  threadResolvedReadThreadTool: boolean;
}

/**
 * How a handoff hands the prior conversation to the incoming provider.
 *
 * - **chat → chat** (an in-place switch) is "thread-transcript": the thread
 *   keeps its id and every persisted row, so the new provider gets the id and
 *   reads the conversation itself. Nothing is extracted — a summary run would
 *   spend a one-shot turn on the provider being left behind, which is usually
 *   the one that ran out of quota and prompted the switch.
 * - **chat → cli**, **cli → cli**, **cli → chat**, and every fork are
 *   "context-file": each lands in a different thread, or in a PTY that has no
 *   persisted rows to read, so the id buys the new provider nothing and the
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
  const handsOverTheSameThread =
    input.intent === "switch" &&
    continuesInPlace(input.sourcePresentationMode, input.targetPresentationMode);
  return handsOverTheSameThread &&
    !input.isMirroredThread &&
    input.readThreadToolEnabled &&
    input.threadResolvedReadThreadTool
    ? "thread-transcript"
    : "context-file";
}
