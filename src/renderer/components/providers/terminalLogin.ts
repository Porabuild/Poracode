import type { AgentStatus, Project } from "@/shared/contracts";
import { lookupProviderRegistration } from "./providerRegistry";

export interface TerminalLoginCompletionInput {
  status: AgentStatus;
  project: Project;
  onAuthenticated: () => void;
}

type TerminalLoginCompletionWatcher = (input: TerminalLoginCompletionInput) => () => void;
const watchers = new Map<string, TerminalLoginCompletionWatcher>();

/** Renderer-only hooks for login commands that keep running after sign-in. */
export function registerTerminalLoginCompletion(
  kind: string,
  watch: TerminalLoginCompletionWatcher,
) {
  watchers.set(kind, watch);
}

export function watchTerminalLoginCompletion(
  input: TerminalLoginCompletionInput,
): (() => void) | undefined {
  return lookupProviderRegistration(watchers, input.status.kind)?.(input);
}
