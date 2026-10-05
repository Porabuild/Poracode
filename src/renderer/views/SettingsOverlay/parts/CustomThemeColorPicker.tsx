import { useState } from "react";
import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  parseColor,
  type Color,
} from "@heroui/react";
import { Pipette } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { hexColorSchema } from "@/shared/customThemes";
import { Button } from "@/renderer/components/common";

export function CustomThemeColorPicker(props: {
  label: string;
  value: string;
  isOptional: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const { label } = props;
  const valid = hexColorSchema.safeParse(props.value).success;
  const seed = valid ? props.value : "#808080";
  const [color, setColor] = useState<Color>(() => parseColor(seed));
  const [previousValue, setPreviousValue] = useState(props.value);
  // Keep the picker in sync with typed values and palette changes. Preserve its
  // Color object while dragging so grayscale choices do not discard the hue.
  if (previousValue !== props.value) {
    setPreviousValue(props.value);
    setColor(parseColor(seed));
  }

  return (
    <ColorPicker
      className="shrink-0"
      value={color}
      onChange={(next) => {
        const hex = next.toString("hex").toLowerCase();
        setColor(next);
        setPreviousValue(hex);
        props.onChange(hex);
      }}
    >
      <ColorPicker.Trigger
        aria-label={t`Choose color for ${label}`}
        className="size-8 justify-center"
      >
        {valid ? <ColorSwatch size="xs" /> : <Pipette className="size-4 text-muted" />}
      </ColorPicker.Trigger>
      <ColorPicker.Popover className="gap-2">
        <span className="px-1 text-xs font-medium">{label}</span>
        <ColorArea
          aria-label={t`Saturation and brightness`}
          className="max-w-full"
          colorSpace="hsb"
          xChannel="saturation"
          yChannel="brightness"
        >
          <ColorArea.Thumb />
        </ColorArea>
        <ColorSlider aria-label={t`Hue`} channel="hue" className="px-1" colorSpace="hsb">
          <ColorSlider.Track>
            <ColorSlider.Thumb />
          </ColorSlider.Track>
        </ColorSlider>
        <ColorField aria-label={t`Hex color`}>
          <ColorField.Group variant="secondary">
            <ColorField.Prefix>
              <ColorSwatch size="xs" />
            </ColorField.Prefix>
            <ColorField.Input />
          </ColorField.Group>
        </ColorField>
        {props.isOptional && (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={props.value === ""}
            onPress={() => props.onChange("")}
          >
            <Trans>Automatic</Trans>
          </Button>
        )}
      </ColorPicker.Popover>
    </ColorPicker>
  );
}
