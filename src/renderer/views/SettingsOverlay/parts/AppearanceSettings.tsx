import { startTransition } from "react";
import type { ThemeMode } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { fontSizeOptions, themeOptions } from "./settingsOptions";

export function AppearanceSettings() {
  const themeMode = useSharedSettings((state) => state.themeMode);
  const setThemeMode = useSharedSettings((state) => state.setThemeMode);
  const guiChatFontSize = useSharedSettings((state) => state.guiChatFontSize);
  const setGuiChatFontSize = useSharedSettings((state) => state.setGuiChatFontSize);

  return (
    <SettingsPage title="Appearance">
      <SettingRow title="Theme" description="Choose how Lightcode looks.">
        <Select
          aria-label="Theme"
          className="w-[160px] shrink-0"
          options={themeOptions}
          value={themeMode}
          onChange={(value) => {
            startTransition(() => {
              setThemeMode(value as ThemeMode);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        title="GUI chat font size"
        description={
          <>
            Agent chat (ACP / markdown). Command rows use this size minus 1&nbsp;px; tool and plan
            lines minus 2&nbsp;px.
          </>
        }
      >
        <Select
          aria-label="GUI chat font size"
          className="w-[160px] shrink-0"
          options={fontSizeOptions}
          value={String(guiChatFontSize)}
          onChange={(value) => {
            startTransition(() => {
              setGuiChatFontSize(Number.parseInt(value, 10) || 13);
            });
          }}
        />
      </SettingRow>
    </SettingsPage>
  );
}
