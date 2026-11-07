import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, TextArea } from "@heroui/react";
import { Sparkles } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { PrReviewThread } from "@/shared/contracts";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { PrAvatar } from "../parts/PrAvatar";
import { PrCommentBody } from "../parts/PrCommentBody";
import { threadSide } from "./placeComments";
import type { ReviewDraftComment } from "./prReviewDraftStore";

/** Everything shown under one diff line. */
export interface LineComments {
  threads: PrReviewThread[];
  drafts: ReviewDraftComment[];
}

/** What "Add to agent" needs to know about one comment. */
export interface AskTarget {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  text: string;
}

function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submit();
  }
}

function AskAgentButton(props: { onAsk: () => void }) {
  const { t } = useLingui();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 min-h-0 gap-1 px-2 text-[11px] font-medium text-muted hover:text-foreground"
      aria-label={t`Add this comment to the agent chat`}
      onPress={props.onAsk}
    >
      <Sparkles className="size-3" />
      <Trans>Add to agent</Trans>
    </Button>
  );
}

function CommentEditor(props: {
  initial: string;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const [body, setBody] = useState(props.initial);
  const field = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  const ready = body.trim().length > 0;
  function submit() {
    if (ready) props.onSubmit(body.trim());
  }
  return (
    <div className="px-3 py-2">
      <TextArea
        aria-label={t`Review comment`}
        className="min-h-20 w-full resize-y text-xs"
        placeholder={t`Leave a comment`}
        rows={3}
        value={body}
        variant="secondary"
        ref={field}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => submitOnShortcut(event, submit)}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="tertiary" onPress={props.onCancel}>
          <Trans>Cancel</Trans>
        </Button>
        <Button size="sm" isDisabled={!ready} onPress={submit}>
          {props.submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** The composer opened by the "+" on a diff line. */
export function DraftComposer(props: { onSubmit: (body: string) => void; onClose: () => void }) {
  const { t } = useLingui();
  return (
    <div className="border-y border-border bg-[var(--content-background)] font-sans">
      <CommentEditor
        initial=""
        submitLabel={t`Add to review`}
        onSubmit={(body) => {
          props.onSubmit(body);
          props.onClose();
        }}
        onCancel={props.onClose}
      />
    </div>
  );
}

export function DraftCard(props: {
  draft: ReviewDraftComment;
  outdated?: boolean;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onAsk?: (target: AskTarget) => void;
}) {
  const { draft, outdated = false, onUpdate, onDelete, onAsk } = props;
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  return (
    <div
      className="rounded-lg border border-warning/40 bg-[var(--content-background)] font-sans"
      data-testid="draft-comment"
    >
      <div className="flex items-center gap-2 px-3 pt-2 text-[11px] text-muted">
        <span className="font-medium text-warning">
          <Trans>Draft</Trans>
        </span>
        {outdated ? (
          <span>
            <Trans>Outdated: the pull request changed after this was drafted.</Trans>
          </span>
        ) : null}
        <span className="ml-auto break-all font-mono">
          {draft.path}:{draft.line}
        </span>
      </div>
      {editing ? (
        <CommentEditor
          initial={draft.body}
          submitLabel={t`Save`}
          onSubmit={(body) => {
            onUpdate(draft.id, body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <PrCommentBody body={draft.body} disabled />
          <div className="flex justify-end gap-1 px-2 pb-1">
            {onAsk && !outdated ? (
              <AskAgentButton
                onAsk={() =>
                  onAsk({
                    path: draft.path,
                    line: draft.line,
                    side: draft.side,
                    text: draft.body,
                  })
                }
              />
            ) : null}
            {outdated ? null : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-h-0 px-2 text-[11px] font-medium text-muted hover:text-foreground"
                aria-label={t`Edit draft comment`}
                onPress={() => setEditing(true)}
              >
                <Trans>Edit</Trans>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-0 px-2 text-[11px] font-medium text-danger"
              aria-label={t`Delete draft comment`}
              onPress={() => onDelete(draft.id)}
            >
              <Trans>Delete</Trans>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function ThreadCard(props: { thread: PrReviewThread; onAsk?: (target: AskTarget) => void }) {
  const { thread, onAsk } = props;
  return (
    <div
      className="rounded-lg border border-border bg-[var(--content-background)] font-sans"
      data-testid="review-thread"
    >
      <div className="flex items-center gap-2 px-3 pt-2 text-[11px] text-muted">
        <span>{thread.isResolved ? <Trans>Resolved</Trans> : <Trans>Unresolved</Trans>}</span>
        {thread.isOutdated ? (
          <span>
            <Trans>Outdated</Trans>
          </span>
        ) : null}
        {thread.path ? (
          <span className="ml-auto break-all font-mono">
            {thread.path}
            {thread.line ? `:${thread.line}` : ""}
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col">
        {thread.comments.map((comment) => (
          <li key={comment.id} className="border-b border-border/60 last:border-b-0">
            <div className="flex items-center gap-2 px-3 pt-2 text-[11px] text-muted">
              <PrAvatar author={comment.author} size="xs" />
              <span className="font-medium text-foreground">{comment.author.login}</span>
              <RelativeTime iso={comment.createdAt} />
            </div>
            <PrCommentBody body={comment.body} disabled />
          </li>
        ))}
      </ul>
      {onAsk && thread.path && thread.line ? (
        <div className="flex justify-end px-2 pb-1">
          <AskAgentButton
            onAsk={() =>
              onAsk({
                path: thread.path ?? "",
                line: thread.line ?? 0,
                side: threadSide(thread),
                text: thread.comments.map((comment) => comment.body).join("\n\n"),
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/** Threads and drafts under one line (the library's extend-line renderer). */
export function LineCommentStack(props: {
  data: LineComments;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onAsk?: (target: AskTarget) => void;
}) {
  const { data, onUpdate, onDelete, onAsk } = props;
  return (
    <div className="flex flex-col gap-2 border-y border-border bg-[var(--content-background)] px-3 py-2">
      {data.threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} {...(onAsk ? { onAsk } : {})} />
      ))}
      {data.drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          onUpdate={onUpdate}
          onDelete={onDelete}
          {...(onAsk ? { onAsk } : {})}
        />
      ))}
    </div>
  );
}
