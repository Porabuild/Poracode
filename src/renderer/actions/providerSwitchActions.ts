import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type {
  ProviderHandoffItemPayload,
  PromptSegment,
  Thread,
  ThreadConfig,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import { buildHandoffLaunchInput, type ProviderHandoffContext } from "./providerHandoff";
import { appendOptimisticInitialUserMessage } from "./threadLaunchActions";

/**
 * Continue the same chat thread under a different provider, keeping its id,
 * title, and visible transcript. The old session is torn down by the
 * supervisor's own `startThread` (which begins with `closeThread`), so all this
 * has to do is retarget the thread, drop the now-meaningless session ref, and
 * queue the first prompt for the new agent.
 *
 * Only valid for a chat (GUI) target: a terminal thread is a raw PTY with no
 * place to keep the prior transcript, so that case still opens a replacement
 * thread (see `handleContinueInProvider`).
 */
export async function switchThreadProviderInPlace(input: {
  thread: Thread;
  targetAgentKind: string;
  targetConfig: ThreadConfig;
  prompt: string;
  segments: PromptSegment[] | undefined;
  handoffContext: ProviderHandoffContext;
  targetLabel: string;
}): Promise<void> {
  const { thread, targetAgentKind, targetConfig, handoffContext, targetLabel } = input;
  if (findExperimentByThreadId(thread.id)) return;
  // A mirrored thread's launch goes over the host connection; bail before
  // painting a divider the host cannot confirm.
  if (isRemoteProjectUnreachable(thread)) {
    toast.danger(
      i18n._(msg`This project's remote server is offline. Reconnect it to start a thread.`),
    );
    return;
  }

  const launch = await buildHandoffLaunchInput({
    threadId: thread.id,
    prompt: input.prompt,
    segments: input.segments,
    extractedContext: handoffContext.strategy === "context-file" ? handoffContext.extracted : null,
  });

  const store = useAppStore.getState();
  const fromAgentKind = thread.agentKind;
  store.applyProviderSwitch(thread.id, {
    agentKind: targetAgentKind,
    config: targetConfig,
    presentationMode: "gui",
  });

  // Paint the divider and the user's message now, before the launch reaches the
  // supervisor. Bringing up the new provider's session takes seconds, and the
  // switch already flipped the thread to "launching" — without these rows the
  // pane shows a working indicator with nothing above it. The supervisor emits
  // both again with these same ids, and the store's per-id dedupe drops the
  // duplicates.
  const handoffItemId = `handoff-${crypto.randomUUID()}`;
  const handoffPayload: ProviderHandoffItemPayload = {
    fromAgentKind,
    toAgentKind: targetAgentKind,
    at: new Date().toISOString(),
  };
  store.applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId: handoffItemId,
    itemType: "provider_handoff",
    payload: handoffPayload,
  });
  store.applyRuntimeEvent(thread.id, {
    type: "item.completed",
    threadId: thread.id,
    itemId: handoffItemId,
  });
  const switchedThread = useAppStore.getState().threads.find((row) => row.id === thread.id);
  const userMessageItemId = switchedThread
    ? appendOptimisticInitialUserMessage(switchedThread, launch.prompt, launch.segments)
    : undefined;

  // The strategy travels with the launch: only a "thread-transcript" switch
  // makes the supervisor point the incoming provider at this thread's own
  // transcript. A context-file switch already carries its context in the
  // prompt, and would otherwise be handed the same conversation twice.
  store.queueThreadLaunch(thread.id, launch.prompt, launch.segments, userMessageItemId, {
    providerSwitch: {
      fromAgentKind,
      handoffItemId,
      contextStrategy: handoffContext.strategy,
    },
  });

  toast.success(i18n._(msg`Switched to ${targetLabel}`));
}
