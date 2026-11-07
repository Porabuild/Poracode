import { Button } from "@heroui/react";
import { Plural, Trans } from "@lingui/react/macro";
import type { ReviewDraftComment } from "./prReviewDraftStore";

/**
 * The drafts a review submission will carry, plus how many are outdated and
 * will not be sent. A row jumps to the draft's line in the diff.
 */
export function ReviewDraftSummary(props: {
  drafts: readonly ReviewDraftComment[];
  outdatedCount: number;
  tooMany: boolean;
  disabled: boolean;
  onOpen: (draft: ReviewDraftComment) => void;
  onDiscardOutdated: () => void;
}) {
  const { drafts, outdatedCount } = props;
  if (drafts.length === 0 && outdatedCount === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border px-2 py-1.5 text-xs">
      {drafts.length > 0 ? (
        <>
          <span className="font-medium text-foreground">
            <Plural value={drafts.length} one="# draft comment" other="# draft comments" />
          </span>
          <ul className="max-h-24 overflow-y-auto">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  className="block w-full cursor-default truncate text-left font-mono text-[11px] text-muted hover:text-foreground"
                  title={draft.body}
                  disabled={props.disabled}
                  onClick={() => props.onOpen(draft)}
                >
                  {draft.path}:{draft.line}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {props.tooMany ? (
        <span role="alert" className="text-danger">
          <Trans>A review can carry at most 100 line comments.</Trans>
        </span>
      ) : null}
      {outdatedCount > 0 ? (
        <div className="flex items-center justify-between gap-2 text-muted">
          <span>
            <Plural
              value={outdatedCount}
              one="# outdated draft will not be submitted"
              other="# outdated drafts will not be submitted"
            />
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 min-h-0 px-2 text-[11px]"
            isDisabled={props.disabled}
            onPress={props.onDiscardOutdated}
          >
            <Trans>Discard outdated</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
