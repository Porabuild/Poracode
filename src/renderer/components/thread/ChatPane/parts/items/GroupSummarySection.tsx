import { Plural, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/renderer/components/common/AnimatedNumber";
import { useShimmer } from "@/renderer/thinkingAnimator";
import { formatDiffSummaryLabel } from "./FileChange";
import type { GroupSection } from "./toolCallCategorization";

/** Collapsed category summaries keep signaling work that outlives its turn. */
export function GroupSummarySection({
  section,
  showRunning,
}: {
  section: GroupSection;
  showRunning: boolean;
}) {
  const { i18n } = useLingui();
  const isRunning = showRunning && section.hasRunning === true;
  const diffLabel = formatDiffSummaryLabel(section.diffSummary, { animated: true });
  return (
    <span className="flex shrink-0 items-center gap-1">
      <section.Icon className="size-3" />
      <code className="font-mono tabular-nums [word-spacing:-0.25em] !text-[color:var(--muted)]">
        <AnimatedNumber value={section.count} />{" "}
        {/* A text mask around NumberFlow's shadow DOM can paint the label off
            its baseline. Keep the roll outside the mask, and remount only the
            label when its wording changes so Chromium cannot retain old glyphs. */}
        <SummaryLabel
          key={`${i18n.locale}:${section.label}`}
          label={section.label}
          isRunning={isRunning}
        >
          {section.category === "mcp" ? (
            <Plural value={section.count} one="MCP" other="MCPs" />
          ) : (
            section.label
          )}
        </SummaryLabel>
      </code>
      {diffLabel ? <span className="shrink-0 tabular-nums font-medium">{diffLabel}</span> : null}
    </span>
  );
}

function SummaryLabel({
  label,
  isRunning,
  children,
}: {
  label: string;
  isRunning: boolean;
  children: ReactNode;
}) {
  const shimmerRef = useShimmer<HTMLSpanElement>(isRunning);
  return (
    <span
      ref={shimmerRef}
      {...(isRunning
        ? { className: "poracode-thinking-text", "data-poracode-shimmer-text": label }
        : {})}
    >
      {children}
    </span>
  );
}
