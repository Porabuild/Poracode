import {
  buildCommandRegistry,
  buildWhenContext,
  isCommandAvailable,
} from "@/renderer/commands/registry";
import { recordFeatureSignal } from "@/renderer/state/featureUsageStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import type { SettingsSection } from "@/renderer/views/SettingsOverlay/parts/types";

/** Run an app command from the news line, exactly as the palette would. */
export function runAppCommand(commandId: string): void {
  const command = buildCommandRegistry().find((entry) => entry.id === commandId);
  if (!command || !isCommandAvailable(command, buildWhenContext())) return;
  recordFeatureSignal(`command:${commandId}`);
  void command.run();
}

export function openSettingsSection(section: SettingsSection): void {
  usePanelStore.getState().openSettingsSection(section);
}
