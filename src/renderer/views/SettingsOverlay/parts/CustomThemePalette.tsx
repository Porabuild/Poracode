import { Label, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { hexColorSchema, type ThemePalette } from "@/shared/customThemes";
import { Input, ToggleSwitch } from "@/renderer/components/common";
import { CustomThemeColorPicker } from "./CustomThemeColorPicker";

export function CustomThemePalette(props: {
  palette: ThemePalette;
  onChange: (palette: ThemePalette) => void;
}) {
  const { t } = useLingui();
  const fields = [
    { key: "bg", label: t`Background`, required: true },
    { key: "surface", label: t`Surface`, required: true },
    { key: "fg", label: t`Text color`, required: true },
    { key: "accent", label: t`Accent`, required: true },
    { key: "accentFg", label: t`Text on accent`, required: true },
    { key: "border", label: t`Border`, required: true },
    { key: "sidebar", label: t`Sidebar background`, required: false },
    { key: "content", label: t`Content background`, required: false },
    { key: "composer", label: t`Composer background`, required: false },
    { key: "sidebarRowActive", label: t`Selected sidebar row`, required: false },
  ] as const;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fields.map(({ key, label, required }) => {
          const value = props.palette[key] ?? "";
          const invalid = (required || value !== "") && !hexColorSchema.safeParse(value).success;
          const changeColor = (color: string) => {
            const next = { ...props.palette };
            if (!required && color === "") delete next[key];
            else next[key] = color;
            props.onChange(next);
          };
          return (
            <TextField key={key} isRequired={required} isInvalid={invalid} className="min-w-0">
              <Label className="text-xs [overflow-wrap:anywhere]">{label}</Label>
              <div className="mt-auto flex items-center gap-1">
                <Input
                  aria-label={label}
                  value={value}
                  maxLength={7}
                  placeholder={required ? "#rrggbb" : t`Automatic`}
                  className="min-w-0 flex-1 font-mono text-xs"
                  onChange={(event) => changeColor(event.target.value.trim())}
                />
                <CustomThemeColorPicker
                  label={label}
                  value={value}
                  isOptional={!required}
                  onChange={changeColor}
                />
              </div>
            </TextField>
          );
        })}
      </div>
      <ToggleSwitch
        aria-label={t`Use sidebar background for the docked sidebar`}
        isSelected={props.palette.sidebarFill ?? false}
        onChange={(sidebarFill) => props.onChange({ ...props.palette, sidebarFill })}
      >
        {t`Use sidebar background for the docked sidebar`}
      </ToggleSwitch>
    </div>
  );
}
