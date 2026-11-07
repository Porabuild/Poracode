import { forwardRef, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CaseSensitive, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";

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
  // The position rolls as you step through matches; the result total stays
  // still so typing does not animate both sides of the label.
  const counter = !hasQuery ? (
    ""
  ) : matchCount === 0 ? (
    t`No results`
  ) : (
    <Trans>
      <AnimatedNumber value={currentIndex + 1} /> of {matchCount}
    </Trans>
  );

  return (
    <div
      className={`${floatingGlassSurfaceClass} flex h-9 items-center gap-0.5 rounded-4xl p-1 pl-2.5 ${className ?? ""}`}
      role="search"
    >
      <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
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
        className="w-44 bg-transparent px-1.5 text-[13px] text-foreground outline-none placeholder:text-muted"
      />
      <span
        className="min-w-[4.5rem] shrink-0 px-1.5 text-right text-[11px] tabular-nums text-muted"
        aria-live="polite"
      >
        {counter}
      </span>
      <FindBarButton label={t`Match case`} pressed={caseSensitive} onPress={onToggleCaseSensitive}>
        <CaseSensitive className="size-4" />
      </FindBarButton>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--hairline-strong)]" aria-hidden />
      <FindBarButton label={t`Previous match`} disabled={matchCount === 0} onPress={onPrev}>
        <ChevronUp className="size-3.5" />
      </FindBarButton>
      <FindBarButton label={t`Next match`} disabled={matchCount === 0} onPress={onNext}>
        <ChevronDown className="size-3.5" />
      </FindBarButton>
      <FindBarButton label={t`Close find`} onPress={onClose}>
        <X className="size-3.5" />
      </FindBarButton>
    </div>
  );
});

/**
 * 28px icon button in the floating-glass material. Its radius nests inside the
 * bar's composer-matched corner (bar radius minus the bar's padding).
 */
function FindBarButton({
  label,
  pressed,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      disabled={disabled}
      onClick={onPress}
      className={`flex size-7 shrink-0 items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-40 ${
        pressed
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
