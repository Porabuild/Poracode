import { useState, type CSSProperties } from "react";
import { Label, Modal, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  themeDocumentSchema,
  themePaletteSchema,
  serializeThemeDocument,
  type CustomTheme,
} from "@/shared/customThemes";
import { downloadTextFile } from "@/renderer/utils/downloadTextFile";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { buildThemePreset } from "@/renderer/theme/themePresets";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Button, Input, Select } from "@/renderer/components/common";
import { ThemeSwatch } from "./ThemeSwatch";
import { CustomThemeContrast } from "./CustomThemeContrast";
import { CustomThemePalette } from "./CustomThemePalette";

export function CustomThemeEditor(props: { initial: CustomTheme; onClose: () => void }) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(props.initial);
  const appearance = useResolvedAppearance();
  const [mode, setMode] = useState<"light" | "dark">(appearance);
  const [saveError, setSaveError] = useState(false);
  const saveCustomTheme = useSharedSettings((state) => state.saveCustomTheme);
  const parsed = themeDocumentSchema.safeParse(draft);
  const otherMode = mode === "light" ? "dark" : "light";
  const hiddenPaletteInvalid = !themePaletteSchema.safeParse(draft[otherMode]).success;
  const invalidPaletteName = otherMode === "light" ? t`Light` : t`Dark`;
  const preview = parsed.success ? buildThemePreset({ ...parsed.data, id: draft.id }) : null;

  const exportTheme = () => {
    if (!parsed.success) return;
    downloadTextFile(
      "poracode-theme.json",
      serializeThemeDocument(parsed.data),
      "application/json",
    );
  };

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[640px]">
          <Modal.CloseTrigger aria-label={t`Close`} />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Custom theme</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="p-4">
            <div className="flex flex-col gap-3">
              <TextField
                isRequired
                value={draft.label}
                onChange={(label) => setDraft({ ...draft, label })}
              >
                <Label>
                  <Trans>Theme name</Trans>
                </Label>
                <Input maxLength={80} />
              </TextField>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Select
                  aria-label={t`Palette mode`}
                  isInvalid={hiddenPaletteInvalid}
                  className="w-[160px]"
                  options={[
                    { id: "light", label: t`Light` },
                    { id: "dark", label: t`Dark` },
                  ]}
                  value={mode}
                  onChange={(value) => setMode(value === "light" ? "light" : "dark")}
                />
                <div className={`flex gap-3 ${preview ? "" : "invisible"}`}>
                  <div className="space-y-1 text-xs text-muted">
                    <Trans>Light</Trans>
                    <ThemeSwatch vars={(preview?.light ?? {}) as CSSProperties} />
                  </div>
                  <div className="space-y-1 text-xs text-muted">
                    <Trans>Dark</Trans>
                    <ThemeSwatch vars={(preview?.dark ?? {}) as CSSProperties} />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted">
                <Trans>
                  Use #rgb or #rrggbb colors. Leave optional colors blank to derive them
                  automatically.
                </Trans>
              </p>
              <CustomThemePalette
                palette={draft[mode]}
                onChange={(palette) => setDraft({ ...draft, [mode]: palette })}
              />
              <CustomThemeContrast theme={draft} />
              {!parsed.success ? (
                <p className="text-xs text-danger">
                  {hiddenPaletteInvalid ? (
                    <Trans>Check the {invalidPaletteName} palette for invalid colors.</Trans>
                  ) : (
                    <Trans>Enter a theme name and valid hex colors in both palettes.</Trans>
                  )}
                </p>
              ) : null}
              {saveError ? (
                <p role="alert" className="text-xs text-danger">
                  <Trans>
                    The custom theme limit has been reached. Delete a theme before adding another.
                  </Trans>
                </p>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer className="flex-wrap">
            <Button slot="close" size="sm" variant="ghost" className="text-muted">
              <Trans>Cancel</Trans>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={!parsed.success}
              onPress={exportTheme}
            >
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
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
