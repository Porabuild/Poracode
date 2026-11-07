import { Tooltip } from "@heroui/react";
import { Check } from "lucide-react";
import type { KeyboardEventHandler, ReactNode } from "react";
import type { UserInputOption } from "@/shared/contracts";
import { useOverflowTooltip } from "./useOverflowTooltip";

/** Row chrome shared by choice rows and the inline custom-answer row; mirrors sidebar rows. */
export function questionRowClassName(active: boolean): string {
  return `flex w-full items-start gap-2.5 rounded-3xl px-2.5 py-1.5 text-left transition-colors outline-none focus-visible:focus-ring ${
    active
      ? "bg-accent/10 hover:bg-accent/15 focus-visible:bg-accent/15"
      : "hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)]"
  }`;
}

/** A row whose body is an inline text input (custom answers and entries). */
export function questionInputRowClassName(active: boolean, dimmed: boolean): string {
  return `${questionRowClassName(active)} cursor-text focus-within:bg-[var(--row-hover)] ${dimmed ? "opacity-60" : ""}`;
}

/** Borderless text input that sits inside a row like a label. */
export const questionRowInputClassName =
  "h-4 min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-xs leading-4 font-medium text-foreground shadow-none placeholder:font-normal placeholder:text-[color:var(--muted)] hover:bg-transparent focus:bg-transparent focus:shadow-none focus:ring-0 sm:text-xs";

/** Filled field for free-text answers, shaped like the answer rows. */
export const questionTextFieldClassName =
  "rounded-2xl border-0 bg-[var(--row-hover)] px-3 py-1.5 text-xs text-foreground shadow-none placeholder:text-[color:var(--muted)] hover:bg-[var(--row-active)] focus:bg-[var(--row-active)] focus:shadow-none focus:ring-1 focus:ring-[color:var(--border)] sm:text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Number badge that turns into a check once its row is chosen. */
export function QuestionRowMarker(props: { active: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-[5px] border text-[10px] font-medium transition-colors [font-variant-numeric:tabular-nums] ${
        props.active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-foreground/15 text-[color:var(--muted)]"
      }`}
    >
      {props.active ? <Check className="size-2.5" strokeWidth={3} /> : props.children}
    </span>
  );
}

export function QuestionOptionRow(props: {
  index: number;
  option: UserInputOption;
  isDisabled: boolean;
  onClick: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  /** Single-select forms can mark the saved choice without changing row shape. */
  selected?: boolean;
  /** Inline questionnaires keep long choices readable in narrow chat panes. */
  wrapLabel?: boolean;
  /** When defined, the row is a multi-select checkbox. */
  checked?: boolean;
  /** Roving tab stop: only one row of the list is reachable with Tab. */
  isTabStop?: boolean;
}) {
  const { index, option, isDisabled, onClick, selected, checked } = props;
  const { labelRef, tooltipProps } = useOverflowTooltip(!!option.description);
  const isMultiSelect = checked !== undefined;
  const active = isMultiSelect ? checked : selected === true;

  const row = (
    <button
      type="button"
      role="option"
      data-question-option
      {...(index < 9 ? { "aria-keyshortcuts": String(index + 1) } : {})}
      aria-selected={active}
      tabIndex={props.isTabStop === false ? -1 : 0}
      disabled={isDisabled}
      onClick={onClick}
      {...(props.onKeyDown ? { onKeyDown: props.onKeyDown } : {})}
      className={`${questionRowClassName(active)} disabled:opacity-60 disabled:hover:bg-transparent`}
    >
      <QuestionRowMarker active={active}>{index + 1}</QuestionRowMarker>
      <span className="min-w-0 flex-1">
        <span
          ref={labelRef}
          className={`block text-xs font-medium text-foreground ${props.wrapLabel ? "whitespace-normal break-words" : "truncate"}`}
        >
          {option.label}
        </span>
        {option.description ? (
          <span className="mt-0.5 block overflow-hidden text-[11px] leading-snug text-[color:var(--muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {option.description}
          </span>
        ) : null}
      </span>
    </button>
  );

  if (props.wrapLabel && !option.description) return row;
  return (
    <Tooltip delay={400} {...tooltipProps}>
      <Tooltip.Trigger className="flex w-full min-h-0 flex-col" tabIndex={-1} role="none">
        {row}
      </Tooltip.Trigger>
      <Tooltip.Content
        placement="top"
        showArrow
        className="pointer-events-none max-w-[28rem] break-words text-xs"
      >
        <div className="max-w-[28rem] space-y-1 whitespace-normal break-words">
          <div className="text-xs font-medium text-foreground">{option.label}</div>
          {option.description ? (
            <div className="text-[11px] text-[color:var(--muted)]">{option.description}</div>
          ) : null}
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}
