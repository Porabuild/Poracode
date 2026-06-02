import type { ReactNode } from "react";
import { useGitReviewSectionPadX } from "../gitReviewPadXContext";

/**
 * Bordered, padded block at the bottom of the git review sidebar (commit, conflict actions,
 * PR, merge-to-source, etc.). Consolidates `border-t border-[var(--hairline)] py-2 ${sectionPadX}` so
 * spacing tweaks happen in one place.
 */
export function GitReviewSection(props: {
  children: ReactNode;
  /** Row gap between direct children. Defaults to `space-y-2`; pass `1` for tight pairs. */
  gap?: 1 | 2;
}) {
  const sectionPadX = useGitReviewSectionPadX();
  const gap = props.gap === 1 ? "space-y-1" : "space-y-2";
  return (
    <div className={`border-t border-[var(--hairline)] py-2 ${gap} ${sectionPadX}`}>
      {props.children}
    </div>
  );
}
