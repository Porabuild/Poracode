import { useEffect, useRef, useState } from "react";
import { TextArea } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { PendingSteerState, PromptSegment } from "@/shared/contracts";
import { fileNameFromPath, inlinePromptSegmentText } from "@/shared/promptContent";
import { Button } from "@/renderer/components/common";
import { flattenSegments } from "../composer/serializeMentions";

/** Edit text in place without flattening attachments, mentions, or skill metadata. */
export function ThreadFollowUpEditor({
  item,
  pending,
  notice,
  onSave,
  onCancel,
}: {
  item: PendingSteerState;
  pending: boolean;
  notice?: string | undefined;
  onSave: (prompt: string, segments: PromptSegment[]) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const focusedInitially = useRef(false);
  useEffect(() => {
    // The editor mounts before the pause request's finally handler clears
    // pending. Disabled inputs cannot receive focus in the real browser.
    if (pending || focusedInitially.current) return;
    editorRef.current?.focus();
    focusedInitially.current = true;
  }, [pending]);
  const [segments, setSegments] = useState<PromptSegment[]>(() => {
    const initial = item.segments?.length
      ? item.segments
      : [{ kind: "text" as const, content: item.prompt }];
    return initial.some((segment) => segment.kind === "text")
      ? initial
      : [...initial, { kind: "text", content: "" }];
  });
  const prompt = flattenSegments(segments);
  return (
    <form
      className="flex flex-col gap-2 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (prompt && !pending && !notice) onSave(prompt, segments);
      }}
    >
      {notice ? (
        <p role="status" className="text-xs text-muted">
          {notice}
        </p>
      ) : null}
      {segments.map((segment, index) =>
        segment.kind === "attachment" ? (
          <span key={index} className="truncate text-muted" title={segment.path}>
            {fileNameFromPath(segment.path)}
          </span>
        ) : segment.kind === "text" ? (
          <TextArea
            key={index}
            ref={
              index === segments.findIndex((part) => part.kind === "text") ? editorRef : undefined
            }
            aria-label={t`Edit queued follow-up`}
            className="min-h-12 w-full text-xs"
            rows={2}
            value={segment.content}
            disabled={pending}
            onChange={(event) =>
              setSegments(
                segments.map((part, i) =>
                  i === index ? { kind: "text", content: event.target.value } : part,
                ),
              )
            }
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape" && !pending) onCancel();
            }}
          />
        ) : (
          <span
            key={index}
            className="truncate text-muted"
            title={inlinePromptSegmentText(segment)}
          >
            {inlinePromptSegmentText(segment)}
          </span>
        ),
      )}
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          isDisabled={pending}
          onPress={onCancel}
        >{t`Cancel`}</Button>
        <Button
          size="sm"
          variant="secondary"
          type="submit"
          isDisabled={!prompt || pending || Boolean(notice)}
        >{t`Save`}</Button>
      </div>
    </form>
  );
}
