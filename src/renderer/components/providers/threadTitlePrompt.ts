import { lookupProviderRegistration } from "./providerRegistry";

/**
 * Provider hook for command-initiated threads: given a new thread's first
 * prompt, return the text its title should derive from (for example, the
 * argument of a provider command that starts a thread), or undefined to keep
 * the prompt itself. Only consulted for the fallback and AI-generated title of
 * a new thread; the prompt sent to the provider is never rewritten.
 */
export type ThreadTitlePromptResolver = (prompt: string) => string | undefined;

const threadTitlePromptRegistry = new Map<string, ThreadTitlePromptResolver>();

export function registerThreadTitlePrompt(kind: string, resolver: ThreadTitlePromptResolver) {
  threadTitlePromptRegistry.set(kind, resolver);
}

/** The text a new thread's title derives from; the prompt itself unless a provider overrides. */
export function resolveThreadTitlePrompt(kind: string, prompt: string): string {
  const resolved = lookupProviderRegistration(threadTitlePromptRegistry, kind)?.(prompt)?.trim();
  return resolved || prompt;
}
