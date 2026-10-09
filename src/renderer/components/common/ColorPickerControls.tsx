import { ColorArea, ColorField, ColorSlider, ColorSwatch } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

/** Shared controls bound to the surrounding HeroUI ColorPicker context. */
export function ColorPickerControls() {
  const { t } = useLingui();
  return (
    <>
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
    </>
  );
}
