import type { ReactNode } from "react";
import type { Selection } from "@heroui/react";
import { Dropdown, Label, Tooltip } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "./Button";

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
  iconOnly?: boolean;
  tooltip?: string | undefined;
}

export function OptionMenu(props: OptionMenuProps) {
  const {
    value,
    options,
    onChange,
    icon,
    placeholder = "Select",
    isDisabled = false,
    className,
    buttonVariant = "secondary",
    hideLabelOnWrap = false,
    iconOnly = false,
    tooltip,
  } = props;
  const normalizedOptions = options.map((option) =>
    typeof option === "string"
      ? { id: option, label: option, icon: undefined, hint: undefined }
      : option,
  );
  const currentValue =
    normalizedOptions.find((option) => option.id === value)?.label || value || placeholder;
  const effectiveTooltip = tooltip ?? (iconOnly ? currentValue : undefined);
  const buttonProps = className ? { className } : {};

  const button = (
    <Button
      aria-label={placeholder}
      isDisabled={isDisabled || normalizedOptions.length === 0}
      size="sm"
      variant={buttonVariant}
      {...buttonProps}
    >
      {icon}
      {!iconOnly && (
        <span className={hideLabelOnWrap ? "lightcode-composer-label-hideable truncate" : "truncate"}>
          {currentValue}
        </span>
      )}
      {!iconOnly && (
        <ChevronDown
          className={
            hideLabelOnWrap
              ? "lightcode-composer-label-hideable size-3.5 text-muted"
              : "size-3.5 text-muted"
          }
        />
      )}
    </Button>
  );

  return (
    <Dropdown>
      {effectiveTooltip ? (
        <Tooltip>
          {button}
          <Tooltip.Content placement="top">{effectiveTooltip}</Tooltip.Content>
        </Tooltip>
      ) : (
        button
      )}
      <Dropdown.Popover placement="top">
        <Dropdown.Menu
          aria-label="Options"
          selectedKeys={new Set([value])}
          selectionMode="single"
          onSelectionChange={(keys: Selection) => {
            if (keys === "all") return;
            const selected = [...keys][0];
            if (selected !== undefined) {
              onChange(String(selected));
            }
          }}
        >
          {normalizedOptions.map((option) => (
            <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
              <Dropdown.ItemIndicator />
              {option.icon}
              <Label>{option.label}</Label>
              {option.hint && (
                <span className="ms-auto text-xs text-muted">{option.hint}</span>
              )}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
