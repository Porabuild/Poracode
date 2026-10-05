import { useState, type CSSProperties } from "react";
import { Label, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  themeDocumentSchema,
  serializeThemeDocument,
  type CustomTheme,
} from "@/shared/customThemes";
import { buildThemePreset } from "@/renderer/theme/themePresets";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Button, Input, Select } from "@/renderer/components/common";
import { ThemeSwatch } from "./ThemeSwatch";
import { CustomThemePalette } from "./CustomThemePalette";

export function CustomThemeEditor(props: { initial: CustomTheme; onClose: () => void }) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(props.initial);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [saveError, setSaveError] = useState(false);
  const saveCustomTheme = useSharedSettings((state) => state.saveCustomTheme);
  const parsed = themeDocumentSchema.safeParse(draft);
  const preview = parsed.success ? buildThemePreset({ ...parsed.data, id: draft.id }) : null;

  const exportTheme = () => {
    if (!parsed.success) return;
    const url = URL.createObjectURL(
      new Blob([serializeThemeDocument(parsed.data)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "poracode-theme.json";
    link.click();
    // Keep the URL alive until the browser has started its download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <TextField isRequired value={draft.label} onChange={(label) => setDraft({ ...draft, label })}>
        <Label>
          <Trans>Theme name</Trans>
        </Label>
        <Input maxLength={80} />
      </TextField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          aria-label={t`Palette mode`}
          className="w-[160px]"
          options={[
            { id: "light", label: t`Light` },
            { id: "dark", label: t`Dark` },
          ]}
          value={mode}
          onChange={(value) => setMode(value === "light" ? "light" : "dark")}
        />
        {preview ? (
          <div className="flex gap-3">
            <div className="space-y-1 text-xs text-muted">
              <Trans>Light</Trans>
              <ThemeSwatch vars={preview.light as CSSProperties} />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <Trans>Dark</Trans>
              <ThemeSwatch vars={preview.dark as CSSProperties} />
            </div>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        <Trans>
          Use #rgb or #rrggbb colors. Leave optional colors blank to derive them automatically.
        </Trans>
      </p>
      <CustomThemePalette
        palette={draft[mode]}
        onChange={(palette) => setDraft({ ...draft, [mode]: palette })}
      />
      {!parsed.success ? (
        <p role="alert" className="text-xs text-danger">
          <Trans>Enter a theme name and valid hex colors in both palettes.</Trans>
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="text-xs text-danger">
          <Trans>
            The custom theme limit has been reached. Delete a theme before adding another.
          </Trans>
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" className="text-muted" onPress={props.onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button size="sm" variant="secondary" isDisabled={!parsed.success} onPress={exportTheme}>
          <Trans>Export theme</Trans>
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={!parsed.success}
          onPress={() => {
            if (!parsed.success) return;
            if (saveCustomTheme({ ...parsed.data, id: draft.id })) props.onClose();
            else setSaveError(true);
          }}
        >
          <Trans>Save and apply</Trans>
        </Button>
      </div>
    </div>
  );
}
