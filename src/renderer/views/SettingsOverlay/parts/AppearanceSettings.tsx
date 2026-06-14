import { startTransition, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "@heroui/react";
import type { ThemeMode } from "@/shared/contracts";
import { isMac } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { getThemePreset } from "@/renderer/theme/themePresets";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { ThemeGallery, ThemeSwatch } from "./ThemeGallery";
import { fontSizeOptions, themeOptions } from "./settingsOptions";

export function AppearanceSettings() {
  const themeMode = useSharedSettings((state) => state.themeMode);
  const setThemeMode = useSharedSettings((state) => state.setThemeMode);
  const themePreset = useSharedSettings((state) => state.themePreset);
  const appearance = useResolvedAppearance();
  const [themeOpen, setThemeOpen] = useState(false);
  const activePreset = getThemePreset(themePreset);
  const activeVars = (
    appearance === "dark" ? activePreset.dark : activePreset.light
  ) as CSSProperties;
  const guiChatFontSize = useSharedSettings((state) => state.guiChatFontSize);
  const setGuiChatFontSize = useSharedSettings((state) => state.setGuiChatFontSize);
  const sidebarTranslucency = useSharedSettings((state) => state.sidebarTranslucency);
  const setSidebarTranslucency = useSharedSettings((state) => state.setSidebarTranslucency);

  return (
    <SettingsPage title="Appearance">
      <SettingRow title="Mode" description="Match your system, or force light or dark.">
        <Select
          aria-label="Appearance mode"
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

      <div className="space-y-2.5">
        <button
          type="button"
          aria-expanded={themeOpen}
          onClick={() => setThemeOpen((open) => !open)}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-4 rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--row-hover)]"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Theme</p>
            <p className="text-xs text-muted">
              Popular editor themes adapted to Lightcode. Each follows the light or dark mode above.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="text-sm text-foreground">{activePreset.label}</span>
            <ThemeSwatch vars={activeVars} />
            <ChevronDown
              className={`size-4 text-muted transition-transform ${themeOpen ? "rotate-180" : ""}`}
            />
          </div>
        </button>
        {themeOpen ? <ThemeGallery /> : null}
      </div>

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

      <SettingRow
        title="Translucent sidebar"
        description={
          isMac()
            ? "Frost the sidebar with the system blur material (vibrancy), echoing recent macOS. Falls back to a translucent tint where unsupported."
            : "Make the sidebar translucent — the system blur material on Windows 11, a translucent tint elsewhere."
        }
      >
        <Switch
          isSelected={sidebarTranslucency}
          onChange={(selected) => {
            startTransition(() => {
              setSidebarTranslucency(selected);
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
