import { useEffect, useState } from "react";
import { readBridge } from "@/renderer/bridge";
import { listThreadSessionActionsResultSchema } from "@/shared/contracts/sessionActions";
import { friendlyError, msg } from "@/shared/messages";
import { isSessionActionSeamUnsupported } from "./sessionActionHost";
import { ticketAdmits, type SessionActionTicket } from "./sessionOwnership";

type InventoryState =
  | { kind: "loading" }
  | { kind: "ready"; actionIds: readonly string[] }
  | { kind: "unsupported" }
  | { kind: "failed"; message: string };

/** Read-only catalog lifetime is separate from the accepted mutation's pending slot. */
export function useSessionActionInventory(
  threadId: string,
  ownerTag: string,
  epochRef: { readonly current: number },
  tagRef: { readonly current: string },
) {
  const [inventory, setInventory] = useState<InventoryState>({ kind: "loading" });
  const [retryNonce, setRetryNonce] = useState(0);
  const [renderedOwnerTag, setRenderedOwnerTag] = useState(ownerTag);
  if (renderedOwnerTag !== ownerTag) {
    setRenderedOwnerTag(ownerTag);
    setInventory({ kind: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    const ticket: SessionActionTicket = { epoch: epochRef.current, tag: tagRef.current };
    const admits = () => !cancelled && ticketAdmits(ticket, epochRef, tagRef);
    // Missing bridge methods can throw synchronously. Response decoding can
    // also fail; both must reach the same visible, retryable failure path.
    Promise.resolve()
      .then(() => readBridge().listThreadSessionActions({ threadId }))
      .then((result) => {
        if (!admits()) return;
        const decoded = listThreadSessionActionsResultSchema.safeParse(result);
        if (!decoded.success) throw new Error(msg("thread.sessionActionFailed"));
        setInventory({ kind: "ready", actionIds: decoded.data.actions.map((action) => action.id) });
      })
      .catch((error: unknown) => {
        if (!admits()) return;
        setInventory(
          isSessionActionSeamUnsupported(error)
            ? { kind: "unsupported" }
            : { kind: "failed", message: friendlyError(error) },
        );
      });
    return () => {
      cancelled = true;
    };
    // Owner/retry changes are explicit catalog invalidations; refs hold the
    // corresponding live admission state rather than a render snapshot.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [ownerTag, threadId, retryNonce, epochRef, tagRef]);

  return {
    inventory,
    retryInventory: () => {
      setInventory({ kind: "loading" });
      setRetryNonce((nonce) => nonce + 1);
    },
  };
}
