import { AnimatedNumber } from "./AnimatedNumber";

/**
 * The `+N -N` insertion/deletion pair, shared by the composer changes bubble,
 * the sidebar git badge, the git review panel, the PR review, and chat
 * tool-call rows. Each side is hidden when it is zero, so a new file reads
 * `+42` rather than `+42 -0`.
 *
 * Pass `animated` on aggregates that mutate while the user watches (working
 * tree totals, staged-group totals, grouped edit summaries). Leave it off for
 * per-file rows: those mount with their value and a large diff would otherwise
 * fire hundreds of simultaneous animations on every refresh.
 *
 * Each side animates in isolation so changes to one value cannot translate the
 * other across the row. Because a zero side is unmounted, a 0 → N transition
 * mounts rather than animates; N → M — the case that actually happens as an
 * agent edits — rolls.
 */
export function DiffStat({
  insertions,
  deletions,
  animated = false,
  className = "inline-flex items-center gap-0.5",
}: {
  insertions: number;
  deletions: number;
  animated?: boolean;
  className?: string;
}) {
  if (insertions <= 0 && deletions <= 0) return null;

  if (!animated) {
    return (
      <span className={className}>
        {insertions > 0 ? <span className="text-success">+{insertions}</span> : null}
        {deletions > 0 ? <span className="text-danger">-{deletions}</span> : null}
      </span>
    );
  }

  return (
    <span className={className}>
      {insertions > 0 ? (
        <AnimatedNumber className="text-success" value={insertions} prefix="+" />
      ) : null}
      {deletions > 0 ? (
        <AnimatedNumber className="text-danger" value={deletions} prefix="-" />
      ) : null}
    </span>
  );
}
