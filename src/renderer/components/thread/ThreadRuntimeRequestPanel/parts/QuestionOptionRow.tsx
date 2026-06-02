import { Tooltip } from "@heroui/react";
import { Check } from "lucide-react";
import type { UserInputOption } from "@/shared/contracts";

export function QuestionOptionRow(props: {
  index: number;
  option: UserInputOption;
  isDisabled: boolean;
  onClick: () => void;
  /** Single-select forms can mark the saved choice without changing row shape. */
  selected?: boolean;
  /** When defined, the row renders a checkbox marker (multi-select). */
  checked?: boolean;
}) {
  const { index, option, isDisabled, onClick, selected, checked } = props;
  const isMultiSelect = checked !== undefined;
  const tooltipBody = option.description ? (
    <div className="max-w-[28rem] space-y-1 whitespace-normal break-words">
      <div className="text-xs font-medium text-foreground">{option.label}</div>
      <div className="text-[11px] text-[color:var(--muted)]">{option.description}</div>
    </div>
  ) : null;

  const row = (
    <button
      type="button"
      role="option"
      aria-selected={isMultiSelect ? checked === true : selected === true}
      disabled={isDisabled}
      onClick={onClick}
      className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none disabled:opacity-60 disabled:hover:bg-transparent ${
        selected ? "bg-foreground/5" : ""
      }`}
    >
      {isMultiSelect ? (
        <span
          className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
            checked
              ? "border-accent bg-accent text-accent-foreground"
              : "border-foreground/30 text-transparent"
          }`}
        >
          <Check className="size-2.5" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span className="mt-px w-4 shrink-0 text-[11px] font-medium text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
          {`${index + 1}.`}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{option.label}</span>
        {option.description ? (
          <span className="block overflow-hidden text-[11px] leading-snug text-[color:var(--muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {option.description}
          </span>
        ) : null}
      </span>
    </button>
  );

  if (!tooltipBody) return row;
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger className="flex w-full min-h-0 flex-col" tabIndex={-1} role="none">
        {row}
      </Tooltip.Trigger>
      <Tooltip.Content placement="right" showArrow className="max-w-[28rem] break-words text-xs">
        {tooltipBody}
      </Tooltip.Content>
    </Tooltip>
  );
}
