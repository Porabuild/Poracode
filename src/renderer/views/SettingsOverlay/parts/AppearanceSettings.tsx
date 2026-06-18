import { startTransition, useEffect, useState, type CSSProperties } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Slider, SliderFill, SliderOutput, SliderThumb, SliderTrack, Switch } from "@heroui/react";
import type { ThemeMode } from "@/shared/contracts";
import { isMac } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { getThemePreset } from "@/renderer/theme/themePresets";
import { applySidebarGlassTint, sidebarGlassTintDefault } from "@/renderer/theme/sidebarGlass";
import { useNativeMaterialActive } from "@/renderer/hooks/useGlassState";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { ThemeGallery, ThemeSwatch } from "./ThemeGallery";
import { fontSizeOptions, themeOptions, useLocalizedOptions } from "./settingsOptions";

export function AppearanceSettings() {
  const { t } = useLingui();
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
  const sidebarGlassTint = useSharedSettings((state) => state.sidebarGlassTint);
  const setSidebarGlassTint = useSharedSettings((state) => state.setSidebarGlassTint);

  // Frosting slider: tunes the active appearance's glass tint. Applies on the
  // native-material platforms (Windows 11 acrylic, macOS vibrancy), which both
  // consume the tint var; local state drives a live preview during drag and the
  // store persists on release. Seeds from the override, else the platform
  // default. Gated on the live native material so it never shows as a no-op
  // where the token isn't consumed (Windows 10 / Linux use the fallback
  // gradient and report no native material).
  const nativeMaterialActive = useNativeMaterialActive();
  const showGlassTintSlider = nativeMaterialActive;
  const glassTintOverride = sidebarGlassTint[appearance];
  const glassTintDefault = sidebarGlassTintDefault(appearance);
  const [glassTint, setGlassTint] = useState(glassTintOverride ?? glassTintDefault);
  useEffect(() => {
    setGlassTint(glassTintOverride ?? glassTintDefault);
  }, [glassTintOverride, glassTintDefault]);
  // HeroUI's Slider emits number | number[]; this control is single-thumb.
  const normalizeSliderValue = (value: number | number[]): number =>
    Array.isArray(value) ? (value[0] ?? glassTint) : value;
  const previewGlassTint = (next: number | number[]) => {
    const pct = normalizeSliderValue(next);
    setGlassTint(pct);
    // Live preview through the same writer the provider uses, so there's one
    // place that knows how to set/clear the inline tint.
    applySidebarGlassTint(document.documentElement, pct, true);
  };
  const resetGlassTint = () => {
    setGlassTint(glassTintDefault);
    // Clear the override so the styles.css per-platform default takes back over.
    applySidebarGlassTint(document.documentElement, null, true);
    startTransition(() => {
      setSidebarGlassTint(appearance, null);
    });
  };

  const themeOpts = useLocalizedOptions(themeOptions);

  return (
    <SettingsPage title={t`Appearance`}>
      <SettingRow
        title={t`Mode`}
        description={<Trans>Match your system, or force light or dark.</Trans>}
      >
        <Select
          aria-label={t`Appearance mode`}
          className="w-[160px] shrink-0"
          options={themeOpts}
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
            <p className="text-sm font-medium text-foreground">
              <Trans>Theme</Trans>
            </p>
            <p className="text-xs text-muted">
              <Trans>
                Popular editor themes adapted to Lightcode. Each follows the light or dark mode
                above.
              </Trans>
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
        title={t`GUI chat font size`}
        description={
          <Trans>
            Agent chat (ACP / markdown). Command rows use this size minus 1&nbsp;px; tool and plan
            lines minus 2&nbsp;px.
          </Trans>
        }
      >
        <Select
          aria-label={t`GUI chat font size`}
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
        title={t`Translucent sidebar`}
        description={
          isMac()
            ? t`Frost the sidebar with the system blur material (vibrancy), echoing recent macOS. Falls back to a translucent tint where unsupported.`
            : t`Make the sidebar translucent — the system blur material on Windows 11, a translucent tint elsewhere.`
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

      {showGlassTintSlider ? (
        <SettingRow
          title={t`Sidebar frosting`}
          description={t`Frosting of the ${appearance}-mode sidebar over the system blur. Higher holds the theme color; lower shows more of what's behind.`}
        >
          <Slider
            aria-label={t`Sidebar frosting`}
            className="w-[220px] shrink-0"
            minValue={0}
            maxValue={100}
            step={5}
            value={glassTint}
            onChange={previewGlassTint}
            onChangeEnd={(next) => {
              startTransition(() => {
                setSidebarGlassTint(appearance, normalizeSliderValue(next));
              });
            }}
          >
            <div className="mb-1.5 flex items-center justify-end gap-1">
              <SliderOutput className="text-xs tabular-nums text-muted">
                {(values) => `${values.state.getThumbValueLabel(0)}%`}
              </SliderOutput>
              {/* Always rendered so the value never shifts; hidden (space reserved)
                  until there's an override to clear. */}
              <button
                type="button"
                aria-label={t`Reset sidebar frosting to default`}
                title={t`Reset to default`}
                onClick={resetGlassTint}
                className={`inline-flex items-center justify-center rounded p-0.5 text-muted transition-colors hover:text-foreground ${
                  glassTintOverride == null ? "invisible" : ""
                }`}
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </SettingRow>
      ) : null}
    </SettingsPage>
  );
}
