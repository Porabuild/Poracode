import type { RefObject } from "react";
import { toast } from "@heroui/react";
import type {
  AgentSlashCommand,
  AgentStatus,
  PromptSegment,
  Thread,
  ThreadPresentationMode,
  UserInputOption,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
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
import type { useAttachments } from "../composer/useAttachments";
import { flattenSegments } from "../composer/serializeMentions";
import type { TerminalPaneHandle } from "./TerminalPane";
import { supportsUsableFastMode } from "./threadDraftViewHelpers";
import {
  bindLeadingSkillUnlessLocalAction,
  resolveLocalActionUnlessSkill,
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
  /** GUI thread with a working turn — stage the prompt as a pending steer. */
  usesPendingSteerPath: boolean;
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
  /** Runs only after the submitted input has been accepted. */
  onSubmitted?: (() => void) | undefined;
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
  };
  const boundSegments = bindLeadingSkillUnlessLocalAction(
    segments,
    ctx.availableCommands,
    slashLookupContext,
  );
  const allSegments = [...attachmentSegments, ...selectorSegments, ...boundSegments];
  const flat = flattenSegments(allSegments);
  if (flat.length === 0 || !ctx.canSubmit) return;
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
    if (agentStatus && supportsUsableFastMode(agentStatus.capabilities, thread.config.model)) {
      changeThreadConfig(thread.id, { ...thread.config, fast: thread.config.fast !== true });
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
  let clearedBeforeSendSettled = false;
  ctx.submittedRef.current = true;
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

  // GUI threads + working status → stage as pending steer (replace-latest).
  // The supervisor fires the cancel and drains the slot when the in-flight
  // turn returns with `cancelled` stopReason. No optimistic chat paint —
  // the strip above the composer is the visual confirmation; the real
  // user_message item lands when the turn drains and starts.
  const submit =
    ctx.onSubmitInput ??
    ((outgoingPrompt: string, outgoingSegments?: PromptSegment[]) =>
      submitThreadInput(thread.id, outgoingPrompt, outgoingSegments));
  const runSubmission = async () => {
    if (!ctx.usesPendingSteerPath) {
      await submit(flat, allSegments.length > 0 ? allSegments : undefined);
      return;
    }
    await setThreadPendingSteer(thread, flat, allSegments.length > 0 ? allSegments : undefined);
    captureThreadPromptSubmitted(
      thread,
      flat,
      allSegments.length > 0 ? allSegments : undefined,
      "pending_steer",
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
      if (!clearedBeforeSendSettled && ctx.isCurrentSession()) {
        clearSubmittedComposer();
      }
      if (ctx.isCurrentSession()) ctx.onSubmitted?.();
    })
    .catch((error: unknown) => {
      // Leave the prompt intact so the user can retry.
      if (ctx.isCurrentSession()) {
        restoreSubmittedComposer();
      } else {
        useAppStore.getState().saveThreadDraftContent(thread.id, {
          segments: submittedInputSegments,
          attachments: submittedAttachments,
        });
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
