import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { ExtractContextResult, PromptSegment, Thread, ThreadConfig } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import { buildHandoffLaunchInput } from "./providerHandoff";

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
  extractedContext: ExtractContextResult | null;
  targetLabel: string;
}): Promise<void> {
  const { thread, targetAgentKind, targetConfig, extractedContext, targetLabel } = input;
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
    extractedContext,
  });

  const store = useAppStore.getState();
  const fromAgentKind = thread.agentKind;
  store.applyProviderSwitch(thread.id, {
    agentKind: targetAgentKind,
    config: targetConfig,
    presentationMode: "gui",
  });
  store.queueThreadLaunch(thread.id, launch.prompt, launch.segments, undefined, {
    fromAgentKind,
  });

  toast.success(i18n._(msg`Switched to ${targetLabel}`));
}
