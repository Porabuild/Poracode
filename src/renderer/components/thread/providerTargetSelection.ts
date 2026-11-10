import { useState } from "react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  AgentCapability,
  AgentStatus,
  ProjectDraftConfig,
  ProjectLocation,
  ProviderDraftConfig,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import type { ProviderModelPreference } from "@/shared/settings";
import { applyThreadConfigMutation } from "@/shared/selectionBinding";
import {
  modelFamilyForModel,
  resolveFamilyPresentationTransition,
} from "@/shared/modelFamilySelection";
import {
  resolveInitialPresentationMode,
  supportsPresentation,
} from "@/shared/continueProviderRanking";
import { i18n } from "@/renderer/i18n/i18n";
import { composerMcpConfig } from "../composer/carryOverMcpConfig";
import {
  appendProviderComposerControls,
  buildModelPickerControls,
  buildProviderModelMenuProviders,
  resolveModelSelectionEdit,
} from "./buildModelPickerControls";
import type { ComposerControl } from "./ThreadComposer";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import type { ProviderModelSelectionIntent } from "@/renderer/components/common/ProviderModelMenu/parts/types";
import { composerSelectionEvent, type ComposerSelectionOrigin } from "./composerSelectionMutation";
import { resolveSavedProviderDraftConfig } from "./threadDraftViewHelpers";
import { resolveDefaultConfig, visibleCapabilities } from "./continueTargetConfig";

/**
 * The settings surface a target-provider selection resolves saved drafts
 * against. Both the continue-in-provider dialog and the move-thread composer
 * read the same app-wide per-provider draft config and per-model preferences.
 */
export interface ProviderTargetSelectionDeps {
  readonly lastDraftConfig?: ProjectDraftConfig | undefined;
  readonly providerConfigs: Record<string, ProviderDraftConfig>;
  readonly providerModelPreferences?: Record<string, Record<string, ProviderModelPreference>>;
  readonly hiddenModelsByAgent: Readonly<Record<string, readonly string[] | undefined>>;
}

/**
 * The saved draft posture for one target agent on one surface — the same
 * resolution the draft composer applies, scoped to the dialog's visible
 * (presentation-filtered, hidden-model-stripped) capability surface.
 */
export function savedProviderTargetConfig(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
  deps: ProviderTargetSelectionDeps,
): Partial<ThreadConfig> | undefined {
  return resolveSavedProviderDraftConfig(
    agent.kind,
    deps.lastDraftConfig,
    deps.providerConfigs,
    deps.providerModelPreferences ?? {},
    visibleCapabilities(agent, presentationMode, deps.hiddenModelsByAgent),
  );
}

export interface ProviderTargetSelectionOptions extends ProviderTargetSelectionDeps {
  /** Candidate target agents, in picker order. */
  readonly agents: readonly AgentStatus[];
  /** The agent the selection opens on; defaults to the first candidate. */
  readonly initialAgentKind?: string | undefined;
  /** The surface the selection opens on; defaults to the ranking resolution. */
  readonly initialPresentationMode?: ThreadPresentationMode | undefined;
  /**
   * Resolve the complete opening config for the initial agent/surface. Called
   * once; later picks resolve through the shared pick/patch handlers.
   */
  readonly resolveInitialConfig: (
    agent: AgentStatus,
    presentationMode: ThreadPresentationMode,
  ) => ThreadConfig;
  readonly projectLocation?: ProjectLocation | undefined;
  /** Last-used surface per agent, for surfaces a picked agent does not support. */
  readonly lastPresentationModeByAgent: Record<string, ThreadPresentationMode>;
  readonly sourcePresentationMode: ThreadPresentationMode;
  readonly setLastPresentationMode?:
    | ((kind: string, mode: ThreadPresentationMode) => void)
    | undefined;
  /** Disables every picker control (e.g. while a transfer is in flight). */
  readonly isDisabled?: boolean | undefined;
}

export interface ProviderTargetSelection {
  readonly agentKind: string;
  readonly config: ThreadConfig;
  readonly presentationMode: ThreadPresentationMode;
  readonly agent: AgentStatus | undefined;
  /** The visible capability surface the pickers display for the selection. */
  readonly capabilities: AgentCapability | undefined;
  readonly providers: ProviderModelMenuProvider[];
  readonly controls: ComposerControl[];
  readonly setPresentationMode: (mode: ThreadPresentationMode) => void;
  readonly handleProviderChange: (
    kind: string,
    preferred?: Partial<ThreadConfig>,
    selectionIntent?: ProviderModelSelectionIntent,
  ) => void;
  readonly handleModelPick: (next: {
    agentKind: string;
    model: string;
    selectionIntent?: ProviderModelSelectionIntent;
  }) => void;
  readonly handlePresentationModeChange: (mode: ThreadPresentationMode) => void;
  readonly handleConfigPatch: (
    patch: Partial<ThreadConfig>,
    origin?: ComposerSelectionOrigin,
  ) => void;
}

