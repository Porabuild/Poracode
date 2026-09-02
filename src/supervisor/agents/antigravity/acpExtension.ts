/**
 * Antigravity's ACP mapper extension: the shared mapper accepts one
 * `AcpTextStreamExtension`, so the provider's quirk parsers are fanned out
 * from here. Each part keeps its own slot in the mapper's extension store.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import type { AcpMapperState } from "../acp/canonicalMapping/state";
import type {
  AcpAgentTextInput,
  AcpAgentTextResult,
  AcpExtensionToolCallInput,
  AcpTextStreamExtension,
} from "../acp/canonicalMapping/textStreamExtension";
import { createAntigravityReadCompletionExtension } from "./acpReadCompletion";
import { createAntigravityTaskNotificationExtension } from "./acpTaskNotifications";

export function createAntigravityAcpExtension(): AcpTextStreamExtension {
  return composeAcpExtensions("antigravity", [
    createAntigravityTaskNotificationExtension(),
    createAntigravityReadCompletionExtension(),
  ]);
}

function composeAcpExtensions(
  id: string,
  parts: readonly AcpTextStreamExtension[],
): AcpTextStreamExtension {
  return {
    id,
    handleAgentText(input: AcpAgentTextInput): AcpAgentTextResult {
      const events: RuntimeEvent[] = [];
      let text = input.text;
      for (const part of parts) {
        if (!part.handleAgentText) continue;
        const handled = part.handleAgentText({ ...input, text });
        events.push(...handled.events);
        text = handled.text;
      }
      return { events, text };
    },
    trackToolCall(input: AcpExtensionToolCallInput): void {
      for (const part of parts) part.trackToolCall?.(input);
    },
    observeSessionUpdate(input): RuntimeEvent[] {
      return parts.flatMap((part) => part.observeSessionUpdate?.(input) ?? []);
    },
    handleClientFileRead(input): RuntimeEvent[] {
      return parts.flatMap((part) => part.handleClientFileRead?.(input) ?? []);
    },
    flushTurnBoundary(state: AcpMapperState): RuntimeEvent[] {
      return parts.flatMap((part) => part.flushTurnBoundary?.(state) ?? []);
    },
    resetForTurnEnd(state: AcpMapperState): void {
      for (const part of parts) part.resetForTurnEnd?.(state);
    },
  };
}
