import type {
  AgentCapability,
  AgentStatus,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { capabilitiesForPresentation, modelSelectionFor } from "@/shared/agentSelection";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  bucketPromptLength,
  classifyAnalyticsModel,
  classifyModelFamily,
  normalizeAnalyticsProvider,
  normalizeComposerEffort,
  normalizeComposerFastMode,
  normalizeComposerPermission,
  normalizeComposerWorkMode,
  type ProductAnalyticsProperties,
} from "@/shared/analytics/posthogPrivacy";
import { getComposerControls } from "@/renderer/components/providers/providerComposer";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";

export type ThreadProductInput = Pick<
  Thread,
  "agentKind" | "config" | "presentationMode" | "sessionRef" | "worktreePath"
> &
  Partial<Pick<Thread, "projectId">>;

function statusForThread(thread: ThreadProductInput): AgentStatus | undefined {
  const statusState = useAgentStatusesStore.getState();
  if (thread.projectId) {
    const project = useAppStore
      .getState()
      .projects.find((candidate) => candidate.id === thread.projectId);
    if (project) {
      return getProjectAgentStatuses(
        project.location,
        statusState.agentStatuses,
        statusState.wslAgentStatuses,
      ).find((status) => status.kind === thread.agentKind);
    }
  }
  return [...statusState.agentStatuses, ...statusState.wslAgentStatuses].find(
    (status) => status.kind === thread.agentKind,
  );
}

function selectedControlLabel(control: ComposerControl): string | undefined {
  if (control.kind === "toggle") return control.label;
  if (
    control.kind === "static" ||
    control.kind === "provider-model" ||
    control.kind === "effort-context"
  ) {
    return undefined;
  }
  const selected = control.options.find((option) =>
    typeof option === "string" ? option === control.value : option.id === control.value,
  );
  return typeof selected === "string" ? selected : selected?.label;
}

function providerComposerProperties(input: {
  agentKind: string;
  capabilities: AgentCapability;
  config: ThreadConfig;
  presentationMode: ThreadPresentationMode;
}): ProductAnalyticsProperties {
  const factory = getComposerControls(input.agentKind);
  if (!factory) return {};
  const controls = factory({
    capabilities: input.capabilities,
    config: input.config,
    isDisabled: false,
    onConfigChange: () => {},
    presentationMode: input.presentationMode,
  });
  const modeControl = controls.find(
    (control) => "iconKind" in control && control.iconKind === "mode",
  );
  const permissionControl = controls.find(
    (control) => "iconKind" in control && control.iconKind === "permission",
  );
  const permissionLabel = permissionControl ? selectedControlLabel(permissionControl) : undefined;
  const permissionValue =
    permissionControl &&
    permissionControl.kind !== "toggle" &&
    permissionControl.kind !== "static" &&
    permissionControl.kind !== "provider-model" &&
    permissionControl.kind !== "effort-context"
      ? permissionControl.value
      : undefined;
  const normalizedPermissionFromLabel = normalizeComposerPermission(permissionLabel);
  const normalizedPermission =
    normalizedPermissionFromLabel !== "other"
      ? normalizedPermissionFromLabel
      : normalizeComposerPermission(permissionValue);

  return {
    ...(modeControl
      ? {
          work_mode: normalizeComposerWorkMode(
            modeControl.kind === "toggle" ? modeControl.label : selectedControlLabel(modeControl),
          ),
        }
      : {}),
    ...(permissionControl && normalizedPermission !== "other"
      ? { permission_level: normalizedPermission }
      : {}),
  };
}

