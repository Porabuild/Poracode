import { z } from "zod";
import {
  generateCommitMessagePayloadSchema,
  generatePrSummaryPayloadSchema,
  type AgentKind,
  type ProjectLocation,
} from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { resolveAiLanguageName } from "@/shared/locale";
import { toErrorMessage } from "@/shared/errorMessage";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, resolveLocation, type AppControlsToolContext } from "./types";

const scope = {
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
};
const agentKind = generateCommitMessagePayloadSchema.shape.agentKind.optional();
type GenerationTarget = {
  projectLocation: ProjectLocation;
  agentKind: AgentKind;
  selection?: ModelSelection;
  language?: string;
};

async function generateGitText<T extends object>(
  input: {
    projectId: string;
    worktreePath?: string | undefined;
    agentKind?: AgentKind | undefined;
    selection?: ModelSelection | undefined;
    language?: string | undefined;
  },
  ctx: AppControlsToolContext,
  generate: (target: GenerationTarget) => Promise<T>,
): Promise<T & { provider: AgentKind }> {
  const projectLocation = await resolveLocation(ctx, input.projectId, input.worktreePath);
  const settings = ctx.settings.read();
  const wsl = projectLocation.kind === "wsl";
  const configuredAgent = wsl ? settings.wslCommitGenProvider : settings.commitGenProvider;
  const choice = input.agentKind ?? configuredAgent;
  const savedSelection = wsl ? settings.wslCommitGenSelection : settings.commitGenSelection;
  const legacySelection = wsl
    ? {
        model: settings.wslCommitGenModel,
        effort: settings.wslCommitGenEffort,
        fast: settings.wslCommitGenFast,
      }
    : {
        model: settings.commitGenModel,
        effort: settings.commitGenEffort,
        fast: settings.commitGenFast,
      };
  const selection: ModelSelection | undefined =
    input.selection ??
    (input.agentKind === undefined
      ? (savedSelection ??
        (choice === "auto" ? { ...legacySelection, model: "" } : legacySelection))
      : undefined);
  const language =
    input.language ??
    resolveAiLanguageName(settings.gitTextLanguage, settings.locale, [
      Intl.DateTimeFormat().resolvedOptions().locale,
    ]);
  const target = {
    projectLocation,
    ...(selection === undefined ? {} : { selection }),
    ...(language === undefined ? {} : { language }),
  };
  if (choice !== "auto") {
    if (!choice || choice === "disabled")
      throw new Error("Choose a provider to generate Git text.");
    return { ...(await generate({ ...target, agentKind: choice })), provider: choice };
  }

  const response = await ctx.supervisor.getAgentStatuses({
    wslDistros: projectLocation.kind === "wsl" ? [projectLocation.distro] : [],
  });
  const bindingOwner = selection?.selectionBinding?.owner.agentKind;
  const candidates = getProjectAgentStatuses(projectLocation, response.windows, response.wsl)
    .filter(
      (provider) =>
        provider.installed &&
        provider.authState !== "missing" &&
        provider.capabilities.supportsOneShot &&
        provider.capabilities.models.length > 0 &&
        (!bindingOwner || bindingOwner === provider.kind) &&
        (!selection?.model ||
          provider.capabilities.models.some(({ id }) => id === selection.model)),
    )
    .toSorted(
      (left, right) =>
        (left.capabilities.utilityRank ?? Number.MAX_SAFE_INTEGER) -
        (right.capabilities.utilityRank ?? Number.MAX_SAFE_INTEGER),
    );
  if (candidates.length === 0)
    throw new Error("No available provider supports this Git text selection.");
  const failures: string[] = [];
  for (const provider of candidates) {
    try {
      return {
        ...(await generate({ ...target, agentKind: provider.kind })),
        provider: provider.kind,
      };
    } catch (error) {
      failures.push(`${provider.label}: ${toErrorMessage(error)}`);
    }
  }
  throw new Error(`Automatic Git text generation failed. ${failures.join(" | ")}`);
}

export const gitTextTools = appControlToolDomain(
  defineAppControlTool({
    name: "generate_commit_message",
    description:
      "Draft a commit message from staged changes, or from the working tree when nothing is staged. The selected provider receives the change context. Pass projectId and an optional registered worktreePath. Omit agentKind to use the host’s Git-text preset, or select a provider explicitly. selection carries the exact model and reasoning controls. language overrides the host’s Git-text language.",
    input: generateCommitMessagePayloadSchema
      .omit({ projectLocation: true })
      .extend({ ...scope, agentKind })
      .strict(),
    run: (input, ctx) => {
      const runtime = requireAppRuntime(ctx);
      return generateGitText(input, ctx, (target) => runtime.call("generateCommitMessage", target));
    },
  }),
  defineAppControlTool({
    name: "generate_pr_summary",
    description:
      "Draft a pull request title and description from the commit log and diff between baseBranch and branch. The selected provider receives that change context. Pass projectId and an optional registered worktreePath. Omit agentKind to use the host’s Git-text preset, or select a provider explicitly. selection and language override the generation controls.",
    input: generatePrSummaryPayloadSchema
      .omit({ projectLocation: true })
      .extend({
        ...scope,
        agentKind,
        branch: generatePrSummaryPayloadSchema.shape.branch.regex(/^[^-]/u),
        baseBranch: generatePrSummaryPayloadSchema.shape.baseBranch.regex(/^[^-]/u),
      })
      .strict(),
    run: ({ branch, baseBranch, ...input }, ctx) => {
      const runtime = requireAppRuntime(ctx);
      return generateGitText(input, ctx, (target) =>
        runtime.call("generatePrSummary", { ...target, branch, baseBranch }),
      );
    },
  }),
);
