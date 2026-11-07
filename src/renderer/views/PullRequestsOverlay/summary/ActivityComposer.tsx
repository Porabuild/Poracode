import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { friendlyError } from "@/shared/messages";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { PixelLoader } from "@/renderer/components/common";
import { useGitStore } from "@/renderer/state/gitStore";
import { reviewClient } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrField } from "../parts/PrField";
import { useIsCurrentReview } from "./useCommentEditor";

/** Posts a conversation comment; refused while the review is read-only. */
export function ActivityComposer() {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const compact = useCompactLayout();
  const isCurrent = useIsCurrentReview();
  const [value, setValue] = useState("");
  const [posting, setPosting] = useState(false);
  const blocked = scope.readOnly || posting;

  async function post() {
    const body = value.trim();
    if (blocked || body.length === 0 || !isCurrent()) return;
    setPosting(true);
    try {
      const comment = await reviewClient(scope.source).comment({
        projectLocation: scope.location,
        prNumber: scope.prNumber,
        body,
      });
      if (!isCurrent()) return;
      useGitStore.getState().appendPrComment(scope.cacheKey, comment);
      setValue("");
      toast.success(t`Comment posted`);
      scope.reload();
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setPosting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Cmd/Ctrl+Enter submits, like the chat composer. On compact Enter adds a line
    // and the send button submits.
    if (!compact && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void post();
    }
  }

  const canPost = !blocked && value.trim().length > 0;
  return (
    <PrField
      ariaLabel={t`Write a comment`}
      placeholder={t`Write a comment…`}
      value={value}
      onChange={setValue}
      onKeyDown={onKeyDown}
      disabled={blocked}
      large={compact}
      maxRows={6}
      trailing={
        <button
          type="button"
          aria-label={t`Comment`}
          disabled={!canPost}
          className={`flex items-center justify-center rounded-full transition-colors ${
            compact ? "size-9" : "size-7"
          } ${canPost ? "text-accent" : "text-muted/50"}`}
          onClick={() => void post()}
        >
          {posting ? <PixelLoader size="xs" /> : <Send className="size-4" />}
        </button>
      }
    />
  );
}
