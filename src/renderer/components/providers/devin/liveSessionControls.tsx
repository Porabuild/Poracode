import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { BookOpen, CircleAlert, FilePenLine } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { friendlyError, msg } from "@/shared/messages";
import { invokeThreadSessionActionResultSchema } from "@/shared/contracts/sessionActions";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import type { ProviderSessionControlProps } from "../providerSessionControls";
import { DEVIN_SESSION_ACTION_IDS } from "./sessionActionIds";
import { useSessionActionInventory } from "./useSessionActionInventory";
import {
  devinRuleEntryView,
  type DevinListingState,
  type DevinRuleEntryView,
} from "./sessionListings";
import { DevinSessionActionDialog, type DevinSessionPanel } from "./sessionActionDialog";
import {
  sessionOwnershipTag,
  type GuardedActionResult,
  type SessionActionTicket,
} from "./sessionOwnership";

/**
 * Live Devin session actions for the GUI composer add-menu submenu, registered through
 * the provider session-controls seam. Everything is inventory-driven: the
 * component asks the host which session actions the thread's live structured
 * session currently declares (`listThreadSessionActions`) and renders controls
 * only for the known Devin actions present in that catalog. An old host
 * without the verb, a terminal presentation, or a session that declares
 * nothing renders nothing — the static binary never advertises a capability
 * the current session does not have. A failed inventory is not hidden: only
 * the typed "host predates the seam" answers hide silently, everything else
 * surfaces a localized error with a retry.
 *
 * Only rules inspection and command revision contribute menu entries.
 * Model, thinking, permissions, titles and archiving use the app's existing
 * controls. Provider RPC availability alone does not create another UI.
 * Revision suggestions require explicit draft insertion, never execution.
 *
 * Every async step is admitted against the current session owner (see
 * `sessionOwnership.ts`): the guard runs before the invoke and again after
 * every await, so a reply that belongs to a thread, provider, or session the
 * component no longer shows is dropped before it can touch the new owner's
 * state.
 */

type OpenPanel = DevinSessionPanel | undefined;

const IDLE_RULES: DevinListingState<DevinRuleEntryView> = { kind: "idle" };

