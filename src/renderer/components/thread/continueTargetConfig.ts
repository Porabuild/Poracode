import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import {
  capabilitiesForPresentation,
  filterHiddenModels,
  resolveModelSelection,
  resolveReasoningSelection,
} from "@/shared/agentSelection";
import type { RankedCrossagentCandidate } from "@/shared/crossagentRanking";
import { modelFamilyForModel } from "@/shared/modelFamilySelection";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { carryOverComposerMcpConfig } from "../composer/carryOverMcpConfig";
import { launchSelectionFields, supportsUsableFastMode } from "./threadDraftViewHelpers";

/**
 * Pure target-config resolution for the continue-in-provider dialog: the
 * capability surface its pickers display and the complete target config
 * resolved against it.
 */

/** The model/reasoning/Fast values the ranked provider is normally launched with. */
export function preferredConfigPatch(
  ranked: RankedCrossagentCandidate | undefined,
): Partial<ThreadConfig> {
  const selection = ranked?.preferredSelection;
  if (!selection?.model) return {};
  return {
    model: selection.model,
    ...(selection.effort ? { effort: selection.effort } : {}),
    ...(selection.fast ? { fast: true } : {}),
  };
}

function resolveContextSizeValue(
  capabilities: AgentCapability,
  model: string,
  preferred?: string,
): string | undefined {
  const allowed = capabilities.modelContextSizes?.[model];
  if (!allowed?.length) return capabilities.defaultContextSize;
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0];
}

function resolveModeValue(
  capabilities: AgentCapability,
  preferred?: ThreadConfig["mode"],
): ThreadConfig["mode"] | undefined {
  return preferred && capabilities.modes.includes(preferred)
    ? preferred
    : (capabilities.modes[0] ?? undefined);
}

/**
 * A saved/preferred id wins while the surface still advertises it. Otherwise
 * the handoff prefers the provider's bypass posture (a switch is an explicit
 * "carry this task over", not a fresh careful start), and only then falls back
 * to the provider's declared default — the same fallback the draft composer
 * applies via `resolveApprovalPolicyValue` / `resolveSandboxModeValue`.
 */
function resolveLabeledOptionValue(
  options: ReadonlyArray<{ id: string }>,
  preferred: string | undefined,
  bypass: string | undefined,
  declaredDefault: string | undefined,
): string {
  if (preferred !== undefined && options.some((o) => o.id === preferred)) {
    return preferred;
  }
  if (bypass && options.some((o) => o.id === bypass)) {
    return bypass;
  }
  if (declaredDefault && options.some((o) => o.id === declaredDefault)) {
    return declaredDefault;
  }
  return options[0]?.id ?? "";
}

/**
 * Resolve a target config against the capability surface the pickers in this
 * dialog actually display — presentation-scoped *and* hidden-model filtered.
 * Resolving against the unfiltered surface let a hidden model stay selected,
 * which the model picker then rendered as a bare id because the model is not
 * in the list it can label from.
 */
export function resolveDefaultConfig(
  capabilities: AgentCapability,
  presentationMode: ThreadPresentationMode,
  preferred?: Partial<ThreadConfig>,
  projectLocation?: ProjectLocation,
): ThreadConfig {
  const model = resolveModelSelection(capabilities, preferred?.model);
  const effort = resolveReasoningSelection(capabilities, model, preferred?.effort);
  const contextSize = resolveContextSizeValue(capabilities, model, preferred?.contextSize);
  const fast = supportsUsableFastMode(capabilities, model) ? preferred?.fast === true : false;
  const thinking = capabilities.thinkingModels?.includes(model)
    ? preferred?.thinking === true
    : false;
  const mode = resolveModeValue(capabilities, preferred?.mode);
  const approvalPolicy = resolveLabeledOptionValue(
    capabilities.approvalPolicies,
    preferred?.approvalPolicy,
    capabilities.bypassPermissions?.approvalPolicy,
    capabilities.defaultApprovalPolicy,
  );
  const sandboxMode = resolveLabeledOptionValue(
    capabilities.sandboxModes,
    preferred?.sandboxMode,
    capabilities.bypassPermissions?.sandboxMode,
    capabilities.defaultSandboxMode,
  );

  // A kept family member owns its exact carriers (own empty/false values and
  // absence) and any recorded binding; deliberate edits re-derive the binding
  // through the shared mutation.
  const familySelection =
    preferred?.model === model && modelFamilyForModel(capabilities, model)
      ? launchSelectionFields({ ...preferred, model }, capabilities)
      : undefined;

  return {
    ...(familySelection ?? {
      model,
      ...(effort ? { effort } : {}),
      ...(contextSize ? { contextSize } : {}),
      ...(fast ? { fast } : {}),
      ...(thinking ? { thinking } : {}),
    }),
    ...(mode ? { mode } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
    ...(preferred?.approvalsReviewer ? { approvalsReviewer: preferred.approvalsReviewer } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
    // The MCP servers the user turned on for this task follow it into the
    // target provider, minus the ones that provider cannot honor.
    ...carryOverComposerMcpConfig(capabilities, presentationMode, preferred ?? {}, projectLocation),
  };
}

/**
 * The capability surface this dialog's pickers show for one agent: scoped to
 * the presentation mode, then stripped of the models the user hid for that
 * surface. If hiding leaves nothing selectable, the unfiltered surface stands
 * in so the handoff still has a model to launch with.
 */
export function visibleCapabilities(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
  hiddenModelsByKey: Readonly<Record<string, readonly string[] | undefined>>,
): AgentCapability {
  const presentationCapabilities = capabilitiesForPresentation(
    agent.capabilities,
    presentationMode,
  );
  const filtered = filterHiddenModels(
    presentationCapabilities,
    hiddenModelsByKey[modelVisibilityKey(agent.kind, presentationMode)],
  );
  return filtered.models.length > 0 ? filtered : presentationCapabilities;
}
