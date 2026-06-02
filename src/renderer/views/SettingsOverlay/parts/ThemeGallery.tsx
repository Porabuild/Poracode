import { startTransition, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { APP_THEME_PRESETS, type AppThemePreset } from "@/renderer/theme/themePresets";

/**
 * Compact theme swatch: a sidebar strip + content area with an accent dot,
 * rendered with the preset's variant vars. Used inline (e.g. the collapsed
 * Theme row) to show the active theme at a glance.
 */
export function ThemeSwatch(props: { vars: CSSProperties; className?: string }) {
  return (
    <div
      className={`flex overflow-hidden rounded-md border border-border/60 ${props.className ?? "h-8 w-14"}`}
      style={props.vars}
    >
      <div
        className="flex w-1/3 flex-col justify-center gap-1 px-1"
        style={{ background: "var(--sidebar-background)" }}
      >
        <span className="h-1 w-full rounded-full" style={{ background: "var(--muted)" }} />
        <span className="h-1 w-2/3 rounded-full" style={{ background: "var(--muted)" }} />
      </div>
      <div
        className="flex flex-1 flex-col justify-center gap-1 px-1.5"
        style={{ background: "var(--content-background)" }}
      >
        <span className="h-1 w-3/4 rounded-full" style={{ background: "var(--foreground)" }} />
        <span className="h-1.5 w-1/2 rounded-sm" style={{ background: "var(--accent)" }} />
      </div>
    </div>
  );
}

/**
 * Selectable grid of app themes. Each card previews the preset using the
 * variant that matches the current appearance, so the swatch reflects exactly
 * what the app will look like after selection.
 */
export function ThemeGallery() {
  const themePreset = useSharedSettings((state) => state.themePreset);
  const setThemePreset = useSharedSettings((state) => state.setThemePreset);
  const appearance = useResolvedAppearance();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {APP_THEME_PRESETS.map((preset) => (
        <ThemeCard
          key={preset.id}
          preset={preset}
          appearance={appearance}
          selected={preset.id === themePreset}
          onSelect={() => {
            startTransition(() => {
              setThemePreset(preset.id);
            });
          }}
        />
      ))}
    </div>
  );
}

function ThemeCard(props: {
  preset: AppThemePreset;
  appearance: "light" | "dark";
  selected: boolean;
  onSelect: () => void;
}) {
  const { preset, appearance, selected, onSelect } = props;
  const vars = (appearance === "dark" ? preset.dark : preset.light) as CSSProperties;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors ${
        selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-muted"
      }`}
    >
      <div className="overflow-hidden rounded-md border border-border/50" style={vars}>
        <div className="flex h-16" style={{ background: "var(--content-background)" }}>
          <div
            className="w-1/3 border-r p-1.5"
            style={{ background: "var(--sidebar-background)", borderColor: "var(--border)" }}
          >
            <div className="h-1.5 w-3/4 rounded-full" style={{ background: "var(--muted)" }} />
            <div
              className="mt-1.5 h-1.5 w-1/2 rounded-full"
              style={{ background: "var(--muted)" }}
            />
          </div>
          <div className="flex-1 p-1.5">
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: "var(--foreground)" }} />
            <div
              className="mt-1.5 h-1.5 w-1/2 rounded-full"
              style={{ background: "var(--muted)" }}
            />
            <div className="mt-2 h-3 w-8 rounded-sm" style={{ background: "var(--accent)" }} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="truncate text-xs font-medium text-foreground">{preset.label}</span>
        {selected ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
      </div>
    </button>
  );
}
