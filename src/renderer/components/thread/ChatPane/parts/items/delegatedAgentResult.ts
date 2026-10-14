import type { ToolCallPayload } from "@/shared/contracts";
import type { I18n } from "@lingui/core";
import { localizeMessageSource } from "@/shared/messages";
import { SHARED_MESSAGE_DESCRIPTORS } from "@/renderer/i18n/sharedMessages";
import { extractAcpResultPart } from "./acpToolPayload";

/** Localize host-authored errors without changing saved output or provider prose. */
export function delegatedAgentResultText(payload: ToolCallPayload, translate: I18n["_"]): string {
  const result = payload.result;
  if (payload.status === "error") {
    const source =
      typeof result === "string"
        ? result
        : result !== null &&
            typeof result === "object" &&
            !Array.isArray(result) &&
            Object.keys(result).length === 1 &&
            "error" in result &&
            typeof result.error === "string"
          ? result.error
          : undefined;
    const localized =
      source === undefined
        ? undefined
        : localizeMessageSource(source, (key) => translate(SHARED_MESSAGE_DESCRIPTORS[key]));
    if (localized !== undefined) return localized;
  }
  return extractAcpResultPart(payload).text.trim();
}
