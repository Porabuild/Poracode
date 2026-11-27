import { Button, Modal } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
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

function revealExactHit(element: HTMLLIElement | null): void {
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
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) props.onReturn();
      }}
    >
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog data-conversation-search-focus="true">
          <Modal.Header>
            <div className="flex items-center justify-between gap-2">
              <Modal.Heading>
                <Trans>Matched message in history</Trans>
              </Modal.Heading>
              <Button size="sm" variant="ghost" onPress={props.onReturn} data-return="true">
                <Trans>Return to conversation</Trans>
              </Button>
            </div>
          </Modal.Header>
          <Modal.Body>
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <li
                  key={row.item.id}
                  ref={row.exact ? revealExactHit : undefined}
                  data-exact-match={row.exact ? "true" : undefined}
                  data-row-item-id={row.item.id}
                  className={`rounded-3xl px-2 py-1.5 text-sm ${
                    row.exact ? "bg-[var(--row-active)] text-foreground" : "text-muted"
                  }`}
                >
                  {row.exact ? (
                    <div className="mb-1 text-xs font-semibold text-muted">
                      <Trans>Exact match</Trans>
                    </div>
                  ) : null}
                  {row.role ? (
                    <div
                      className="mb-1 text-xs font-medium text-muted"
                      data-message-role={row.role}
                    >
                      {row.role === "user" ? <Trans>You</Trans> : <Trans>Assistant</Trans>}
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words font-sans text-sm">
                    {row.text ? (
                      <SearchMatch text={row.text} query={searchQuery} fuzzy={false} />
                    ) : (
                      <Trans>Message text unavailable</Trans>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
