import { useState } from "react";
import { ColorField, ColorPicker, ColorSwatch, Label, parseColor, type Color } from "@heroui/react";
import { Pipette } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { hexColorSchema } from "@/shared/customThemes";
import { Button } from "@/renderer/components/common";
import { ColorPickerControls } from "@/renderer/components/common/ColorPickerControls";

export function CustomThemeColorField(props: {
  label: string;
  value: string;
  isOptional: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const { label } = props;
  const valid = hexColorSchema.safeParse(props.value).success;
  const invalid = (!props.isOptional || props.value !== "") && !valid;
  const seed = valid ? props.value : "#808080";
  const [color, setColor] = useState<Color>(() => parseColor(seed));
  const [previousValue, setPreviousValue] = useState(props.value);
  // Keep the picker in sync with typed values and palette changes. Preserve its
  // Color object while dragging so grayscale choices do not discard the hue.
  if (previousValue !== props.value) {
    setPreviousValue(props.value);
    setColor(parseColor(seed));
  }

  const commitColor = (next: Color) => {
    const hex = next.toString("hex").toLowerCase();
    setColor(next);
    setPreviousValue(hex);
    props.onChange(hex);
  };

  return (
    <ColorPicker className="h-full min-w-0 w-full" value={color} onChange={commitColor}>
      <ColorField
        className="min-w-0 w-full"
        isRequired={!props.isOptional}
        isInvalid={invalid}
        value={valid ? color : null}
        onChange={(next) => {
          if (next) commitColor(next);
        }}
      >
        <Label className="text-xs [overflow-wrap:anywhere]">{label}</Label>
        <ColorField.Group className="mt-auto" variant="secondary">
          <ColorField.Input
            value={props.value}
            maxLength={7}
            placeholder={props.isOptional ? t`Automatic` : "#rrggbb"}
            className="min-w-0 font-mono text-xs"
            onChange={(event) => props.onChange(event.target.value.trim())}
          />
          <ColorField.Suffix className="me-1">
            <ColorPicker.Trigger
              aria-label={t`Choose color for ${label}`}
              className="size-8 justify-center"
            >
              {valid ? <ColorSwatch size="xs" /> : <Pipette className="size-4 text-muted" />}
            </ColorPicker.Trigger>
          </ColorField.Suffix>
        </ColorField.Group>
      </ColorField>
      <ColorPicker.Popover className="gap-2">
        <span className="px-1 text-xs font-medium">{label}</span>
        <ColorPickerControls />
        {props.isOptional && (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={props.value === ""}
            onPress={(event) => {
              props.onChange("");
              // Focus a stable control before this action becomes disabled.
              event.target
                .closest('[data-slot="color-picker-popover"]')
                ?.querySelector<HTMLInputElement>('input[type="text"]')
                ?.focus();
            }}
          >
            <Trans>Automatic</Trans>
          </Button>
        )}
      </ColorPicker.Popover>
    </ColorPicker>
  );
}
