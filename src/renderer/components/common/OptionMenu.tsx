import type { ReactNode } from "react";
import { Dropdown, Label } from "@heroui/react";
import { Check, ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "./Button";

export interface OptionMenuProps {
  value: string;
  options: readonly (string | { id: string; label: string })[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
  buttonVariant?: ButtonProps["variant"];
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
  } = props;
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { id: option, label: option } : option,
  );
  const currentValue =
    normalizedOptions.find((option) => option.id === value)?.label || value || placeholder;
  const buttonProps = className ? { className } : {};

  return (
    <Dropdown>
      <Button
        aria-label={placeholder}
        isDisabled={isDisabled || normalizedOptions.length === 0}
        size="sm"
        variant={buttonVariant}
        {...buttonProps}
      >
        {icon}
        <span className="truncate">{currentValue}</span>
        <ChevronDown className="size-3.5 text-muted" />
      </Button>
      <Dropdown.Popover className="min-w-[200px] rounded-2xl border border-border bg-overlay/95 p-1 shadow-xl">
        <Dropdown.Menu
          aria-label="Options"
          className="rounded-xl"
          onAction={(key) => onChange(String(key))}
        >
          {normalizedOptions.map((option) => (
            <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
              <div className="flex w-full items-center justify-between gap-4">
                <Label>{option.label}</Label>
                {option.id === value ? <Check className="size-3.5 text-accent" /> : null}
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
