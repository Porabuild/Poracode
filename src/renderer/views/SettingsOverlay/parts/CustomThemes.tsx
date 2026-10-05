import { useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  CUSTOM_THEME_VERSION,
  MAX_THEME_JSON_LENGTH,
  parseThemeDocument,
  type CustomTheme,
} from "@/shared/customThemes";
import { THEME_SPECS, getThemePreset } from "@/renderer/theme/themePresets";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Button, ConfirmDialog } from "@/renderer/components/common";
import { CustomThemeEditor } from "./CustomThemeEditor";

export function CustomThemes() {
  const { t } = useLingui();
  const themePreset = useSharedSettings((state) => state.themePreset);
  const customThemes = useSharedSettings((state) => state.customThemes);
  const removeCustomTheme = useSharedSettings((state) => state.removeCustomTheme);
  const activeCustom = customThemes.find((theme) => theme.id === themePreset);
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  const [deleting, setDeleting] = useState<CustomTheme | null>(null);
  const [importError, setImportError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importGeneration = useRef(0);

  const importFile = async (file: File) => {
    const generation = ++importGeneration.current;
    try {
      const doc = file.size <= MAX_THEME_JSON_LENGTH ? parseThemeDocument(await file.text()) : null;
      if (generation !== importGeneration.current) return;
      setImportError(!doc);
      if (doc) setEditing({ ...doc, id: `custom:${crypto.randomUUID()}` });
    } catch {
      if (generation === importGeneration.current) setImportError(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            importGeneration.current++;
            setImportError(false);
            const source =
              activeCustom ??
              THEME_SPECS.find((spec) => spec.id === getThemePreset(themePreset).id) ??
              THEME_SPECS[0]!;
            setEditing({
              ...source,
              version: CUSTOM_THEME_VERSION,
              id: `custom:${crypto.randomUUID()}`,
              label: t`My theme`,
            });
          }}
        >
          <Trans>Create custom theme</Trans>
        </Button>
        <Button size="sm" variant="secondary" onPress={() => fileInput.current?.click()}>
          <Trans>Import theme</Trans>
        </Button>
        {activeCustom ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                importGeneration.current++;
                setEditing(activeCustom);
              }}
            >
              <Trans>Edit theme</Trans>
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setDeleting(activeCustom)}>
              <Trans>Delete theme</Trans>
            </Button>
          </>
        ) : null}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label={t`Import theme`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      {importError ? (
        <p role="alert" className="text-xs text-danger">
          <Trans>
            Could not import this theme. Use a version 1 theme JSON file under 32 KB with a name and
            valid light and dark palettes.
          </Trans>
        </p>
      ) : null}
      {editing ? (
        <CustomThemeEditor
          key={editing.id}
          initial={editing}
          onClose={() => {
            importGeneration.current++;
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deleting !== null}
        title={t`Delete theme`}
        body={t`Delete this custom theme? If it is active, Poracode will use the default theme.`}
        confirmLabel={t`Delete`}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) removeCustomTheme(deleting.id);
          setDeleting(null);
          if (editing?.id === deleting?.id) setEditing(null);
        }}
      />
    </div>
  );
}
