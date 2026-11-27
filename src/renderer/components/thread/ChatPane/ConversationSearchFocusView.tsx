import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { SearchMatch } from "@/renderer/commands/SearchMatch";
import { createSearchQuery } from "@/shared/searchMatching";
import {
  assistantTranscriptContent,
  textFromRuntimeContentBlocks,
} from "@/shared/experimentResponseTranscript";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import type { ConversationSearchFocus } from "./loadRuntimeItemThroughHistory";

type MessageRole = "user" | "assistant";

/** Display-truth message text, shared with the chat renderer and exports. */
function readMessage(item: PersistedRuntimeItem): { role: MessageRole; text: string } | null {
  if (item.type === "user_message") {
    const text = textFromRuntimeContentBlocks(item.payload);
    return text.trim() ? { role: "user", text } : null;
  }
  if (item.type === "assistant_message") {
    const text = assistantTranscriptContent(item);
    return text.trim() ? { role: "assistant", text } : null;
  }
  return null;
}

interface FocusRow {
  item: PersistedRuntimeItem;
  exact: boolean;
  role: MessageRole | undefined;
  text: string;
}

function revealExactHit(element: HTMLDivElement | null): void {
  element?.scrollIntoView({ block: "center" });
}

/**
 * A focused historical search context rendered over the live thread. It shows
 * the exact match and, when obtained, its contiguous neighbors. It never
 * splices these items into the live tail or the persisted transcript: the
 * window is read-only and lives only in this view until "Return to
 * conversation" retires it.
 */
export function ConversationSearchFocusView(props: {
  focus: ConversationSearchFocus;
  onReturn: () => void;
  /** Palette text, used only for literal highlighting in this read-only view. */
  query?: string;
}) {
  const { t } = useLingui();
  const searchQuery = createSearchQuery(props.query ?? "");
  // Neighbors without readable message text are omitted; the exact hit is
  // always kept, with a short fallback, so the chosen row never disappears.
  const rows: FocusRow[] = props.focus.items.flatMap((item) => {
    const exact = item.id === props.focus.itemId;
    const reading = readMessage(item);
    if (!exact && !reading) return [];
    return [{ item, exact, role: reading?.role, text: reading?.text ?? "" }];
  });

  return (
    <div
      className="absolute inset-0 z-20 flex min-h-0 flex-col bg-background"
      role="region"
      aria-label={t`Matched message in history`}
      data-conversation-search-focus="true"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted">
          <Trans>Matched message in history</Trans>
        </span>
        <Button size="sm" variant="ghost" onPress={props.onReturn} data-return="true">
          <Trans>Return to conversation</Trans>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rows.map((row) => (
          <div
            key={row.item.id}
            ref={row.exact ? revealExactHit : undefined}
            data-exact-match={row.exact ? "true" : undefined}
            data-row-item-id={row.item.id}
            className={`my-2 rounded-lg border px-3 py-2 text-sm ${
              row.exact ? "border-primary bg-primary/5" : "border-border bg-content1"
            }`}
          >
            {row.exact ? (
              <div className="mb-1 text-xs font-semibold text-primary">
                <Trans>Exact match</Trans>
              </div>
            ) : null}
            {row.role ? (
              <div className="mb-1 text-xs font-medium text-muted" data-message-role={row.role}>
                {row.role === "user" ? <Trans>You</Trans> : <Trans>Assistant</Trans>}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
              {row.text ? (
                <SearchMatch text={row.text} query={searchQuery} fuzzy={false} />
              ) : (
                <Trans>Message text unavailable</Trans>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
