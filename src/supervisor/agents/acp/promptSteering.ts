import type { ContentBlock, InitializeResponse } from "@agentclientprotocol/sdk";

/**
 * Non-interrupting steering over ACP, declared by the provider. ACP allows one
 * `session/prompt` per session; an agent that opts in also accepts a marked
 * `session/prompt` while a turn runs, folds its text into that turn at the
 * next safe boundary, and answers it once the receiving turn ends. A steer the
 * agent rejects (the turn closed first) is sent again as an ordinary prompt.
 */
export interface AcpPromptSteering {
  /** Whether this agent's `initialize` result advertises steering. */
  isSupported(initialize: InitializeResponse): boolean;
  /** `_meta` that marks a `session/prompt` as steering for the running turn. */
  requestMeta: Record<string, unknown>;
  /**
   * The agent's reply to a folded steer always starts a new assistant item, so
   * the steer row is painted without closing open assistant content; the
   * in-flight message keeps streaming into its item above the row.
   */
  repliesInNewAssistantItem?: boolean;
}

/** Steering prompts carry text only; other content waits for the next prompt. */
export function isTextOnlyPrompt(blocks: readonly ContentBlock[]): boolean {
  return blocks.length > 0 && blocks.every((block) => block.type === "text");
}
