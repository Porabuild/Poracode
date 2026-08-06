import { useEffect, useState } from "react";
import { Slider } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { PrAutomationMode } from "@/shared/contracts";

const MODE_VALUES: Record<PrAutomationMode, number> = {
  off: 0,
  fix: 1,
  merge: 2,
};

function numericValue(value: number | number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : value;
}

function modeForValue(value: number | number[]): PrAutomationMode {
  const numeric = numericValue(value);
  if (numeric >= 2) return "merge";
  return numeric >= 1 ? "fix" : "off";
}

export function PrAutomationSlider(props: {
  value: PrAutomationMode;
  onChange: (mode: PrAutomationMode) => void | boolean | Promise<void | boolean>;
  ariaLabel: string;
  className?: string | undefined;
  isDisabled?: boolean | undefined;
}) {
  const [draftValue, setDraftValue] = useState(MODE_VALUES[props.value]);
  const draftMode = modeForValue(draftValue);

  useEffect(() => {
    setDraftValue(MODE_VALUES[props.value]);
  }, [props.value]);

  async function commit(value: number | number[]): Promise<void> {
    const nextMode = modeForValue(value);
    if (nextMode === props.value) return;
    const accepted = await props.onChange(nextMode);
    if (accepted === false) setDraftValue(MODE_VALUES[props.value]);
  }

  return (
    <div className={props.className}>
      <Slider
        aria-label={props.ariaLabel}
        {...(props.isDisabled !== undefined ? { isDisabled: props.isDisabled } : {})}
        minValue={0}
        maxValue={2}
        step={1}
        value={draftValue}
        onChange={(value) => setDraftValue(numericValue(value))}
        onChangeEnd={(value) => void commit(value)}
      >
        <Slider.Track className="h-5 rounded-full bg-foreground/15">
          <Slider.Fill className="bg-accent" />
          <Slider.Thumb className="border-0 bg-accent shadow-sm after:bg-white" />
        </Slider.Track>
      </Slider>
      <div aria-hidden="true" className="mt-1.5 grid grid-cols-3 text-[10px] leading-none">
        <span className={draftMode === "off" ? "font-medium text-accent" : "text-muted"}>
          <Trans>Off</Trans>
        </span>
        <span
          className={`text-center ${
            draftMode === "fix" ? "font-medium text-accent" : "text-muted"
          }`}
        >
          <Trans>Auto Fix</Trans>
        </span>
        <span
          className={`text-right ${
            draftMode === "merge" ? "font-medium text-accent" : "text-muted"
          }`}
        >
          <Trans>Auto Merge</Trans>
        </span>
      </div>
    </div>
  );
}
