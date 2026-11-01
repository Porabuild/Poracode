/**
 * Poracode's `/summarize` for the Cursor SDK runtime (backed by
 * `agent.summarize()`, `@cursor/sdk` 1.2.0+). Only the bare command is
 * intercepted: the SDK operation takes no arguments, so `/summarize <text>`
 * keeps its literal meaning and reaches the model as an ordinary prompt —
 * the same rule `isCodexCompactCommand` applies to `/compact`.
 */
export function isCursorSdkSummarizeCommand(prompt: string): boolean {
  return prompt.trim() === "/summarize";
}