export function agentConfigProductProperties(input: {
  agentKind: string;
  config: ThreadConfig;
  presentationMode?: ThreadPresentationMode;
  capabilities?: AgentCapability;
  includeProviderControls?: boolean;
}): ProductAnalyticsProperties {
  const { config } = input;
  const presentationMode =
    input.presentationMode ?? input.capabilities?.presentationMode ?? "terminal";
  const capabilities = input.capabilities
    ? input.presentationMode
      ? capabilitiesForPresentation(input.capabilities, presentationMode)
      : input.capabilities
    : undefined;
  const model = classifyAnalyticsModel(config.model);
  const modelFamily = classifyModelFamily(config.model);
  const modelCapabilities = capabilities
    ? modelSelectionFor(capabilities, config.model)
    : undefined;
  const effortAvailable = (modelCapabilities?.reasoning.values.length ?? 0) > 1;
  const contextOptions = capabilities?.modelContextSizes?.[config.model] ?? [];
  const thinkingAvailable = capabilities?.thinkingModels?.includes(config.model) === true;

  return {
    ...(config.browserMcp === true ? { browser_mcp: true } : {}),
    ...(config.chromeMcp === true ? { chrome_mcp: true } : {}),
    ...(config.computerUse === true ? { computer_use: true } : {}),
    ...(config.crossagentMcp === true ? { crossagent_mcp: true } : {}),
    ...(effortAvailable ? { effort: normalizeComposerEffort(config.effort) } : {}),
    ...(modelCapabilities?.fast.supported
      ? {
          fast_mode: modelCapabilities.fast.available
            ? normalizeComposerFastMode(config.fast)
            : "unavailable",
        }
      : {}),
    ...(input.includeProviderControls && contextOptions.length > 1
      ? { has_context_size: Boolean(config.contextSize) }
      : {}),
    model,
    model_family: modelFamily,
    ...(input.includeProviderControls && thinkingAvailable
      ? { thinking: config.thinking === true }
      : {}),
    ...(capabilities && input.includeProviderControls
      ? providerComposerProperties({
          agentKind: input.agentKind,
          capabilities,
          config,
          presentationMode,
        })
      : {}),
  };
}

export function segmentProperties(
  segments: readonly PromptSegment[] | undefined,
): ProductAnalyticsProperties {
  const counts = { text: 0, file: 0, attachment: 0, skill: 0, mcp: 0, diff_comment: 0 };
  for (const segment of segments ?? []) {
    counts[segment.kind] += 1;
  }
  return {
    attachment_segment_count: counts.attachment,
    file_segment_count: counts.file,
    mcp_segment_count: counts.mcp,
    segment_count: (segments ?? []).length,
    skill_segment_count: counts.skill,
    text_segment_count: counts.text,
  };
}

export function promptProductProperties(
  prompt: string,
  segments: readonly PromptSegment[] | undefined,
  source: string,
): ProductAnalyticsProperties {
  const textSegments = segments?.filter(
    (segment): segment is Extract<PromptSegment, { kind: "text" }> => segment.kind === "text",
  );
  const userText = textSegments ? textSegments.map((segment) => segment.content).join("") : prompt;
  const structuredKinds = new Set(
    (segments ?? []).filter((segment) => segment.kind !== "text").map((segment) => segment.kind),
  );
  let promptKind: string;
  if (source === "command_palette") {
    promptKind = "command";
  } else if (userText.trimStart().startsWith("/")) {
    promptKind = "slash";
  } else if (
    structuredKinds.size > 1 ||
    (structuredKinds.size === 1 && userText.trim().length > 0)
  ) {
    promptKind = "mixed";
  } else if (structuredKinds.size === 1) {
    promptKind = [...structuredKinds][0]!;
  } else if (userText.length > 0) {
    promptKind = "text";
  } else {
    promptKind = "empty";
  }
  return {
    prompt_kind: promptKind,
    prompt_length_bucket: bucketPromptLength(userText.length),
  };
}

export function threadProductProperties(
  thread: ThreadProductInput,
  segments?: readonly PromptSegment[],
  options?: { resolveCapabilities?: boolean },
): ProductAnalyticsProperties {
  const presentation = thread.presentationMode ?? "terminal";
  const status = options?.resolveCapabilities === false ? undefined : statusForThread(thread);
  const capabilities = status ? status.capabilities : undefined;
  return {
    ...agentConfigProductProperties({
      agentKind: thread.agentKind,
      config: thread.config,
      presentationMode: presentation,
      ...(capabilities ? { capabilities } : {}),
      includeProviderControls: true,
    }),
    ...segmentProperties(segments),
    has_session_ref: Boolean(thread.sessionRef),
    has_worktree: Boolean(thread.worktreePath),
    presentation,
    provider: normalizeAnalyticsProvider(thread.agentKind),
    runtime_kind: presentation === "gui" ? "structured" : "pty",
  };
}
