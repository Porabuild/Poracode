import type { KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useLingui } from "@lingui/react/macro";

export type QuestionStep = { id: string; label: string; answered: boolean };

/** Labeled step tabs keep each question identifiable after it is answered. */
export function QuestionSwitcher(props: {
  steps: readonly QuestionStep[];
  activeIndex: number;
  isDisabled: boolean;
  onSelect: (index: number) => void;
}) {
  const { steps, activeIndex, isDisabled, onSelect } = props;
  const { t } = useLingui();
  if (steps.length <= 1) return null;

  // Tablist pattern: arrows move between steps, Home/End jump to the ends.
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % steps.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + steps.length) % steps.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = steps.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect(next);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t`Questions`}
      className="flex max-w-full items-center gap-1 overflow-x-auto p-0.5"
    >
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            aria-label={step.label}
            title={step.label}
            disabled={isDisabled}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => handleKey(event, index)}
            className={`flex h-5 min-w-0 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-medium transition-colors outline-none focus-visible:focus-ring disabled:opacity-60 ${
              step.answered
                ? "bg-accent text-accent-foreground"
                : isActive
                  ? "bg-[var(--row-active)] text-foreground"
                  : "text-[color:var(--muted)] hover:bg-[var(--row-hover)] hover:text-foreground"
            } ${isActive ? "ring-1 ring-foreground/40 ring-offset-1 ring-offset-[var(--composer-surface)]" : ""}`}
          >
            <span
              aria-hidden
              className="flex size-3 shrink-0 items-center justify-center text-[10px] [font-variant-numeric:tabular-nums]"
            >
              {step.answered ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className="max-w-32 truncate">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}
