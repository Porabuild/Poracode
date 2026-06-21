import { useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Selection } from "@heroui/react";
import { Label, ListBox, ListLayout, Popover, Tooltip, Virtualizer } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "./Button";
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
  const normalizedOptions = options.map((option) =>
    typeof option === "string"
      ? { id: option, label: option, icon: undefined, hint: undefined }
      : option,
  );
  const currentValue =
    normalizedOptions.find((option) => option.id === value)?.label || value || resolvedPlaceholder;
  const effectiveTooltip = tooltip ?? (hideLabelOnWrap || iconOnly ? currentValue : undefined);
  const buttonProps = className ? { className } : {};

  const button = (
    <Button
      aria-label={resolvedPlaceholder}
      isDisabled={isDisabled || normalizedOptions.length === 0}
      size="sm"
      variant={buttonVariant}
      {...buttonProps}
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

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };
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

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        {effectiveTooltip ? (
          <Tooltip>
            {button}
            <Tooltip.Content placement="top">{effectiveTooltip}</Tooltip.Content>
          </Tooltip>
        ) : (
          button
        )}
      </Popover.Trigger>
      {isOpen ? (
        <Popover.Content placement="top" className="p-0">
          <Popover.Dialog className="overflow-hidden">
            {isVirtualized ? (
              <Virtualizer
                layout={ListLayout}
                layoutOptions={{ padding: 4, rowHeight: MENU_DROPDOWN_ROW_HEIGHT }}
              >
                {listBox}
              </Virtualizer>
            ) : (
              listBox
            )}
          </Popover.Dialog>
        </Popover.Content>
      ) : null}
    </Popover>
  );
}