/**
 * The provider/model/effort/context/fast/access selection a target surface
 * (continue-in-provider, move-to-machine) resolves before launch. Owns the
 * selected kind, config and presentation mode plus the shared pick/patch
 * handlers so both dialogs apply identical semantics.
 */
export function useProviderTargetSelection(
  options: ProviderTargetSelectionOptions,
): ProviderTargetSelection {
  const {
    agents,
    initialAgentKind,
    initialPresentationMode,
    resolveInitialConfig,
    projectLocation,
    lastDraftConfig,
    providerConfigs,
    providerModelPreferences,
    hiddenModelsByAgent,
    lastPresentationModeByAgent,
    sourcePresentationMode,
    setLastPresentationMode,
    isDisabled,
  } = options;

  const deps: ProviderTargetSelectionDeps = {
    ...(lastDraftConfig !== undefined ? { lastDraftConfig } : {}),
    providerConfigs,
    providerModelPreferences: providerModelPreferences ?? {},
    hiddenModelsByAgent,
  };

  const initialAgent = agents.find((agent) => agent.kind === initialAgentKind) ?? agents[0];
  const openingMode =
    initialPresentationMode ??
    resolveInitialPresentationMode(
      initialAgent,
      lastPresentationModeByAgent,
      sourcePresentationMode,
    );

  const [agentKind, setAgentKind] = useState<string>(initialAgent?.kind ?? "");
  const [presentationMode, setPresentationMode] = useState<ThreadPresentationMode>(openingMode);
  const [config, setConfig] = useState<ThreadConfig>(() =>
    initialAgent ? resolveInitialConfig(initialAgent, openingMode) : { model: "" },
  );

  function savedConfigForAgent(
    agent: AgentStatus,
    mode: ThreadPresentationMode,
  ): Partial<ThreadConfig> | undefined {
    return savedProviderTargetConfig(agent, mode, deps);
  }

  function commitTargetSelection(
    resolved: ThreadConfig,
    kind: string,
    mode: ThreadPresentationMode,
    event: Parameters<typeof applyThreadConfigMutation>[0]["event"],
  ) {
    const { selectionBinding: _resolvedRecord, ...next } = resolved;
    setConfig(
      applyThreadConfigMutation({
        previous: config,
        next,
        owner: { agentKind: kind, presentationMode: mode },
        event,
      }),
    );
  }

  function familyTransitionFailureToast() {
    toast.danger(i18n._(msg`Can't use this model selection on that surface`));
  }

  function handleProviderChange(
    kind: string,
    preferred?: Partial<ThreadConfig>,
    selectionIntent?: ProviderModelSelectionIntent,
  ) {
    const agent = agents.find((a) => a.kind === kind);
    if (!agent) {
      setAgentKind(kind);
      return;
    }
    const nextPresentationMode = supportsPresentation(agent, presentationMode)
      ? presentationMode
      : resolveInitialPresentationMode(agent, lastPresentationModeByAgent, sourcePresentationMode);
    const capabilities = visibleCapabilities(agent, nextPresentationMode, hiddenModelsByAgent);
    let saved = savedConfigForAgent(agent, nextPresentationMode);
    let pick = preferred;
    let relation: ReturnType<typeof modelFamilyForModel>;
    if (preferred?.model !== undefined && modelFamilyForModel(capabilities, preferred.model)) {
      const { effort: _savedEffort, fast: _savedFast, ...savedBase } = saved ?? {};
      const patch = resolveModelSelectionEdit(
        capabilities,
        { ...savedBase, model: "" },
        selectionIntent === "family"
          ? { kind: "family", model: preferred.model }
          : { kind: "model", model: preferred.model },
      );
      if (patch === null) {
        familyTransitionFailureToast();
        return;
      }
      saved = savedBase;
      pick = { ...patch, model: patch.model ?? preferred.model };
      relation =
        selectionIntent === "family" ? modelFamilyForModel(capabilities, pick.model) : undefined;
    }
    setAgentKind(kind);
    if (nextPresentationMode !== presentationMode) {
      setPresentationMode(nextPresentationMode);
    }
    commitTargetSelection(
      resolveDefaultConfig(
        capabilities,
        nextPresentationMode,
        {
          ...saved,
          ...pick,
          ...composerMcpConfig(config),
        },
        projectLocation,
      ),
      agent.kind,
      nextPresentationMode,
      relation ? { type: "family-member-edit", relation } : { type: "owner-retarget" },
    );
  }

  function handleModelPick(next: {
    agentKind: string;
    model: string;
    selectionIntent?: ProviderModelSelectionIntent;
  }) {
    if (next.agentKind === agentKind && selectedCapabilities) {
      const capabilities = selectedCapabilities;
      if (
        (capabilities.modelFamilies?.length ?? 0) > 0 &&
        (modelFamilyForModel(capabilities, next.model) ||
          modelFamilyForModel(capabilities, config.model))
      ) {
        const family = next.selectionIntent === "family";
        const patch = resolveModelSelectionEdit(
          capabilities,
          config,
          family ? { kind: "family", model: next.model } : { kind: "model", model: next.model },
        );
        if (patch) {
          handleConfigPatch(patch, family ? { kind: "family-resolved" } : { kind: "raw-pick" });
        }
        return;
      }
    }
    handleProviderChange(next.agentKind, { model: next.model }, next.selectionIntent);
  }

  function handlePresentationModeChange(next: ThreadPresentationMode) {
    const nextAgent =
      selectedAgent && supportsPresentation(selectedAgent, next)
        ? selectedAgent
        : agents.find((agent) => supportsPresentation(agent, next));
    if (!nextAgent) return;
    const capabilities = visibleCapabilities(nextAgent, next, hiddenModelsByAgent);
    const transition =
      nextAgent.kind === agentKind && selectedCapabilities
        ? resolveFamilyPresentationTransition(selectedCapabilities, capabilities, config)
        : undefined;
    if (transition === null) {
      familyTransitionFailureToast();
      return;
    }

    setPresentationMode(next);
    setLastPresentationMode?.(nextAgent.kind, next);
    if (nextAgent.kind !== agentKind) setAgentKind(nextAgent.kind);
    const resolved = resolveDefaultConfig(
      capabilities,
      next,
      {
        ...savedConfigForAgent(nextAgent, next),
        ...(nextAgent.kind === agentKind ? config : composerMcpConfig(config)),
        ...transition,
      },
      projectLocation,
    );
    const relation = transition ? modelFamilyForModel(capabilities, resolved.model) : undefined;
    commitTargetSelection(
      resolved,
      nextAgent.kind,
      next,
      relation ? { type: "family-member-edit", relation } : { type: "owner-retarget" },
    );
  }

  function handleConfigPatch(patch: Partial<ThreadConfig>, origin?: ComposerSelectionOrigin) {
    if (!selectedAgent || !selectedCapabilities) return;
    commitTargetSelection(
      resolveDefaultConfig(
        selectedCapabilities,
        presentationMode,
        { ...config, ...patch },
        projectLocation,
      ),
      selectedAgent.kind,
      presentationMode,
      composerSelectionEvent(patch, origin, selectedCapabilities),
    );
  }

  const selectedAgent = agents.find((agent) => agent.kind === agentKind);
  const selectedCapabilities = selectedAgent
    ? visibleCapabilities(selectedAgent, presentationMode, hiddenModelsByAgent)
    : undefined;
  const providers = buildProviderModelMenuProviders(agents, {
    presentationMode,
    hiddenModelsByAgent,
    filterAgent: (agent) => supportsPresentation(agent, presentationMode),
  });
  const controls: ComposerControl[] = selectedAgent
    ? appendProviderComposerControls(
        buildModelPickerControls({
          providers,
          selectedAgentKind: agentKind,
          model: config.model,
          ...(config.effort ? { effort: config.effort } : {}),
          ...(config.contextSize ? { contextSize: config.contextSize } : {}),
          ...(config.fast ? { fast: config.fast } : {}),
          ...(config.thinking ? { thinking: config.thinking } : {}),
          capabilities: selectedCapabilities ?? selectedAgent.capabilities,
          presentationMode,
          ...(isDisabled !== undefined ? { isDisabled } : {}),
          onProviderModelChange: handleModelPick,
          onConfigPatch: handleConfigPatch,
        }),
        {
          agentKind,
          capabilities: selectedCapabilities ?? selectedAgent.capabilities,
          config,
          presentationMode,
          isDisabled: isDisabled ?? false,
          onConfigChange: handleConfigPatch,
        },
      )
    : [];

  return {
    agentKind,
    config,
    presentationMode,
    agent: selectedAgent,
    capabilities: selectedCapabilities,
    providers,
    controls,
    setPresentationMode,
    handleProviderChange,
    handleModelPick,
    handlePresentationModeChange,
    handleConfigPatch,
  };
}
