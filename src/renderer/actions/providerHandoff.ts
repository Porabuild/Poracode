import { readBridge } from "@/renderer/bridge";
import { buildHandoffLaunchInput as buildLaunchInput } from "@/shared/providerHandoffLaunch";

export {
  buildForkMentionLaunchInput,
  defaultHandoffPrompt,
  DEFAULT_HANDOFF_PROMPT,
  DEFAULT_THREAD_READ_HANDOFF_PROMPT,
  handoffInlineLabel,
  MAX_INLINE_HANDOFF_CONTEXT_CHARS,
  type ProviderHandoffContext,
} from "@/shared/providerHandoffLaunch";

export function buildHandoffLaunchInput(
  input: Omit<Parameters<typeof buildLaunchInput>[0], "saveContext">,
) {
  return buildLaunchInput({
    ...input,
    saveContext: (payload) => readBridge().saveHandoffContext(payload),
  });
}
