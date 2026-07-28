import type { ProjectLocation, PromptSegment, TerminalSize, Thread } from "@/shared/contracts";
import { resolveMcpLaunchSnapshot } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { captureThreadPromptSubmitted, captureThreadStarted } from "@/renderer/analytics/posthog";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export async function performInitialThreadLaunch(input: {
  thread: Thread;
  projectLocation: ProjectLocation;
  prompt: string;
  segments?: PromptSegment[];
  initialSize: TerminalSize;
}): Promise<void> {
  const { thread, projectLocation, prompt, segments, initialSize } = input;
  const presentation = thread.presentationMode ?? "terminal";
  if (thread.config.model) {
    useSharedSettings
      .getState()
      .pushRecentModel(
        thread.agentKind,
        thread.config.model,
        presentation,
        thread.config.effort,
        thread.config.fast,
      );
  }

  let optimisticUserMessageItemId: string | undefined;
  if (presentation === "gui" && prompt.length > 0 && thread.sessionRef === undefined) {
    optimisticUserMessageItemId = `user-${crypto.randomUUID()}`;
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: optimisticUserMessageItemId,
      itemType: "user_message",
      payload: { content: buildPromptContentBlocks(prompt, segments) },
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: optimisticUserMessageItemId,
    });
    useAppStore.getState().updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: thread.canResumeWithConfig,
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    });
  }

  if (optimisticUserMessageItemId && !isHomeProjectId(thread.projectId)) {
    await captureFileCheckpoint({
      threadId: thread.id,
      checkpointItemId: optimisticUserMessageItemId,
      projectLocation,
    });
  }

  const sharedSettings = useSharedSettings.getState();
  const projectMcpServers =
    useAppStore.getState().projects.find((project) => project.id === thread.projectId)
      ?.mcpServers ?? [];
  const mcpLaunchSnapshot = resolveMcpLaunchSnapshot(sharedSettings, projectMcpServers);
  // Record which custom servers this session launches with so the active
  // composer's MCP menu can show the run's actual bindings (settings may
  // change afterwards without affecting the running session).
  useAppStore.getState().setThreadMcpLaunchCustomServerNames(
    thread.id,
    mcpLaunchSnapshot.mcpServers.map((server) => server.name),
  );
  await readBridge().startThread({
    threadId: thread.id,
    projectLocation,
    agentKind: thread.agentKind,
    ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
    config: thread.config,
    prompt,
    ...(segments ? { segments } : {}),
    initialSize,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
    ...mcpLaunchSnapshot,
    ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
  });
  captureThreadStarted(thread);
  if (prompt.length > 0 || (segments?.length ?? 0) > 0) {
    captureThreadPromptSubmitted(thread, prompt, segments, "initial");
  }
}
