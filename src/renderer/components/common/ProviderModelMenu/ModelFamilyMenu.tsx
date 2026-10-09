import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Tooltip } from "@heroui/react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "../Button";
import { ResponsiveMenuSurface, useResponsiveMenu } from "../ResponsiveMenuSurface";
import {
  ModelConfigurationPanel,
  type ModelConfigurationPanelProps,
} from "./ModelConfigurationPanel";
import { modelFamilyMenuSummary } from "./ModelConfigurationPanel.types";

/** Provider-opted-in paired settings, independent of the ordinary model menu. */
export function ModelFamilyMenu(props: ModelConfigurationPanelProps) {
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [previousRequest, setPreviousRequest] = useState({
    signal: props.openSignal,
    disabled: props.isDisabled,
  });
  if (
    previousRequest.signal !== props.openSignal ||
    previousRequest.disabled !== props.isDisabled
  ) {
    setPreviousRequest({ signal: props.openSignal, disabled: props.isDisabled });
    if (props.openSignal !== undefined && !props.isDisabled) setIsOpen(true);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    props.onOpenChange?.(open);
  }

  const summary = modelFamilyMenuSummary(props.familySelection);
  const hideable = props.hideLabelOnWrap
    ? `poracode-composer-label-hideable${props.forceHideLabel ? " is-hidden" : ""}`
    : "";
  const trigger = (
    <Button
      aria-label={t`Model pairing`}
      isDisabled={props.isDisabled ?? false}
      size="sm"
      variant="ghost"
      className="poracode-composer-menu poracode-composer-effort-control min-w-0 px-2.5"
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      <SlidersHorizontal className="size-4 shrink-0" />
      <span data-collapse-tier={props.collapseTier} className={`truncate ${hideable}`}>
        {summary}
      </span>
      <ChevronDown
        data-collapse-tier={props.collapseTier}
        className={`size-3.5 text-muted ${hideable}`}
      />
    </Button>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={t`Model pairing`}
      trigger={
        props.hideLabelOnWrap && !mobile ? (
          <Tooltip>
            {trigger}
            <Tooltip.Content placement="top">{summary}</Tooltip.Content>
          </Tooltip>
        ) : (
          trigger
        )
      }
      placement="top start"
      contentClassName="w-[30rem] max-w-[calc(100vw-2rem)] p-0"
      dialogClassName="flex max-h-[min(42rem,85vh)] flex-col overflow-y-auto !p-0"
    >
      <ModelConfigurationPanel {...props} mobile={mobile} />
    </ResponsiveMenuSurface>
  );
}
