import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { usePanelStore } from "@/renderer/state/panelStore";
import { CrewRosterPanel } from "./CrewRosterPanel";
import type { CrewRosterModel } from "./crewComposerModel";

export function CrewRosterMenu(props: {
  model: CrewRosterModel;
  isDisabled?: boolean;
  openSignal?: number;
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  collapseTier?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const isDisabled = props.isDisabled ?? props.model.isDisabled;

  const [previousOpenSignal, setPreviousOpenSignal] = useState({
    signal: props.openSignal,
    disabled: isDisabled,
  });
  if (
    previousOpenSignal.signal !== props.openSignal ||
    previousOpenSignal.disabled !== isDisabled
  ) {
    setPreviousOpenSignal({ signal: props.openSignal, disabled: isDisabled });
    if (props.openSignal !== undefined && props.openSignal > 0 && !isDisabled) setIsOpen(true);
  }

  const settingsOpen = usePanelStore((state) => state.settingsOpen);
  const [previousSettingsOpen, setPreviousSettingsOpen] = useState(settingsOpen);
  if (previousSettingsOpen !== settingsOpen) {
    setPreviousSettingsOpen(settingsOpen);
    if (settingsOpen && isOpen) setIsOpen(false);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    props.onOpenChange?.(open);
  }

  const hideLabel = props.hideLabelOnWrap && props.forceHideLabel;
  const panelModel = props.model.onHandOff
    ? {
        ...props.model,
        onHandOff: () => {
          props.model.onHandOff?.();
          handleOpenChange(false);
        },
      }
    : props.model;
  const trigger = (
    <Button
      aria-label={t`Crew members`}
      aria-expanded={isOpen}
      isDisabled={isDisabled}
      size="sm"
      variant="ghost"
      className="poracode-composer-menu min-w-0 px-2.5"
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      <SlidersHorizontal className="size-3.5 shrink-0" />
      {mobile ? (
        <span className="min-w-0 truncate text-xs">{t`+${props.model.binding.roles.length}`}</span>
      ) : (
        <span
          data-collapse-tier={props.collapseTier}
          className={`poracode-composer-label-hideable min-w-0 truncate${
            hideLabel ? " is-hidden" : ""
          }`}
        >
          {props.model.summary}
        </span>
      )}
      <ChevronDown
        data-collapse-tier={props.collapseTier}
        className={`poracode-composer-label-hideable size-3.5 shrink-0 text-muted${
          hideLabel ? " is-hidden" : ""
        }`}
      />
    </Button>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={props.model.binding.name ?? t`Crew members`}
      hideSheetHeader
      trigger={trigger}
      placement="top start"
      contentClassName="w-[320px] max-w-[calc(100vw-2rem)] p-0"
      dialogClassName="flex max-h-[min(42rem,85vh)] flex-col overflow-y-auto !p-0"
      sheetClassName="m-sheet--crew-roster"
    >
      {() => (
        <CrewRosterPanel
          model={panelModel}
          compact={mobile}
          onClose={() => handleOpenChange(false)}
        />
      )}
    </ResponsiveMenuSurface>
  );
}
