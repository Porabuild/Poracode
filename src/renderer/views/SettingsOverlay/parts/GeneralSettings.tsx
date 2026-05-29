import { startTransition } from "react";
import { Switch } from "@heroui/react";
import type { NewThreadMode } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { newThreadModeOptions } from "./settingsOptions";

export function GeneralSettings() {
  const preventSleepWhileWorking = useSharedSettings((state) => state.preventSleepWhileWorking);
  const setPreventSleepWhileWorking = useSharedSettings(
    (state) => state.setPreventSleepWhileWorking,
  );
  const closeToTray = useSharedSettings((state) => state.closeToTray);
  const setCloseToTray = useSharedSettings((state) => state.setCloseToTray);
  const newThreadMode = useSharedSettings((state) => state.newThreadMode);
  const setNewThreadMode = useSharedSettings((state) => state.setNewThreadMode);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const setHomeScopeEnabled = useSharedSettings((state) => state.setHomeScopeEnabled);
  const editorLspEnabled = useSharedSettings((state) => state.editorLspEnabled);
  const setEditorLspEnabled = useSharedSettings((state) => state.setEditorLspEnabled);

  return (
    <SettingsPage title="General">
      <SettingRow
        title="Default new thread"
        description="Open new threads as a full page or a side-by-side panel."
      >
        <Select
          aria-label="Default new thread"
          className="w-[160px] shrink-0"
          options={newThreadModeOptions}
          value={newThreadMode}
          onChange={(value) => {
            startTransition(() => {
              setNewThreadMode(value as NewThreadMode);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        title="Home scope"
        description="Show a projectless Home scope for OS-level agent sessions."
      >
        <Switch
          isSelected={homeScopeEnabled}
          onChange={(selected) => {
            startTransition(() => {
              setHomeScopeEnabled(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        title="Prevent sleep while working"
        description="Keep the system awake while any thread is actively working."
      >
        <Switch
          isSelected={preventSleepWhileWorking}
          onChange={(selected) => {
            startTransition(() => {
              setPreventSleepWhileWorking(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        title="Close to tray"
        description="When you close the window, keep Lightcode running in the system tray. Disable to quit on close."
      >
        <Switch
          isSelected={closeToTray}
          onChange={(selected) => {
            startTransition(() => {
              setCloseToTray(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        title="Editor LSP"
        description="Enable language server support for type checking, completions, and diagnostics. Requires a language server installed."
      >
        <Switch
          isSelected={editorLspEnabled}
          onChange={(selected) => {
            startTransition(() => {
              setEditorLspEnabled(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
    </SettingsPage>
  );
}
