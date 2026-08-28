import { z } from "zod";
import type { SharedSettings } from "./settings";

/**
 * Scope mode for a settings domain that can vary per machine.
 * "synced": the single global value applies to every machine (the lock —
 * today's behavior and the default). "per-machine": machines may override;
 * the global value stays the fallback for machines without an override.
 */
export const machineScopeModeSchema = z.enum(["synced", "per-machine"]);
export type MachineScopeMode = z.infer<typeof machineScopeModeSchema>;

export const machineScopeModesSchema = z.object({
  providerOrder: machineScopeModeSchema,
  hiddenModels: machineScopeModeSchema,
  disabledAgents: machineScopeModeSchema,
});
export type MachineScopeModes = z.infer<typeof machineScopeModesSchema>;

export const defaultMachineScopeModes: MachineScopeModes = {
  providerOrder: "synced",
  hiddenModels: "synced",
  disabledAgents: "synced",
};

/**
 * Sparse per-machine overrides, keyed by `machineKey`. Values are retained
 * when a domain flips back to "synced", so toggling the lock is lossless.
 * `agentSettings` holds machine-scoped agent-setting overrides (non-secret
 * keys only) merged over the global `agentSettings[kind]` at read time;
 * meaningful for local machines only — a remote host's behavioral agent
 * settings live in that host's own settings file.
 */
export const machineSettingsEntrySchema = z
  .object({
    providerOrder: z.array(z.string()),
    hiddenModels: z.record(z.string(), z.array(z.string())),
    disabledAgents: z.array(z.string()),
    agentSettings: z.record(z.string(), z.record(z.string(), z.union([z.boolean(), z.string()]))),
  })
  .partial();
export type MachineSettingsEntry = z.infer<typeof machineSettingsEntrySchema>;

type MachineScopeState = Pick<SharedSettings, "machineScopeModes" | "machineSettings">;

/** Provider display order effective on `machineKey`. */
export function effectiveProviderOrder(
  settings: MachineScopeState & Pick<SharedSettings, "providerOrder">,
  machineKey: string,
): readonly string[] {
  if (settings.machineScopeModes.providerOrder === "synced") return settings.providerOrder;
  return settings.machineSettings[machineKey]?.providerOrder ?? settings.providerOrder;
}

/** Hidden model IDs for `settingsKey` (agent kind or kind-variant) on `machineKey`. */
export function effectiveHiddenModels(
  settings: MachineScopeState & Pick<SharedSettings, "hiddenModels">,
  machineKey: string,
  settingsKey: string,
): readonly string[] {
  const global = settings.hiddenModels[settingsKey] ?? [];
  if (settings.machineScopeModes.hiddenModels === "synced") return global;
  return settings.machineSettings[machineKey]?.hiddenModels?.[settingsKey] ?? global;
}

/** Agent kinds disabled on `machineKey`. */
export function effectiveDisabledAgents(
  settings: MachineScopeState & Pick<SharedSettings, "disabledAgents">,
  machineKey: string,
): readonly string[] {
  if (settings.machineScopeModes.disabledAgents === "synced") return settings.disabledAgents;
  return settings.machineSettings[machineKey]?.disabledAgents ?? settings.disabledAgents;
}

/**
 * Agent settings for `agentKind` effective on `machineKey`: the machine's
 * overrides merged over the global values. Unlike the display domains above,
 * agent-setting overrides are always active (no scope-mode lock) — a machine
 * without overrides simply inherits every global value.
 */
export function effectiveAgentSettings(
  settings: MachineScopeState & Pick<SharedSettings, "agentSettings">,
  machineKey: string,
  agentKind: string,
): Record<string, boolean | string> {
  return {
    ...settings.agentSettings[agentKind],
    ...settings.machineSettings[machineKey]?.agentSettings?.[agentKind],
  };
}
