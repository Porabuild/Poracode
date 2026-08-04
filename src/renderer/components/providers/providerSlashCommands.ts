import type { AgentSlashCommand } from "@/shared/contracts";
import { lookupProviderRegistration } from "./providerRegistry";

export interface GuiSlashCommandContext {
  hasEffort: boolean;
  supportsFast: boolean;
}

/** Runtime scope the composer is bound to when the registration is consulted. */
export interface GuiSlashCommandScope {
  runtimeLabel?: string | undefined;
}

export type LocalSlashCommandAction =
  | { kind: "set-mode"; mode: "agent" | "plan" }
  | { kind: "open-control"; target: "model" | "effort" }
  | { kind: "toggle-fast" };

export interface GuiSlashCommandRegistration {
  /**
   * When present, the registration only applies in matching runtime scopes.
   * Outside of them the composer falls back to the provider-reported command
   * catalog (e.g. ACP `available_commands_update`).
   */
  isEnabled?: (scope: GuiSlashCommandScope) => boolean;
  buildCommands: (context: GuiSlashCommandContext) => readonly AgentSlashCommand[];
  resolveLocalAction: (typedCommand: string) => LocalSlashCommandAction | null;
}

const guiSlashCommandRegistry = new Map<string, GuiSlashCommandRegistration>();

export function registerGuiSlashCommands(kind: string, registration: GuiSlashCommandRegistration) {
  guiSlashCommandRegistry.set(kind, registration);
}

export function getGuiSlashCommands(kind: string): GuiSlashCommandRegistration | undefined {
  return lookupProviderRegistration(guiSlashCommandRegistry, kind);
}
