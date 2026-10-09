import type { RefObject } from "react";
import { canOpenSideChat, openSideChat } from "./SideChat/sideChatActions";
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
  requestOpenControl: (target: "model" | "effort") => void;
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
export function submitComposerPrompt(segments: PromptSegment[], ctx: ComposerSubmitContext): void {
  const { thread, agentStatus, attachments, mentionRef, usesTerminalPresentation } = ctx;
  const attachmentSegments = attachments.toSegments();
  // The `lc-selector` fence is parsed only by the GUI chat SelectorBadge; a
  // terminal-native agent reads raw text, so submit a plain sentence instead.
  const selectorSegments: PromptSegment[] = attachments.attachments
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
    supportsSideChat: ctx.presentationMode === "gui" && canOpenSideChat(thread.id),
  };
  const boundSegments = bindLeadingSkillUnlessLocalAction(
    segments,
    ctx.availableCommands,
    slashLookupContext,
  );
  const allSegments = [...attachmentSegments, ...selectorSegments, ...boundSegments];
  const flat = flattenSegments(allSegments);
  // Route side questions before approval denial, queueing or steering. The
  // parent may be working (or still connecting) and must remain untouched.
  const leadingSegment = boundSegments.find(
    (segment) => segment.kind !== "text" || segment.content.trim().length > 0,
  );
  const sideAction =
    leadingSegment?.kind === "text"
      ? resolveLocalSlashCommandAction(flattenSegments(boundSegments), slashLookupContext)
      : null;
  if (sideAction?.kind === "open-side-chat") {
    const draftAtSubmit = JSON.stringify(ctx.latestSegmentsRef.current);
    const attachmentsAtSubmit = JSON.stringify(attachments.getAttachments());
    const questionSegments = boundSegments.map((segment) =>
      segment === leadingSegment && segment.kind === "text"
        ? { ...segment, content: segment.content.replace(SIDE_CHAT_COMMAND_PREFIX, "") }
        : segment,
    );
    ctx.setIsSubmitting(true);
    const opening = sideAction.prompt
      ? openSideChat(thread.id, sideAction.prompt, [
          ...attachmentSegments,
          ...selectorSegments,
          ...questionSegments,
        ])
      : openSideChat(thread.id);
    void opening
      .then((opened) => {
        if (
          opened &&
          ctx.isCurrentSession() &&
          JSON.stringify(ctx.latestSegmentsRef.current) === draftAtSubmit &&
          JSON.stringify(attachments.getAttachments()) === attachmentsAtSubmit
        ) {
          mentionRef.current?.clear();
          if (sideAction.prompt) attachments.clearAll();
          ctx.setPrompt("");
          ctx.setHasContent(false);
          ctx.latestSegmentsRef.current = [];
          if (!sideAction.prompt && attachments.getAttachments().length > 0) {
            useAppStore.getState().saveThreadDraftContent(thread.id, {
              segments: [],
              attachments: attachments.getAttachments().map(storableAttachment),
            });
          } else useAppStore.getState().clearThreadDraftContent(thread.id);
        }
      })
      .catch((error: unknown) => toast.danger(friendlyError(error)))
      .finally(() => {
        if (ctx.isCurrentSession()) ctx.setIsSubmitting(false);
      });
    return;
  }
  if (!hasSendablePromptContent(flat, allSegments) || !ctx.canSubmit) return;
  const clearComposerText = () => {
    ctx.setPrompt("");
    ctx.setHasContent(false);
    ctx.latestSegmentsRef.current = [];
  };
  const localAction = resolveLocalActionUnlessSkill(allSegments, flat, slashLookupContext);
  if (localAction?.kind === "set-mode") {
    changeThreadConfig(thread.id, { ...thread.config, mode: localAction.mode });
    mentionRef.current?.clear();
    mentionRef.current?.focus();
    clearComposerText();
    return;
  }
  if (localAction?.kind === "open-control") {
    ctx.requestOpenControl(localAction.target);
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
  const submittedInputSegments = segments;
  const submittedAttachments = attachments.attachments;
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
  const clientContextCapture = ctx.captureClientContext?.();
  let clearedBeforeSendSettled = false;
  ctx.submittedRef.current = true;
  useAppStore.getState().clearThreadDraftContent(thread.id);
  ctx.setIsSubmitting(true);
  if (!usesTerminalPresentation) {
    useAppStore.getState().requestChatScrollToBottom(thread.id);
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
    const clientContext = await clientContextCapture;
    if (!ctx.usesPendingSteerPath) {
      const outgoingSegments = allSegments.length > 0 ? allSegments : undefined;
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
        ...(allSegments.length > 0 ? { segments: allSegments } : {}),
        ...(clientContext ? { clientContext } : {}),
      });
    } else {
      await setThreadPendingSteer(
        thread,
        flat,
        allSegments.length > 0 ? allSegments : undefined,
        clientContext,
      );
    }
    captureThreadPromptSubmitted(
      thread,
      flat,
      allSegments.length > 0 ? allSegments : undefined,
      ctx.followUpBehavior === "queue" ? "follow_up" : "pending_steer",
    );
  };

  if (!usesTerminalPresentation) {
    clearSubmittedComposer();
    clearedBeforeSendSettled = true;
  }

  void focusPromise
    .then(denyPendingApproval)
    .then(runSubmission)
    .then(() => {
      if (!ctx.isCurrentSession()) return;
      if (!clearedBeforeSendSettled) {
        clearSubmittedComposer();
      }
      if (ctx.isCurrentSession()) ctx.onSubmitSuccess?.();
    })
    .catch((error: unknown) => {
      // Leave the prompt intact so the user can retry.
      useAppStore.getState().saveThreadDraftContent(thread.id, {
        segments: submittedInputSegments,
        attachments: submittedAttachments.map(storableAttachment),
      });
      if (isRemoteCommandOutcomeUncertainError(error)) {
        // The command may have committed: the send action already reconciled
        // once and showed the localized uncertainty explanation. Keep the
        // optimistic paint and the saved draft, but do not restore the
        // composer — a blind resend could duplicate the effect.
        return;
      }
      if (ctx.isCurrentSession()) {
        restoreSubmittedComposer();
      }
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
