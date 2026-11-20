import type { CommandAction, CommandExecutionPayload } from "@/shared/contracts";
import { deriveCommandActionsIntent } from "@/shared/commandPresentation/actions";
import {
  commandIntentDisplay,
  formatCommandDisplay,
  type CommandIntentDisplay,
} from "./commandSummary";

export function commandActionsDisplay(
  actions: CommandAction[] | undefined,
): CommandIntentDisplay | null {
  const intent = deriveCommandActionsIntent(actions);
  return intent ? formatCommandDisplay(intent) : null;
}

/** Classified actions win only when complete; shell interpretation is the fallback. */
export function commandPayloadDisplay(
  payload: CommandExecutionPayload | undefined,
  commandLine: string,
): CommandIntentDisplay {
  return commandActionsDisplay(payload?.actions) ?? commandIntentDisplay(commandLine);
}
