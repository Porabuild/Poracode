import { msg } from "@lingui/core/macro";
import type { AgentSlashCommand } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import type { GuiSlashCommandContext, LocalSlashCommandAction } from "./providerSlashCommands";

// A slash command's label is its id followed by the (translated) description, so
// the description is translated once and the `/id` keyword stays untranslatable.
export const guiSlashCommand = (id: string, description: string): AgentSlashCommand => ({
  id,
  description,
  label: `${id} - ${description}`,
});

/**
 * The provider-agnostic GUI command set: composer-local actions every
 * structured-chat provider supports. Provider-specific extras (e.g. Codex
 * `/goal`) insert after the mode commands and before effort/fast.
 */
export function buildStandardGuiSlashCommands(
  { hasEffort, supportsFast }: GuiSlashCommandContext,
  extras: readonly AgentSlashCommand[] = [],
): AgentSlashCommand[] {
  return [
    guiSlashCommand("model", i18n._(msg`Open the model picker`)),
    guiSlashCommand("plan", i18n._(msg`Switch this chat to plan mode`)),
    guiSlashCommand("agent", i18n._(msg`Switch this chat to agent mode`)),
    ...extras,
    ...(hasEffort ? [guiSlashCommand("effort", i18n._(msg`Open the effort picker`))] : []),
    ...(supportsFast ? [guiSlashCommand("fast", i18n._(msg`Toggle Fast mode`))] : []),
  ];
}

export function resolveStandardLocalSlashAction(typed: string): LocalSlashCommandAction | null {
  const normalized = typed.trim().toLowerCase();
  if (normalized === "/model") return { kind: "open-control", target: "model" };
  if (normalized === "/effort") return { kind: "open-control", target: "effort" };
  if (normalized === "/fast") return { kind: "toggle-fast" };
  if (normalized === "/plan") return { kind: "set-mode", mode: "plan" };
  if (normalized === "/agent") return { kind: "set-mode", mode: "agent" };
  return null;
}
