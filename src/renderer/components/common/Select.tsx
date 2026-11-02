import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { selectVariants } from "@heroui/styles";
import {
  Description,
  Label,
  ListBox,
  ListLayout,
  Select as HeroSelect,
  type SelectProps as HeroSelectProps,
  Virtualizer,
} from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react";
import {
  LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD,
  SELECT_DROPDOWN_ROW_HEIGHT,
} from "./dropdownVirtualization";
import { ResponsiveMenuSurface, useResponsiveMenu } from "./ResponsiveMenuSurface";

export interface SelectOption {
  id: string;
  label: string;
  icon?: ReactNode;
  detail?: string;
  /** Listed but not selectable (e.g. an offline remote machine). */
  isDisabled?: boolean;
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
  const labelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [focusState, setFocusState] = useState({ isFocused: false, isFocusVisible: false });
  const selectedValue = value && options.some((option) => option.id === value) ? value : null;
  const selectedOption = options.find((option) => option.id === selectedValue);
  const isVirtualized = options.length > LARGE_DROPDOWN_VIRTUALIZATION_THRESHOLD;
  const selectedContent = selectedOption ? (
    <span className="flex min-w-0 items-center gap-2">
      {selectedOption.icon}
      <span className="min-w-0 truncate">{selectedOption.label}</span>
    </span>
  ) : null;

  // Share HeroUI's trigger components and slots; only the menu surface changes.
  if (mobile) {
    const slots = selectVariants({ variant: rest.variant, fullWidth: rest.fullWidth });
    const placeholder = typeof rest.placeholder === "string" ? rest.placeholder : t`Select…`;
    const style =
      typeof rest.style === "function"
        ? rest.style({
            ...focusState,
            isDisabled: rest.isDisabled ?? false,
            isOpen,
            isInvalid: rest.isInvalid ?? false,
            isRequired: rest.isRequired ?? false,
            defaultStyle: {},
          })
        : rest.style;
    // Settings pass the field name via `aria-label` (the visible label lives on
    // the surrounding SettingRow), so fall back to it for the trigger + heading.
    const accessibleName = label ?? (rest["aria-label"] as string | undefined);
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={accessibleName ?? t`Select an option`}
        trigger={
          <div
            className={slots.base({
              className: ["m-field-picker", typeof rest.className === "string" && rest.className],
            })}
            id={rest.id}
            style={style}
            data-invalid={rest.isInvalid || undefined}
            onFocus={(event) => {
              setFocusState({
                isFocused: true,
                isFocusVisible:
                  event.target instanceof HTMLElement && event.target.matches(":focus-visible"),
              });
              rest.onFocus?.(event);
            }}
            onBlur={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
                return;
              }
              setFocusState({ isFocused: false, isFocusVisible: false });
              rest.onBlur?.(event);
            }}
          >
            {label ? <Label id={labelId}>{label}</Label> : null}
            <HeroSelect.Trigger
              className={slots.trigger()}
              {...(accessibleName ? { "aria-label": accessibleName } : {})}
              {...(label
                ? { "aria-labelledby": labelId }
                : rest["aria-labelledby"] !== undefined
                  ? { "aria-labelledby": rest["aria-labelledby"] }
                  : {})}
              {...(rest["aria-describedby"] !== undefined
                ? { "aria-describedby": rest["aria-describedby"] }
                : {})}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              {...(rest.isDisabled !== undefined ? { isDisabled: rest.isDisabled } : {})}
              onPress={() => setIsOpen(true)}
              onKeyDown={(event) => {
                if (!rest.isDisabled && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();
                  setIsOpen(true);
                }
              }}
            >
              <span
                className={slots.value({ className: "min-w-0" })}
                data-slot="select-value"
                data-placeholder={!selectedOption || undefined}
              >
                {selectedContent ?? placeholder}
              </span>
              <HeroSelect.Indicator className={slots.indicator()} data-open={isOpen || undefined} />
            </HeroSelect.Trigger>
          </div>
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
                disabled={option.isDisabled}
                onClick={() => {
                  setIsOpen(false);
                  onChange(option.id);
                }}
              >
                {option.icon}
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="min-w-0 truncate font-mono text-[11px] text-muted/70">
                      {option.detail}
                    </span>
                  ) : null}
                </div>
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
        // HeroUI's select popover sets `px-2.5` on items with the same
        // specificity as the base `:has(.list-box-item__indicator) { pe-7 }`
        // rule but later in import order, collapsing the end padding that
        // reserves room for the checkmark so it overlaps long labels. The
        // `pe-7` utility (utilities layer) restores it.
        <ListBox.Item
          key={option.id}
          id={option.id}
          textValue={option.label}
          // Inside a Select the collection ignores the ListBox's disabledKeys,
          // so each item carries its own disabled state.
          {...(option.isDisabled ? { isDisabled: true } : {})}
          className="relative pe-7"
        >
          {option.icon || option.detail ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {option.icon}
              <div className="flex min-w-0 flex-1 flex-col py-0.5">
                <Label className="truncate text-sm font-medium text-foreground">
                  {option.label}
                </Label>
                {option.detail ? (
                  <Description className="truncate font-mono text-[11px] text-muted">
                    {option.detail}
                  </Description>
                ) : null}
              </div>
            </div>
          ) : (
            option.label
          )}
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
        {/* min-w-0 lets a long selected label shrink and truncate instead of overflowing the trigger. */}
        <HeroSelect.Value className="min-w-0">
          {({ defaultChildren, isPlaceholder }) => {
            if (isPlaceholder || !selectedOption) return defaultChildren;
            return selectedContent;
          }}
        </HeroSelect.Value>
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
