import { useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Selection } from "@heroui/react";
import { Label, ListBox, ListLayout, Tooltip, Virtualizer } from "@heroui/react";
import { Check, ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "./Button";
import { ResponsiveMenuSurface, useResponsiveMenu } from "./ResponsiveMenuSurface";
import {
  LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD,
  MENU_DROPDOWN_ROW_HEIGHT,
  VIRTUALIZED_MENU_DROPDOWN_ITEM_CLASS,
} from "./dropdownVirtualization";

export interface OptionMenuProps {
  value: string;
  options: readonly (string | { id: string; label: string; icon?: ReactNode; hint?: string })[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  buttonVariant?: ButtonProps["variant"];
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  collapseTier?: number;
  iconOnly?: boolean;
  tooltip?: string | undefined;
  onOpenChange?: (open: boolean) => void;
}

export function OptionMenu(props: OptionMenuProps) {
  const { t } = useLingui();
  const {
    value,
    options,
    onChange,
    icon,
    placeholder,
    isDisabled = false,
    className,
    buttonVariant = "secondary",
    hideLabelOnWrap = false,
    forceHideLabel = false,
    collapseTier,
    iconOnly = false,
    tooltip,
    onOpenChange,
  } = props;
  const resolvedPlaceholder = placeholder ?? t`Select`;
  const [isOpen, setIsOpen] = useState(false);
  const { mobile } = useResponsiveMenu();
  const normalizedOptions = options.map((option) =>
    typeof option === "string"
      ? { id: option, label: option, icon: undefined, hint: undefined }
      : option,
  );
  const currentValue =
    normalizedOptions.find((option) => option.id === value)?.label || value || resolvedPlaceholder;
  const effectiveTooltip = tooltip ?? (hideLabelOnWrap || iconOnly ? currentValue : undefined);
  const buttonProps = className ? { className } : {};

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  const button = (
    <Button
      aria-label={resolvedPlaceholder}
      isDisabled={isDisabled || normalizedOptions.length === 0}
      size="sm"
      variant={buttonVariant}
      {...buttonProps}
      // On mobile there is no HeroUI Popover.Trigger wiring the press, so open
      // the drawer directly from the trigger.
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      {icon}
      {!iconOnly && (
        <span
          data-collapse-tier={collapseTier}
          className={
            hideLabelOnWrap
              ? `lightcode-composer-label-hideable truncate${forceHideLabel ? " is-hidden" : ""}`
              : "truncate"
          }
        >
          {currentValue}
        </span>
      )}
      {!iconOnly && (
        <ChevronDown
          data-collapse-tier={collapseTier}
          className={
            hideLabelOnWrap
              ? `lightcode-composer-label-hideable size-3.5 text-muted${forceHideLabel ? " is-hidden" : ""}`
              : "size-3.5 text-muted"
          }
        />
      )}
    </Button>
  );
  const selectedKeys = value ? new Set([value]) : new Set<string>();
  const isVirtualized = normalizedOptions.length > LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD;
  const listBoxClassName = isVirtualized
    ? `lightcode-menu max-h-60 overflow-y-auto ${VIRTUALIZED_MENU_DROPDOWN_ITEM_CLASS}`
    : "lightcode-menu max-h-60 overflow-y-auto";
  const listBox = (
    <ListBox
      aria-label={t`Options`}
      className={listBoxClassName}
      items={normalizedOptions}
      selectedKeys={selectedKeys}
      selectionMode="single"
      disallowEmptySelection
      onSelectionChange={(keys: Selection) => {
        if (keys === "all") return;
        const selected = [...keys][0];
        if (selected !== undefined) {
          handleOpenChange(false);
          onChange(String(selected));
        }
      }}
    >
      {(option) => (
        <ListBox.Item
          id={option.id}
          textValue={option.label}
          className="focus-visible:outline-none"
        >
          <ListBox.ItemIndicator />
          {option.icon}
          <Label className="flex-1 truncate">{option.label}</Label>
          {option.hint && (
            <span className="ms-auto truncate text-xs text-muted">{option.hint}</span>
          )}
        </ListBox.Item>
      )}
    </ListBox>
  );

  // On mobile the drawer renders full-width rows with finger-sized tap targets
  // (the desktop ListBox rows are ~28px), mirroring the mobile shell's SheetMenu.
  const mobileList = (
    <div className="m-sheet-list">
      {normalizedOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          className="m-sheet-action"
          aria-pressed={option.id === value || undefined}
          onClick={() => {
            handleOpenChange(false);
            onChange(option.id);
          }}
        >
          {option.icon}
          <span className="flex-1 truncate">{option.label}</span>
          {option.hint ? <span className="shrink-0 text-xs text-muted">{option.hint}</span> : null}
          {option.id === value ? <Check className="size-4 shrink-0 text-accent" /> : null}
        </button>
      ))}
    </div>
  );

  const desktopTrigger = effectiveTooltip ? (
    <Tooltip>
      {button}
      <Tooltip.Content placement="top">{effectiveTooltip}</Tooltip.Content>
    </Tooltip>
  ) : (
    button
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={resolvedPlaceholder}
      // Mobile drops the tooltip wrapper (no hover) and presses open the drawer.
      trigger={mobile ? button : desktopTrigger}
      placement="top"
      contentClassName="p-0"
      dialogClassName="overflow-hidden"
    >
      {mobile ? (
        mobileList
      ) : isVirtualized ? (
        <Virtualizer
          layout={ListLayout}
          layoutOptions={{ padding: 4, rowHeight: MENU_DROPDOWN_ROW_HEIGHT }}
        >
          {listBox}
        </Virtualizer>
      ) : (
        listBox
      )}
    </ResponsiveMenuSurface>
  );
}
