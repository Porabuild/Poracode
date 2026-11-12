import { use, useEffect, useEffectEvent, useState, type ComponentProps } from "react";
import { selectVariants } from "@heroui/styles";
import {
  ListBox,
  Select as HeroSelect,
  Tooltip,
  type SelectProps as HeroSelectProps,
} from "@heroui/react";
import { Check } from "lucide-react";
import { TooltipTriggerStateContext } from "react-aria-components";
import { pushEscapeHandler } from "@/renderer/components/layout/overlayEscapeStack";
import { ResponsiveMenuSurface, useResponsiveMenu } from "./ResponsiveMenuSurface";
import type { SelectOption } from "./Select";

export interface MultiSelectProps extends Omit<
  HeroSelectProps<object, "multiple">,
  "children" | "onChange" | "value" | "selectionMode" | "aria-label"
> {
  /** Accessible name; the visible label lives on the surrounding row. */
  "aria-label": string;
  options: readonly SelectOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Trigger text for the current selection, including the empty selection. */
  summary: string;
  popoverProps?: Omit<ComponentProps<typeof HeroSelect.Popover>, "children">;
}

/** Let an open tooltip dismiss before its enclosing overlay. */
function TooltipEscapeHandler() {
  const state = use(TooltipTriggerStateContext);
  const isOpen = state?.isOpen ?? false;
  const close = useEffectEvent(() => state?.close(true));
  useEffect(() => {
    if (!isOpen) return;
    return pushEscapeHandler(close);
  }, [isOpen]);
  return null;
}

/**
 * Multiple-choice counterpart of {@link Select}: the same HeroUI trigger and
 * popover on desktop and the same bottom sheet on compact layouts. The menu
 * stays open while options are toggled; the caller supplies the trigger text.
 */
export function MultiSelect(props: MultiSelectProps) {
  const { onChange, options, popoverProps, summary, value, ...rest } = props;
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const selected = value.filter((id) => options.some((option) => option.id === id));
  const accessibleName = rest["aria-label"];

  if (mobile) {
    const slots = selectVariants({ variant: rest.variant, fullWidth: rest.fullWidth });
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={accessibleName}
        trigger={
          <div
            className={slots.base({
              className: ["m-field-picker", typeof rest.className === "string" && rest.className],
            })}
          >
            <HeroSelect.Trigger
              className={slots.trigger()}
              aria-label={accessibleName}
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
              <span className={slots.value({ className: "min-w-0 truncate" })} title={summary}>
                {summary}
              </span>
              <HeroSelect.Indicator className={slots.indicator()} data-open={isOpen || undefined} />
            </HeroSelect.Trigger>
          </div>
        }
      >
        <div className="m-sheet-list">
          {options.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className="m-sheet-action"
                aria-pressed={isSelected}
                disabled={option.isDisabled}
                onClick={() =>
                  onChange(
                    isSelected
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id],
                  )
                }
              >
                {option.icon}
                <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
                {isSelected ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </button>
            );
          })}
        </div>
      </ResponsiveMenuSurface>
    );
  }

  return (
    <HeroSelect
      {...rest}
      selectionMode="multiple"
      value={selected}
      onChange={(keys) => onChange(keys.map(String))}
    >
      <Tooltip delay={300}>
        <HeroSelect.Trigger>
          <HeroSelect.Value className="min-w-0 truncate">{summary}</HeroSelect.Value>
          <HeroSelect.Indicator />
        </HeroSelect.Trigger>
        <Tooltip.Content placement="top" className="max-w-72 break-words">
          <TooltipEscapeHandler />
          {summary}
        </Tooltip.Content>
      </Tooltip>
      <HeroSelect.Popover {...popoverProps}>
        <ListBox>
          {options.map((option) => (
            // `pe-7` reserves room for the checkmark; see Select.
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
              {...(option.isDisabled ? { isDisabled: true } : {})}
              className="relative pe-7"
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}
