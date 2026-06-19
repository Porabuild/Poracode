import { forwardRef } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";

export interface FindBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  caseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  /** Total number of matches across the searched surface. */
  matchCount: number;
  /** Zero-based index of the active match, or -1 when there are none. */
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * Compact, surface-agnostic find bar: query input, match counter, prev/next,
 * case-sensitivity toggle, and close. Stateless — each surface owns the query
 * and match state and feeds it in. Enter / Shift+Enter step matches; Escape
 * closes.
 */
export const FindBar = forwardRef<HTMLInputElement, FindBarProps>(function FindBar(
  {
    query,
    onQueryChange,
    caseSensitive,
    onToggleCaseSensitive,
    matchCount,
    currentIndex,
    onNext,
    onPrev,
    onClose,
    placeholder,
    className,
  },
  ref,
) {
  const { t } = useLingui();
  const hasQuery = query.length > 0;
  const counter = !hasQuery
    ? ""
    : matchCount === 0
      ? t`No results`
      : t`${currentIndex + 1} of ${matchCount}`;

  return (
    <div
      className={`flex items-center gap-1 rounded-lg border border-[var(--hairline-strong)] bg-[var(--background)] px-1.5 py-1 shadow-lg ${className ?? ""}`}
      role="search"
    >
      <input
        ref={ref}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder={placeholder ?? t`Find`}
        aria-label={placeholder ?? t`Find`}
        spellCheck={false}
        autoComplete="off"
        className="w-44 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-foreground-muted"
      />
      <span
        className="min-w-[4.5rem] shrink-0 px-1 text-right text-xs tabular-nums text-foreground-muted"
        aria-live="polite"
      >
        {counter}
      </span>
      <Button
        isIconOnly
        size="sm"
        variant={caseSensitive ? "secondary" : "tertiary"}
        aria-label={t`Match case`}
        aria-pressed={caseSensitive}
        onPress={onToggleCaseSensitive}
      >
        <CaseSensitive className="size-4" />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={t`Previous match`}
        isDisabled={matchCount === 0}
        onPress={onPrev}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={t`Next match`}
        isDisabled={matchCount === 0}
        onPress={onNext}
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button isIconOnly size="sm" variant="tertiary" aria-label={t`Close find`} onPress={onClose}>
        <X className="size-4" />
      </Button>
    </div>
  );
});
