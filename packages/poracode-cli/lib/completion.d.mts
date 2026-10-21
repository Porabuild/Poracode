export const CLI_COMPLETION_VERSION: 1;
export const CLI_COMPLETION_HELP: string;
export interface CliCompletionResult {
  readonly mode: "candidates" | "files" | "none";
  readonly candidates: readonly string[];
  readonly optionPrefix?: string;
}
export function queryCompletion(words: readonly string[], current: string): CliCompletionResult;
export function renderCompletion(args: readonly string[]): string;
