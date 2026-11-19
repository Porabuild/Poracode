import {
  emptyMcpLaunchSnapshot,
  retainThreadToolOverrides,
  type ExtractContextResult,
  type Project,
  type Thread,
} from "@/shared/contracts";
import type { ThreadHandoffInput, ThreadHandoffResult } from "@/shared/contracts/threadHandoff";
import { capabilitiesForPresentation, agentStatusForPresentation } from "@/shared/agentSelection";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { continuesInPlace, supportsPresentation } from "@/shared/continueProviderRanking";
import { buildHandoffTranscriptContext, handoffTranscriptBudget } from "@/shared/handoffTranscript";
import {
  resolveProviderHandoffStrategy,
  targetGuaranteesReadThreadTool,
} from "@/shared/providerHandoff";
import { defaultHandoffPrompt } from "@/shared/providerHandoffLaunch";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { dbGetThreadRuntimeItems } from "@/host/db";
import { resolveThreadInputSegments } from "@/host/threads/threadInputSegments";
import type { RemoteServerContext } from "./context";

/** Resolve the target and prepare context before changing thread ownership. */
export async function prepareHandoffContext(
  ctx: RemoteServerContext,
  input: ThreadHandoffInput,
  source: Thread,
  project: Project,
  admitSource: () => void,
) {
  const { sourceThreadId, agentKind, presentationMode } = input;
  const targetDistro = input.config.executionEnvironment?.distro;
  if (source.worktreePath) {
    const { worktrees } = await ctx.options.callSupervisor("gitListWorktrees", {
      projectLocation: project.location,
    });
    const key = (path: string) =>
      normalizeWorktreePathForComparison(path, project.location.kind === "windows");
    const expected = key(source.worktreePath);
    if (!worktrees.some((worktree) => !worktree.isMain && key(worktree.path) === expected)) {
      throw new Error("The source checkout is no longer registered with its project.");
    }
  }
  const wslDistros = [
    ...new Set([
      ...(project.location.kind === "wsl" ? [project.location.distro] : []),
      ...(targetDistro ? [targetDistro] : []),
    ]),
  ];
  const { windows, wsl } = await ctx.options.callSupervisor("getAgentStatuses", { wslDistros });
  const nearby = getProjectAgentStatuses(project.location, windows, wsl);
  const sourceAgent = nearby.find((agent) => agent.kind === source.agentKind);
  const target = (
    targetDistro ? wsl.filter((agent) => agent.envDistro === targetDistro) : nearby
  ).find((agent) => agent.kind === agentKind && agent.installed);
  if (!target || !supportsPresentation(target, presentationMode)) {
    throw new Error("The selected provider is unavailable in that presentation on this host.");
  }
  const sourceMode =
    source.presentationMode ?? sourceAgent?.capabilities.presentationMode ?? "terminal";
  const inPlace = input.intent === "switch" && continuesInPlace(sourceMode, presentationMode);
  const config = inPlace ? retainThreadToolOverrides(input.config, source.config) : input.config;
  const snapshot =
    ctx.options.resolveMcpLaunchSnapshot?.(project.id, config.mcpServerOverrides) ??
    emptyMcpLaunchSnapshot();

  let extracted: ExtractContextResult | null = null;
  let strategy: "thread-transcript" | "context-file" = "context-file";
  if (!input.withoutContext) {
    if (continuesInPlace(sourceMode, presentationMode)) {
      const states = await ctx.options.callSupervisor("getThreadSnapshots", {});
      strategy = resolveProviderHandoffStrategy({
        sourcePresentationMode: sourceMode,
        targetPresentationMode: presentationMode,
        readThreadToolEnabled:
          !snapshot.disabledBuiltInMcpServerIds.includes("app-controls") &&
          !(snapshot.disabledBuiltInMcpTools?.["app-controls"] ?? []).includes("read_thread") &&
          (config.pluginOverrides?.["app-controls"] ??
            snapshot.projectPluginOverrides?.["app-controls"]) !== false,
        threadResolvedReadThreadTool: states.some(
          (state) =>
            state.threadId === sourceThreadId &&
            state.agentKind === source.agentKind &&
            state.threadMentionToolsAvailable === true,
        ),
        targetReadThreadToolGuaranteed: targetGuaranteesReadThreadTool(
          capabilitiesForPresentation(target.capabilities, presentationMode),
          presentationMode,
        ),
      });
    }
    admitSource();
    if (strategy === "context-file" && sourceMode === "gui") {
      extracted = buildHandoffTranscriptContext(
        source,
        sourceAgent?.label ?? source.agentKind,
        await dbGetThreadRuntimeItems(sourceThreadId),
        handoffTranscriptBudget(config.contextSize),
      );
    }
    if (strategy === "context-file" && !extracted && source.sessionRef) {
      admitSource();
      const sourceCaps = sourceAgent
        ? agentStatusForPresentation(sourceAgent, sourceMode, source.sessionRef).capabilities
        : undefined;
      const model = source.config.model;
      const efforts = sourceCaps?.modelEfforts?.[model] ?? sourceCaps?.efforts ?? [];
      const effort = efforts.includes(source.config.effort ?? "")
        ? (source.config.effort ?? "")
        : sourceCaps?.defaultEffort && efforts.includes(sourceCaps.defaultEffort)
          ? sourceCaps.defaultEffort
          : (efforts[0] ?? "");
      extracted = await ctx.options.callSupervisor("extractContext", {
        threadId: sourceThreadId,
        agentKind: source.agentKind,
        sessionRef: source.sessionRef,
        projectLocation: project.location,
        ...(source.worktreePath ? { worktreePath: source.worktreePath } : {}),
        selection: input.extractionSelection ?? { model, effort },
      });
    }
  }
  const context: ThreadHandoffResult["context"] =
    strategy === "thread-transcript" ? strategy : extracted ? "context-file" : "none";
  const segments = await resolveThreadInputSegments(input.segments ?? [], input.prompt ?? "");
  const displayPrompt = segments
    .filter((segment) => segment.kind !== "attachment")
    .map(inlinePromptSegmentText)
    .join("")
    .trim();
  const prompt =
    input.prompt?.trim() ||
    displayPrompt ||
    (context === "none"
      ? "Continue the task using the current checkout."
      : defaultHandoffPrompt(context));
  const promptSegments =
    segments.length > 0 ? await resolveThreadInputSegments(segments, prompt) : undefined;

  return { inPlace, config, context, strategy, extracted, prompt, promptSegments };
}
