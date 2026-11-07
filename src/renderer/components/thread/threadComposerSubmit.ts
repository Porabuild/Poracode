import { remoteMutationMayHaveCommitted } from "@/shared/remote/clientErrors";
import {
  preserveDraftSubmission,
  materializeDraftSegments,
  dispatchDraftSubmission,
  acceptDraftSubmission,
  waitForClientSubmission,
  type DraftSubmission,
} from "@/renderer/actions/clientDraftSubmission";
import { updateClientSubmission } from "@/renderer/state/composerDrafts/clientDraftDatabase";
import type { RefObject } from "react";
import { sideChatAvailable, openSideChat } from "./SideChat/sideChatActions";
import { toast } from "@heroui/react";
import type {
  AgentSlashCommand,
  AgentStatus,
  PromptSegment,
  Thread,
  ThreadPresentationMode,
  UserInputOption,
} from "@/shared/contracts";
import type { TurnClientContextCapture } from "../composer/turnClientContext";
import { friendlyError } from "@/shared/messages";
import { hasSendablePromptContent } from "@/shared/promptContent";
import type { FollowUpBehavior } from "@/shared/settings";
import { readBridge } from "@/renderer/bridge";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import {
  changeThreadConfig,
  resolveThreadServerRequest,
  setThreadPendingSteer,
  submitThreadInput,
} from "@/renderer/actions/threadRuntimeActions";
import { captureThreadPromptSubmitted } from "@/renderer/analytics/posthog";
import { useAppStore } from "@/renderer/state/appStore";
import { buildLcSelectorFence, buildSelectorPlainText } from "@/renderer/state/browserAttachInbox";
import { applyOptimisticRequestResolution } from "@/renderer/state/runtimeRequestActions";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import type { MentionInputHandle } from "../composer/MentionInput";
import { storableAttachment } from "../composer/useAttachments";
import type { useAttachments } from "../composer/useAttachments";
import { flattenSegments } from "../composer/serializeMentions";
import type { TerminalPaneHandle } from "./TerminalPane";
import { normalizeProviderModelConfig } from "@/renderer/components/providers/modelConfig";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import {
  bindLeadingSkillUnlessLocalAction,
  resolveLocalActionUnlessSkill,
  resolveLocalSlashCommandAction,
  SIDE_CHAT_COMMAND_PREFIX,
} from "./threadSlashCommands";

/**
 * Everything the composer submit path reads from the section component,
 * captured at the moment of submission. `ThreadComposerSection` builds this
 * per call; the function itself owns no React state.
 */
export interface ComposerSubmitContext {
  thread: Thread;
  /** Sent by the resume button, not typed: a failure leaves the composer empty
   * so the button stays for another try. */
  resumesInterruptedTurn?: boolean;
  agentStatus: AgentStatus | undefined;
  presentationMode: ThreadPresentationMode;
  usesTerminalPresentation: boolean;
  canSubmit: boolean;
  /** Renderer routing hint for a GUI thread that appears to be working. The
   * supervisor rechecks the live session after any pending startup completes. */
  usesPendingSteerPath: boolean;
  followUpBehavior?: FollowUpBehavior;
  needsFocusBeforeInput: boolean;
  activeRuntimeRequest: OpenRuntimeRequest | undefined;
  approvalDenyOption: UserInputOption | undefined;
  /** Slash commands available to this thread; binds typed `/skill` text to skill segments. */
  availableCommands: readonly AgentSlashCommand[];
  attachments: ReturnType<typeof useAttachments>;
  mentionRef: RefObject<MentionInputHandle | null>;
  terminalPaneRef: RefObject<TerminalPaneHandle | null>;
  latestSegmentsRef: { current: PromptSegment[] };
  /** True while a submit is in flight; gates the unmount draft-save. */
  submittedRef: { current: boolean };
  /** Prevent an older thread's async submit from mutating the reused composer shell. */
  isCurrentSession: () => boolean;
  setPrompt: (value: string) => void;
  setHasContent: (value: boolean) => void;
  setIsSubmitting: (value: boolean) => void;
  /** Open the model/effort picker (backs the `/model` and `/effort` commands). */
  requestOpenControl: (target: "model" | "effort" | "crew") => void;
  /** Optional surface override for the canonical thread-input action. */
  onSubmitInput?: ((prompt: string, segments?: PromptSegment[]) => Promise<void>) | undefined;
  /** Called after the transport accepts any ordinary, steered, or queued send. */
  onSubmitSuccess?: (() => void) | undefined;
  /** Surface-provided per-turn context, captured when the user submits. */
  captureClientContext?: TurnClientContextCapture | undefined;
}

