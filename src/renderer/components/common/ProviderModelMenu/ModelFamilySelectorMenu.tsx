import { startTransition, useId, useRef, useState, type ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { Tooltip } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import type { LabeledOption } from "@/shared/contracts";
import { Button } from "../Button";
import { ResponsiveMenuSurface, useResponsiveMenu } from "../ResponsiveMenuSurface";
import { ModelMenuSearchInput } from "./parts/ModelMenuSearchInput";
import { MODEL_MENU_ROW_HEIGHT, MODEL_MENU_ROW_HEIGHT_MOBILE } from "./parts/modelMenuRowMetrics";
import { useMenuSearchAutofocus } from "./parts/useMenuSearchAutofocus";

/** One selectable row in a family selector menu: an exact native option id plus its display. */
export interface ModelFamilySelectorOption extends LabeledOption {
  hint?: string;
}

/** Case-insensitive substring filter over a row's label and hint. */
function filterOptions(
  options: readonly ModelFamilySelectorOption[],
  query: string,
): readonly ModelFamilySelectorOption[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized
    ? options.filter((option) =>
        `${option.label} ${option.hint ?? ""}`.toLocaleLowerCase().includes(normalized),
      )
    : options;
}

/**
 * The trigger display for one value: the option's "Label · Hint" compound,
 * its plain label, or the raw value verbatim when the current selection is
 * not among the offered options.
 */
export function modelFamilySelectorDisplay(
  options: readonly ModelFamilySelectorOption[],
  value: string,
): string {
  const option = options.find((candidate) => candidate.id === value);
  if (!option) return value;
  return option.hint ? `${option.label} · ${option.hint}` : option.label;
}

/**
 * A single family selector (e.g. Main, Sidekick) as a composer menu with the
 * model picker's look and mechanics: ghost trigger with a two-line label,
 * search-first popover (bottom sheet on mobile), keyboard navigation, and a
 * case-insensitive label/hint filter over the relation's exact native
 * options. Selecting always forwards the exact option id — the relation
 * resolver owns which member it lands on.
 */
export function ModelFamilySelectorMenu(props: {
  /** Localized selector name — the trigger aria-label and menu heading. */
  label: string;
  icon: ReactNode;
  options: readonly ModelFamilySelectorOption[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  collapseTier?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const { label, options, value } = props;
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const domIdPrefix = useId();

  useMenuSearchAutofocus(isOpen, mobile, searchRef);

  /** Selected row's index inside the given list, or the first row. */
  function baselineIndex(rows: readonly ModelFamilySelectorOption[]) {
    return Math.max(
      0,
      rows.findIndex((option) => option.id === value),
    );
  }

  function handleOpenChange(open: boolean) {
    // Every open starts with an empty query and the selected row active.
    if (open) {
      setSearch("");
      setActiveIndex(baselineIndex(options));
    }
    setIsOpen(open);
    props.onOpenChange?.(open);
  }

  function handleSearchChange(query: string) {
    setSearch(query);
    // The active row follows the selection into the filtered list (else the
    // first row), so the next ArrowUp/Down or Enter starts predictably.
    setActiveIndex(baselineIndex(filterOptions(options, query)));
  }

  const filtered = filterOptions(options, search);
  const active = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  function moveActive(delta: number) {
    if (filtered.length === 0) return;
    const next = Math.max(0, Math.min(filtered.length - 1, active + delta));
    if (next === active) return;
    setActiveIndex(next);
    const row = listboxRef.current?.children[next];
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }

  function selectOption(option: ModelFamilySelectorOption | undefined) {
    if (!option || props.isDisabled) return;
    // Deliberate activations reach the owner even when the value equals the
    // current one: re-picking the stored value is still evidence the user
    // touched that selector (it can revoke or refresh selection-binding
    // evidence), and the owner's own equality checks suppress genuinely
    // unchanged persistence. Close synchronously so the popover starts
    // unmounting immediately, then mark the upstream state cascade as a
    // transition so the parent's resolution doesn't block the close animation.
    handleOpenChange(false);
    startTransition(() => props.onChange(option.id));
  }

  const display = modelFamilySelectorDisplay(options, value);
  const trigger = (
    <Button
      aria-label={label}
      isDisabled={props.isDisabled ?? false}
      size="sm"
      variant="ghost"
      className="poracode-composer-menu poracode-composer-model-control min-w-0 px-2.5"
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      {props.icon}
      <span
        data-collapse-tier={props.collapseTier}
        className={
          props.hideLabelOnWrap
            ? `poracode-composer-label-hideable flex min-w-0 flex-col items-start justify-center gap-0.5${props.forceHideLabel ? " is-hidden" : ""}`
            : "flex min-w-0 flex-col items-start justify-center gap-0.5"
        }
      >
        <span className="max-w-full truncate leading-tight">{display}</span>
        <span className="max-w-full truncate text-[10px] font-medium leading-tight text-muted/70">
          {label}
        </span>
      </span>
      <ChevronDown
        data-collapse-tier={props.collapseTier}
        className={
          props.hideLabelOnWrap
            ? `poracode-composer-label-hideable size-3.5 text-muted${props.forceHideLabel ? " is-hidden" : ""}`
            : "size-3.5 text-muted"
        }
      />
    </Button>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={label}
      trigger={
        props.hideLabelOnWrap && !mobile ? (
          <Tooltip>
            {trigger}
            <Tooltip.Content placement="top">
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-[10px] font-medium leading-tight text-muted/70">{label}</span>
                <span className="leading-tight">{display}</span>
              </span>
            </Tooltip.Content>
          </Tooltip>
        ) : (
          trigger
        )
      }
      placement="top start"
      contentClassName="w-72 p-0"
      dialogClassName="flex max-h-[28rem] flex-col overflow-hidden !p-0"
    >
      <ModelMenuSearchInput
        inputRef={searchRef}
        listboxId={`${domIdPrefix}-listbox`}
        expanded={isOpen}
        activeDescendantId={filtered.length > 0 ? `${domIdPrefix}-${active}` : undefined}
        value={search}
        onChange={handleSearchChange}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            handleOpenChange(false);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            selectOption(filtered[active] ?? filtered[0]);
            return;
          }
          if (filtered.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          }
        }}
      />
      {!mobile ? (
        <div
          role="presentation"
          className="poracode-model-menu-header poracode-model-menu-header--plain flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
        >
          {label}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <div className="px-3 py-3 text-center text-sm text-muted">
          <Trans>No models found</Trans>
        </div>
      ) : (
        <div
          ref={listboxRef}
          id={`${domIdPrefix}-listbox`}
          role="listbox"
          aria-label={label}
          className="poracode-model-menu-listbox no-scrollbar max-h-72 overflow-y-auto outline-none"
        >
          {filtered.map((option, index) => (
            <div
              key={option.id}
              id={`${domIdPrefix}-${index}`}
              role="option"
              aria-selected={option.id === value}
              data-active={index === active ? "true" : undefined}
              className="poracode-menu-item mx-1.5 flex cursor-default items-center text-foreground"
              style={{ height: mobile ? MODEL_MENU_ROW_HEIGHT_MOBILE : MODEL_MENU_ROW_HEIGHT }}
              // Keeps press focus in the search field, like the model rows.
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectOption(option);
                }
              }}
              tabIndex={-1}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {option.hint ? (
                <span className="shrink-0 text-[10px] leading-none text-muted/60">
                  · {option.hint}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </ResponsiveMenuSurface>
  );
}
