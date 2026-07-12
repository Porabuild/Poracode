import { useState, type ComponentProps } from "react";
import {
  Label,
  ListBox,
  ListLayout,
  Select as HeroSelect,
  type SelectProps as HeroSelectProps,
  Virtualizer,
} from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, ChevronDown } from "lucide-react";
import {
  LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD,
  SELECT_DROPDOWN_ROW_HEIGHT,
} from "./dropdownVirtualization";
import { ResponsiveMenuSurface, useResponsiveMenu } from "./ResponsiveMenuSurface";

export interface SelectOption {
  id: string;
  label: string;
}

export interface SelectProps extends Omit<
  HeroSelectProps<object, "single">,
  "children" | "onChange" | "value"
> {
  label?: string;
  options: readonly SelectOption[];
  value?: string | null;
  onChange: (value: string) => void;
  popoverProps?: Omit<ComponentProps<typeof HeroSelect.Popover>, "children">;
}

export function Select(props: SelectProps) {
  const { label, onChange, options, popoverProps, value, ...rest } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const selectedValue = value && options.some((option) => option.id === value) ? value : null;
  const isVirtualized = options.length > LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD;

  // Mobile PWA: a HeroUI select-listbox popover anchored to a small trigger is
  // cramped on a phone. Render an input-styled trigger that opens a bottom
  // drawer of finger-sized rows instead. `mobile === isRemoteSession()`, so the
  // desktop HeroSelect below never runs on the phone and is left untouched.
  if (mobile) {
    const selectedOption = options.find((option) => option.id === selectedValue);
    const placeholder = typeof rest.placeholder === "string" ? rest.placeholder : t`Select…`;
    // Settings pass the field name via `aria-label` (the visible label lives on
    // the surrounding SettingRow), so fall back to it for the trigger + heading.
    const accessibleName = label ?? (rest["aria-label"] as string | undefined);
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={accessibleName ?? t`Select an option`}
        trigger={
          <button
            type="button"
            className="m-field-picker"
            {...(accessibleName ? { "aria-label": accessibleName } : {})}
            aria-expanded={isOpen}
            disabled={rest.isDisabled}
            onClick={() => {
              if (!rest.isDisabled) setIsOpen(true);
            }}
          >
            <span className={`flex-1 truncate ${selectedOption ? "" : "text-muted"}`}>
              {selectedOption?.label ?? placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted" />
          </button>
        }
      >
        <div className="m-sheet-list">
          {options.map((option) => {
            const selected = option.id === selectedValue;
            return (
              <button
                key={option.id}
                type="button"
                className="m-sheet-action"
                aria-pressed={selected || undefined}
                onClick={() => {
                  setIsOpen(false);
                  onChange(option.id);
                }}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      </ResponsiveMenuSurface>
    );
  }
  const listBox = (
    <ListBox {...(isVirtualized ? { className: "max-h-60 overflow-y-auto" } : {})}>
      {options.map((option) => (
        <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
          {option.label}
          <ListBox.ItemIndicator />
        </ListBox.Item>
      ))}
    </ListBox>
  );

  return (
    <HeroSelect
      {...rest}
      value={selectedValue}
      onChange={(nextValue) => onChange(nextValue == null ? "" : String(nextValue))}
    >
      {label ? <Label>{label}</Label> : null}
      <HeroSelect.Trigger>
        <HeroSelect.Value />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover {...popoverProps}>
        {isVirtualized ? (
          <Virtualizer
            layout={ListLayout}
            layoutOptions={{ rowHeight: SELECT_DROPDOWN_ROW_HEIGHT }}
          >
            {listBox}
          </Virtualizer>
        ) : (
          listBox
        )}
      </HeroSelect.Popover>
    </HeroSelect>
  );
}