/**
 * The composer submit pipeline, extracted verbatim from
 * `ThreadComposerSection`: attachment/selector segment assembly, local slash
 * commands, the optional pre-send approval denial, the pending-steer staging
 * path, and the clear-on-success / restore-on-failure composer bookkeeping.
 */
export function submitComposerPrompt(
  segments: PromptSegment[],
  ctx: ComposerSubmitContext,
): Promise<void> | void {
  const { thread, agentStatus, attachments, mentionRef, usesTerminalPresentation } = ctx;
  const currentAttachments = attachments.getDraftAttachments();
  const attachmentSegments = attachments.toSegments();
  // The `lc-selector` fence is parsed only by the GUI chat SelectorBadge; a
  // terminal-native agent reads raw text, so submit a plain sentence instead.
  const selectorSegments: PromptSegment[] = currentAttachments
    .filter((a) => a.selector && a.sourceUrl)
    .map((a) => ({
      kind: "text" as const,
      content: usesTerminalPresentation
        ? `\n\n${buildSelectorPlainText({ selector: a.selector ?? "", sourceUrl: a.sourceUrl ?? "" })}\n`
        : buildLcSelectorFence({
            selector: a.selector ?? "",
            sourceUrl: a.sourceUrl ?? "",
            attachmentName: a.name,
          }),
    }));
  const slashLookupContext = {
    agentKind: thread.agentKind,
    presentationMode: ctx.presentationMode,
    runtimeLabel: agentStatus?.capabilities.runtimeLabel,
    supportsSideChat: sideChatAvailable(thread.id, ctx.presentationMode),
  };
  const boundSegments = ctx.resumesInterruptedTurn
    ? segments
    : bindLeadingSkillUnlessLocalAction(segments, ctx.availableCommands, slashLookupContext);
  const allSegments = [...attachmentSegments, ...selectorSegments, ...boundSegments];
  const flat = flattenSegments(allSegments);
  // Route side questions before approval denial, queueing or steering. The
  // parent may be working (or still connecting) and must remain untouched.
  const leadingSegment = boundSegments.find(
    (segment) => segment.kind !== "text" || segment.content.trim().length > 0,
  );
  const sideAction =
    !ctx.resumesInterruptedTurn && leadingSegment?.kind === "text"
      ? resolveLocalSlashCommandAction(flattenSegments(boundSegments), slashLookupContext)
      : null;
  if (sideAction?.kind === "open-side-chat") {
    if (sideAction.prompt && attachments.hasPendingUploads()) return;
    const draftAtSubmit = JSON.stringify(ctx.latestSegmentsRef.current);
    const attachmentsAtSubmit = JSON.stringify(attachments.getDraftAttachments());
    const questionSegments = boundSegments.map((segment) =>
      segment === leadingSegment && segment.kind === "text"
        ? { ...segment, content: segment.content.replace(SIDE_CHAT_COMMAND_PREFIX, "") }
        : segment,
    );
    ctx.setIsSubmitting(true);
    const run = async () => {
      if (!sideAction.prompt) return openSideChat(thread.id);
      const submission = await preserveDraftSubmission({
        kind: "thread",
        ownerId: thread.id,
        target: thread,
        content: { segments, attachments: attachments.getDraftAttachments() },
        segments: [...attachmentSegments, ...selectorSegments, ...questionSegments],
        intent: "side-chat",
        configuration: { config: thread.config },
      });
      let opened = false;
      try {
        const outgoing = await materializeDraftSegments(
          thread,
          submission.segments,
          `draft-${submission.id}`,
          submission.isTargetCurrent,
        );
        opened = await dispatchDraftSubmission(submission, async () => {
          const didOpen = await openSideChat(thread.id, sideAction.prompt, outgoing, {
            clientSubmissionId: submission.id,
          });
          if (didOpen) await waitForClientSubmission(submission.id);
          return didOpen;
        });
        if (!opened) {
          await updateClientSubmission(submission.id, "failed");
          return false;
        }
        await acceptDraftSubmission(submission, () => {
          if (
            !ctx.isCurrentSession() ||
            JSON.stringify(ctx.latestSegmentsRef.current) !== draftAtSubmit ||
            JSON.stringify(attachments.getDraftAttachments()) !== attachmentsAtSubmit
          )
            return;
          mentionRef.current?.clear();
          attachments.clearAll();
          ctx.setPrompt("");
          ctx.setHasContent(false);
          ctx.latestSegmentsRef.current = [];
          useAppStore.getState().clearThreadDraftContent(thread.id);
        });
        return true;
      } catch (error) {
        if (!opened) {
          const { readClientSubmission } =
            await import("@/renderer/state/composerDrafts/clientDraftDatabase");
          if (
            (await readClientSubmission(submission.id).catch(() => undefined))?.state === "prepared"
          )
            await updateClientSubmission(submission.id, "failed").catch(() => undefined);
        }
        throw error;
      }
    };
    return run()
      .then((opened) => {
        if (
          sideAction.prompt ||
          !opened ||
          !ctx.isCurrentSession() ||
          JSON.stringify(ctx.latestSegmentsRef.current) !== draftAtSubmit
        )
          return;
        mentionRef.current?.clear();
        ctx.setPrompt("");
        ctx.setHasContent(false);
        ctx.latestSegmentsRef.current = [];
        if (attachments.getDraftAttachments().length > 0)
          useAppStore.getState().saveThreadDraftContent(thread.id, {
            segments: [],
            attachments: attachments.getDraftAttachments(),
          });
        else useAppStore.getState().clearThreadDraftContent(thread.id);
      })
      .catch((error: unknown) => {
        toast.danger(friendlyError(error));
      })
      .finally(() => {
        if (ctx.isCurrentSession()) ctx.setIsSubmitting(false);
      });
  }

  if (!hasSendablePromptContent(flat, allSegments) || !ctx.canSubmit) return;
  const clearComposerText = () => {
    ctx.setPrompt("");
    ctx.setHasContent(false);
    ctx.latestSegmentsRef.current = [];
  };
  const localAction = ctx.resumesInterruptedTurn
    ? null
    : resolveLocalActionUnlessSkill(allSegments, flat, slashLookupContext);
  if (localAction?.kind === "set-mode") {
    changeThreadConfig(thread.id, { ...thread.config, mode: localAction.mode });
    mentionRef.current?.clear();
    mentionRef.current?.focus();
    clearComposerText();
    return;
  }
  if (localAction?.kind === "open-control") {
    ctx.requestOpenControl(
      localAction.target === "crew" && !thread.config.crew ? "model" : localAction.target,
    );
    mentionRef.current?.clear();
    clearComposerText();
    return;
  }
  if (localAction?.kind === "toggle-fast") {
    if (agentStatus) {
      const normalized = normalizeProviderModelConfig(
        thread.agentKind,
        thread.config,
        agentStatus.capabilities.models,
      );
      if (supportsUsableFastMode(agentStatus.capabilities, normalized.model)) {
        changeThreadConfig(thread.id, { ...normalized, fast: normalized.fast !== true });
      }
    }
    mentionRef.current?.clear();
    mentionRef.current?.focus();
    clearComposerText();
    return;
  }
  if (attachments.hasPendingUploads()) return;
  const submittedInputSegments = segments;
  const submittedAttachments = currentAttachments;
  const clearSubmittedComposer = () => {
    mentionRef.current?.clear();
    mentionRef.current?.focus();
    clearComposerText();
    attachments.clearAll();
  };
  const restoreSubmittedComposer = () => {
    mentionRef.current?.restoreFromSegments(submittedInputSegments);
    mentionRef.current?.focus();
    ctx.setPrompt(flat);
    ctx.setHasContent(flat.length > 0);
    if (submittedAttachments.length > 0) {
      attachments.restore(submittedAttachments);
    }
  };
  // Capture now, before approval denial or focus waits: the context belongs
  // to the moment the user sent this message.
  // Observe a capture rejection immediately, even while focus/approval awaits.
  const clientContextCapture = (async () => {
    try {
      return { context: await ctx.captureClientContext?.() };
    } catch (error) {
      return { error };
    }
  })();
  let clearedBeforeSendSettled = false;
  ctx.setIsSubmitting(true);
  let submission: DraftSubmission | undefined;
  let deliveryAccepted = false;
  const intent = ctx.usesPendingSteerPath
    ? ctx.followUpBehavior === "queue"
      ? "queue"
      : "steer"
    : "send";
  // Capture the revision synchronously at Send, before context/focus awaits.
  const preservation = preserveDraftSubmission({
    kind: "thread",
    ownerId: thread.id,
    target: thread,
    content: {
      segments: submittedInputSegments,
      attachments: submittedAttachments.map(storableAttachment),
    },
    segments: allSegments,
    intent,
    configuration: { config: thread.config },
  }).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  let outgoing = allSegments;
  const sameEditor = () =>
    JSON.stringify(ctx.latestSegmentsRef.current) === JSON.stringify(submittedInputSegments) &&
    JSON.stringify(attachments.getDraftAttachments()) ===
      JSON.stringify(submittedAttachments.map(storableAttachment));
  if (!usesTerminalPresentation) {
    useAppStore
      .getState()
      .requestChatScrollToPrompt(
        thread.id,
        ctx.usesPendingSteerPath && ctx.followUpBehavior === "queue",
      );
  }

  let focusPromise = Promise.resolve();
  if (ctx.needsFocusBeforeInput) {
    ctx.terminalPaneRef.current?.focus();
    focusPromise = new Promise<void>((resolve) => setTimeout(resolve, 80));
  }

  // If an approval is pending, send a decline before submitting the message.
  // The user's text becomes the next turn; the supervisor sees the denial
  // first, then the follow-up prompt explaining what to do differently.
  const denyPendingApproval = () => {
    if (ctx.usesPendingSteerPath && ctx.followUpBehavior === "queue") return Promise.resolve();
    const { activeRuntimeRequest, approvalDenyOption } = ctx;
    if (!activeRuntimeRequest || !approvalDenyOption) return Promise.resolve();
    const rollback = applyOptimisticRequestResolution(thread.id, activeRuntimeRequest, "declined");
    return resolveThreadServerRequest(thread.id, {
      requestId: activeRuntimeRequest.requestId,
      method: "requestPermission",
      response: { optionId: approvalDenyOption.optionId },
      analytics: {
        outcome: "declined",
        requestType: activeRuntimeRequest.requestType,
      },
    }).catch((err) => {
      console.error("[chat] auto-deny on composer submit failed", err);
      rollback();
      throw err;
    });
  };

  // GUI threads + working status → request a pending steer (replace-latest).
  // This renderer status can be optimistic; the supervisor waits out a
  // reconnect and drains the prompt as a normal turn when the live session is
  // authoritatively idle.
  // The supervisor fires the cancel and drains the slot when the in-flight
  // turn returns with `cancelled` stopReason. No optimistic chat paint —
  // the strip above the composer is the visual confirmation; the real
  // user_message item lands when the turn drains and starts.
  const runSubmission = async () => {
    const captured = await clientContextCapture;
    if ("error" in captured) throw captured.error;
    const clientContext = captured.context;
    if (!ctx.usesPendingSteerPath) {
      const outgoingSegments = outgoing.length > 0 ? outgoing : undefined;
      await (ctx.onSubmitInput
        ? ctx.onSubmitInput(flat, outgoingSegments)
        : submitThreadInput(thread.id, flat, outgoingSegments, { clientContext }));
      return;
    }
    if (ctx.followUpBehavior === "queue") {
      await readBridge().queueThreadFollowUp({
        threadId: thread.id,
        prompt: flat,
        config: thread.config,
        ...(outgoing.length > 0 ? { segments: outgoing } : {}),
        ...(clientContext ? { clientContext } : {}),
      });
    } else {
      await setThreadPendingSteer(
        thread,
        flat,
        outgoing.length > 0 ? outgoing : undefined,
        clientContext,
      );
    }
    captureThreadPromptSubmitted(
      thread,
      flat,
      outgoing.length > 0 ? outgoing : undefined,
      ctx.followUpBehavior === "queue" ? "follow_up" : "pending_steer",
    );
  };

  return focusPromise
    .then(async () => {
      const [captured, preserved] = await Promise.all([clientContextCapture, preservation]);
      if ("error" in preserved) throw preserved.error;
      submission = preserved.value;
      if ("error" in captured) throw captured.error;
      if (ctx.isCurrentSession()) ctx.submittedRef.current = true;
      if (!usesTerminalPresentation && ctx.isCurrentSession() && sameEditor()) {
        clearSubmittedComposer();
        clearedBeforeSendSettled = true;
      }
      outgoing = await materializeDraftSegments(
        thread,
        submission.segments,
        `draft-${submission.id}`,
        submission.isTargetCurrent,
      );
      await denyPendingApproval();
    })
    .then(() => {
      if (!submission) return;
      return dispatchDraftSubmission(submission, runSubmission);
    })
    .then(async () => {
      deliveryAccepted = true;
      if (submission) {
        if (ctx.usesPendingSteerPath) {
          // Queue/steer acknowledge volatile runtime staging. Retain the
          // client backup; it is not proof of a durable user-message commit.
          await updateClientSubmission(submission.id, "staged");
          const { composerDraftStorage } = await import("@/renderer/state/composerDraftStorage");
          await composerDraftStorage()?.acknowledge(submission.checkpoint, () =>
            useAppStore.getState().clearThreadDraftContent(thread.id),
          );
        } else
          await acceptDraftSubmission(submission, () =>
            useAppStore.getState().clearThreadDraftContent(thread.id),
          );
      }
      if (!ctx.isCurrentSession()) return;
      if (!clearedBeforeSendSettled && sameEditor()) clearSubmittedComposer();
      if (
        ctx.isCurrentSession() &&
        ctx.latestSegmentsRef.current.length === 0 &&
        attachments.getDraftAttachments().length === 0
      )
        ctx.onSubmitSuccess?.();
    })
    .catch(async (error: unknown) => {
      if (deliveryAccepted) {
        toast.danger(friendlyError(error));
        return;
      }
      if (submission) {
        const { readClientSubmission } =
          await import("@/renderer/state/composerDrafts/clientDraftDatabase");
        if (
          (await readClientSubmission(submission.id).catch(() => undefined))?.state === "prepared"
        )
          await updateClientSubmission(submission.id, "failed").catch(() => undefined);
      }
      if (ctx.resumesInterruptedTurn) {
        if (!isRemoteCommandOutcomeUncertainError(error)) toast.danger(friendlyError(error));
        return;
      }
      // Leave the prompt intact so the user can retry.
      const saved = useAppStore.getState().threadDraftContents[thread.id];
      if (
        !saved ||
        sameEditor() ||
        (ctx.isCurrentSession() &&
          ctx.latestSegmentsRef.current.length === 0 &&
          attachments.getDraftAttachments().length === 0)
      )
        useAppStore.getState().saveThreadDraftContent(thread.id, {
          segments: submittedInputSegments,
          attachments: submittedAttachments.map(storableAttachment),
        });
      if (isRemoteCommandOutcomeUncertainError(error) || remoteMutationMayHaveCommitted(error)) {
        // The command may have committed: the send action already reconciled
        // once and showed the localized uncertainty explanation. Keep the
        // optimistic paint and the saved draft, but do not restore the
        // composer — a blind resend could duplicate the effect.
        return;
      }
      if (
        ctx.isCurrentSession() &&
        clearedBeforeSendSettled &&
        ctx.latestSegmentsRef.current.length === 0 &&
        attachments.getDraftAttachments().length === 0
      )
        restoreSubmittedComposer();
      toast.danger(friendlyError(error));
    })
    .finally(() => {
      // The composer is now either cleared (success) or restored (failure);
      // either way the refs reflect the real state, so re-arm draft-saving.
      if (!ctx.isCurrentSession()) return;
      ctx.submittedRef.current = false;
      ctx.setIsSubmitting(false);
    });
}