export function DevinSessionControls(props: ProviderSessionControlProps) {
  const { t } = useLingui();
  const thread = props.thread;

  // ── Session ownership (admission guard) ───────────────────────────────────
  // `tagRef` mirrors the owner the component is showing right now, so async
  // continuations compare against the current owner instead of the one from
  // the render they were created in. `epoch` is bumped whenever the owner
  // changes or the component unmounts, killing every continuation from the
  // previous owner.
  const ownerTag = sessionOwnershipTag(thread, props.presentationMode);
  // Mirrored during render on purpose: an in-flight callback must see the new
  // owner the moment it commits, not one effect-tick later.
  // oxlint-disable-next-line react/refs
  const tagRef = useRef(ownerTag);
  // oxlint-disable-next-line react/refs
  tagRef.current = ownerTag;
  const epochRef = useRef(0);

  const [openPanel, setOpenPanel] = useState<OpenPanel>(undefined);
  /** Synchronous same-tick guard: state updates alone cannot stop two
   * submissions in one batch from both seeing `pending === undefined`. */
  const pendingRef = useRef<SessionActionTicket | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<string | undefined>();
  const [reviseResult, setReviseResult] = useState<string | undefined>();
  const [rules, setRules] = useState(IDLE_RULES);

  // A different thread, provider, remote server, or live session starts from a
  // clean slate: results from the previous owner must not leak into it. Reset
  // during render when the owner changes — the documented state-from-props
  // adjustment, no effect needed.
  const [renderedOwnerTag, setRenderedOwnerTag] = useState(ownerTag);
  if (renderedOwnerTag !== ownerTag) {
    setRenderedOwnerTag(ownerTag);
    setOpenPanel(undefined);
    setReviseResult(undefined);
    setRules(IDLE_RULES);
    setPendingAction(undefined);
  }

  const admits = (ticket: SessionActionTicket): boolean =>
    ticket.epoch === epochRef.current && ticket.tag === tagRef.current;

  useEffect(() => {
    // A new owner invalidates every continuation captured before it, and the
    // cleanup (owner change or unmount) invalidates everything captured under
    // this one. The previous owner's pending invoke belongs to a session that
    // is gone; release its slot so the new owner can act immediately.
    epochRef.current += 1;
    pendingRef.current = undefined;
    return () => {
      epochRef.current += 1;
    };
    // A changed owner retires the previous mutation admission even though
    // continuations read the current owner from the refs.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [ownerTag]);

  const { inventory, retryInventory } = useSessionActionInventory(
    thread.id,
    ownerTag,
    epochRef,
    tagRef,
  );

  const hasAction = (actionId: string) =>
    inventory.kind === "ready" && inventory.actionIds.includes(actionId);
  const showRevise = hasAction(DEVIN_SESSION_ACTION_IDS.revise);
  const showRules = hasAction(DEVIN_SESSION_ACTION_IDS.rules);

  /**
   * Guarded session-action invoke. Returns undefined when the action did not
   * happen or its reply no longer belongs to the current owner — a second
   * same-tick submission, an invocation failure (toasted here, reported via
   * `onFailure`), or a reply from an owner the component has moved past
   * (dropped silently). `slot: false` (read-only listings) skips the one
   * pending-action slot: listings may run alongside a revision.
   */
  const invokeAction = async (
    actionId: string,
    payload: Record<string, unknown>,
    options: { slot?: boolean; onFailure?: () => void } = {},
  ): Promise<GuardedActionResult | undefined> => {
    const { slot = true, onFailure } = options;
    if (props.isDisabled || (slot && pendingRef.current !== undefined)) return undefined;
    const ticket: SessionActionTicket = { epoch: epochRef.current, tag: tagRef.current };
    if (!admits(ticket)) return undefined;
    if (slot) {
      pendingRef.current = ticket;
      setPendingAction(actionId);
    }
    try {
      const result = await readBridge().invokeThreadSessionAction({
        threadId: thread.id,
        actionId,
        payload,
      });
      // The reply must still belong to the owner this action was admitted
      // against — a thread, provider, or session switch supersedes it.
      if (!admits(ticket)) return undefined;
      const decoded = invokeThreadSessionActionResultSchema.safeParse(result);
      if (!decoded.success) throw new Error(msg("thread.sessionActionFailed"));
      return { ticket, result: decoded.data };
    } catch (error) {
      // Inventory-driven visibility ends at the catalog: an invocation can
      // still fail (agent gone, timeout, wire refusal) and surfaces as-is —
      // but only while this owner still shows the control.
      if (admits(ticket)) {
        toast.danger(friendlyError(error));
        onFailure?.();
      }
      return undefined;
    } finally {
      if (slot && pendingRef.current === ticket) {
        pendingRef.current = undefined;
        if (admits(ticket)) setPendingAction(undefined);
      }
    }
  };

  const submitRevise = (command: string, note: string) => {
    void invokeAction(
      DEVIN_SESSION_ACTION_IDS.revise,
      note.length > 0 ? { command, note } : { command },
    ).then((outcome) => {
      if (!outcome || !admits(outcome.ticket)) return;
      const suggested =
        typeof outcome.result.command === "string" ? outcome.result.command : undefined;
      if (!suggested) {
        toast.danger(t`Devin did not return a revised command.`);
        return;
      }
      setReviseResult(suggested);
    });
  };

  const insertReviseResult = () => {
    if (props.isDisabled || reviseResult === undefined) return;
    // Explicit insertion into the composer draft only — the suggestion is
    // never sent and never executed by Poracode.
    useComposerInputInbox.getState().enqueue(thread.id, [{ kind: "text", content: reviseResult }]);
    toast.success(t`Suggested command inserted into the composer.`);
    setReviseResult(undefined);
    setOpenPanel(undefined);
  };

  const loadListings = (
    actionId: string,
    apply: (result: Record<string, unknown>) => void,
    onFailure: () => void,
  ) => {
    void invokeAction(actionId, {}, { slot: false, onFailure }).then((outcome) => {
      if (!outcome || !admits(outcome.ticket)) return;
      apply(outcome.result);
    });
  };

  const loadRules = () => {
    setRules({ kind: "loading" });
    loadListings(
      DEVIN_SESSION_ACTION_IDS.rules,
      (result) => {
        if (!Array.isArray(result.rules)) {
          // A missing or non-array listing is a contract violation: showing it
          // as empty would hide active policy from the user.
          setRules({ kind: "failed", reason: "malformed" });
          return;
        }
        const entries: NonNullable<ReturnType<typeof devinRuleEntryView>>[] = [];
        for (const entry of result.rules) {
          const view = devinRuleEntryView(entry);
          if (!view) {
            setRules({ kind: "failed", reason: "malformed" });
            return;
          }
          entries.push(view);
        }
        setRules({ kind: "entries", entries });
      },
      // A failed read must never leave the panel spinning.
      () =>
        setRules((prev) =>
          prev.kind === "loading" ? { kind: "failed", reason: "transport" } : prev,
        ),
    );
  };

  const openAction = (panel: Exclude<OpenPanel, undefined>) => {
    if (props.isDisabled) return;
    setOpenPanel(panel);
    if (panel === "rules") loadRules();
  };

  const availableActions = [
    { id: "revise", label: t`Revise command`, icon: FilePenLine, visible: showRevise },
    { id: "rules", label: t`Rules`, icon: BookOpen, visible: showRules },
  ] as const;
  const actions = availableActions
    .filter((action) => action.visible)
    .map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      isDisabled: props.isDisabled,
      onAction: () => openAction(action.id),
    }));

  // A failed inventory stays discoverable inside +, without adding toolbar chrome.
  const menuActions =
    inventory.kind === "failed"
      ? [
          {
            id: "retry",
            label: t`Retry session controls`,
            detail: inventory.message,
            icon: CircleAlert,
            isDisabled: props.isDisabled,
            onAction: retryInventory,
          },
        ]
      : actions;

  return (
    <>
      {props.children?.(menuActions)}
      {openPanel ? (
        <DevinSessionActionDialog
          key={ownerTag}
          panel={openPanel}
          onClose={() => setOpenPanel(undefined)}
          pendingAction={pendingAction}
          submitRevise={submitRevise}
          reviseResult={reviseResult}
          insertReviseResult={insertReviseResult}
          discardReviseResult={() => {
            setReviseResult(undefined);
            setOpenPanel(undefined);
          }}
          rules={rules}
          isDisabled={props.isDisabled}
        />
      ) : null}
    </>
  );
}
