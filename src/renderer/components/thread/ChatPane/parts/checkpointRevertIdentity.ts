import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { isVisibleRuntimeItem } from "../chatPaneSelectors";

/**
 * Fresh idempotency key per deliberate user action. Retries of the same
 * action reuse the pending key until an explicit server outcome settles it;
 * a JS transport rejection is not authoritative and retains the key so the
 * retry reconciles the same operation instead of starting a new action.
 *
 * The key is bounded (`ckpt-revert.<uuid>`) instead of composed from the
 * thread or item id: the remote transport prepends the `checkpoint-revert:`
 * command-id prefix and the remote router caps the whole header, so a key
 * built from a projected thread id (`remote:<server>:thread:<id>`) could pass
 * the payload schema yet overflow the header gate and get rejected with 400.
 * Target identity is enforced server-side at claim time (same key for a
 * different checkpoint is a hard conflict); the key itself only needs
 * uniqueness for replay protection.
 */
export function mintCheckpointOperationKey(): string {
  return `ckpt-revert.${crypto.randomUUID()}`;
}

/**
 * The checkpoint a user row can revert to is the previous turn's anchor item —
 * the same identity the capture side keys turn snapshots on: a closing turn
 * anchors on its last visible top-level item (`appendCompletedTurnIfClosed`),
 * whatever its type, and `finalizeFileCheckpoint` stores the turn snapshot
 * under that id. Scanning for assistant messages only desynchronized the two
 * sides whenever a turn closed on a tool row: this lookup skipped the real
 * anchor and settled on an older turn (wrong revert target) or found none
 * ("no checkpoint stored" despite a stored ref).
 */
export function findCheckpointBeforeUserMessage(
  itemIds: readonly string[],
  itemsById: Readonly<Record<string, RuntimeChatItem>>,
  userItemId: string,
): string | null {
  const userIndex = itemIds.indexOf(userItemId);
  if (userIndex <= 0) return null;

  for (let idx = userIndex - 1; idx >= 0; idx -= 1) {
    const itemId = itemIds[idx]!;
    const item = itemsById[itemId];
    if (!item) return itemId;
    if (item.type === "user_message") continue;
    if (item.parentItemId !== undefined || !isVisibleRuntimeItem(item)) continue;
    return itemId;
  }

  return null;
}
