import { useEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useChangelogStore } from "@/renderer/state/changelogStore";
import { KIND_ICON, useChangelogKindLabels } from "@/renderer/components/changelog/ChangelogView";
import type { ChangelogHighlight } from "@/shared/changelogHighlights";
import { findFeature } from "./featureCatalog";

/**
 * One changelog point opened from the news line: the full sentence, where it
 * sits in its release, and a way to step to the next point or the full notes.
 * Rendered below the line so the composer above never moves.
 */
export function NewsHighlightCard(props: {
  highlight: ChangelogHighlight;
  highlights: readonly ChangelogHighlight[];
  onNavigate: (highlight: ChangelogHighlight) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { highlight, highlights, onNavigate, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const kindLabel = useChangelogKindLabels()[highlight.change.kind];
  const KindIcon = KIND_ICON[highlight.change.kind].icon;
  const currentIndex = highlights.findIndex((entry) => entry.id === highlight.id);
  const next =
    highlights.length > 1 ? highlights[(currentIndex + 1) % highlights.length] : undefined;
  const { position, total, version } = highlight;
  const feature = highlight.change.feature ? findFeature(highlight.change.feature) : undefined;

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    card.addEventListener("keydown", onKeyDown);
    return () => card.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={cardRef}
      role="group"
      aria-label={t`Release note`}
      className="mt-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[12.5px] text-muted"
      data-news-highlight-card={highlight.id}
    >
      <div className="mb-1.5 flex items-center gap-2 text-foreground">
        <KindIcon className={`size-3.5 ${KIND_ICON[highlight.change.kind].className}`} />
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
          {kindLabel}
        </span>
        {highlight.change.label ? (
          <span className="font-medium">{highlight.change.label}</span>
        ) : null}
        <button
          type="button"
          aria-label={t`Close`}
          className="ml-auto flex size-5 cursor-default items-center justify-center rounded-full text-muted/80 outline-none transition hover:bg-[var(--row-hover)] hover:text-foreground focus-visible:focus-ring"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="leading-relaxed">{highlight.change.text}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted/80">
          <Trans>
            Point {position} of {total} in {version}
          </Trans>
        </span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onPress={() => useChangelogStore.getState().openWhatsNew()}
        >
          <Trans>All release notes</Trans>
        </Button>
        {next ? (
          <Button size="sm" variant="tertiary" onPress={() => onNavigate(next)}>
            <Trans>Next point</Trans>
            <ChevronRight className="size-3.5" />
          </Button>
        ) : null}
        {feature ? (
          <Button size="sm" variant="secondary" onPress={() => feature.open()}>
            {t(feature.action)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
