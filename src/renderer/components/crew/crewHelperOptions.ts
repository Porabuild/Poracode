import { useEffect, useState } from "react";
import {
  filterCrossagentCapabilities,
  isCrossagentProviderEnabled,
  presentedCrossagentCapabilities,
} from "@/shared/crossagentVisibility";
import type { AgentStatus } from "@/shared/contracts";
import { modelSelectionFor } from "@/shared/agentSelection";
import { pickCheaperHelperModel, type HelperModelLead } from "@/shared/modelTier";
import type {
  CrossagentExecution,
  CrossagentRoutingSnapshotEntry,
  CrossagentRoutingState,
} from "@/shared/crossagentRanking";
import type { SharedSettings } from "@/shared/settings";
import { readBridge, isRemoteSession } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { crewModelLabelOf } from "./crewComposerModel";
import {
  statusToMenuProvider,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import type { CrewMemberSelection } from "@/shared/crew";

type HelperVisibilitySettings = Pick<
  SharedSettings,
  "disabledAgents" | "hiddenModels" | "crossagentPausedProviders" | "crossagentHiddenModels"
>;

const EMPTY_CROSSAGENT_ROUTING: CrossagentRoutingState = { ranked: [], providers: [] };

export interface CrewHelperOptions {
  providers: ProviderModelMenuProvider[];
  ranked: readonly CrossagentRoutingSnapshotEntry[];
  modelLabelOf: (selection: CrewMemberSelection) => string;
  selectionFor: (agentKind: string, model: string) => CrewMemberSelection | undefined;
  /**
   * A new helper's model: the cheapest tier available, never the lead's exact
   * model, preferring the lead's own provider within a tier.
   */
  defaultSelectionFor: (lead: HelperModelLead) => CrewMemberSelection | undefined;
}

export function buildCrewHelperOptions(input: {
  statuses: readonly AgentStatus[];
  labelStatuses?: readonly AgentStatus[];
  settings: HelperVisibilitySettings;
  routing?: CrossagentRoutingState;
}): CrewHelperOptions {
  const statusByKind = new Map(input.statuses.map((status) => [status.kind, status]));
  const localRouting = input.routing;
  const providers: ProviderModelMenuProvider[] = [];

  if (localRouting) {
    const rankedModelsByKind = new Map<string, Set<string>>();
    for (const entry of localRouting.ranked) {
      const models = rankedModelsByKind.get(entry.provider) ?? new Set<string>();
      models.add(entry.model.id);
      rankedModelsByKind.set(entry.provider, models);
    }
    for (const entry of localRouting.providers) {
      const status = statusByKind.get(entry.kind);
      if (
        !status ||
        !status.installed ||
        status.authState !== "authenticated" ||
        !isCrossagentProviderEnabled(entry.kind, input.settings)
      ) {
        continue;
      }
      const execution: CrossagentExecution = entry.execution;
      const presented = presentedCrossagentCapabilities(execution, status.capabilities);
      const filtered = filterCrossagentCapabilities(
        entry.kind,
        execution,
        presented,
        input.settings,
      );
      const rankedModelIds = rankedModelsByKind.get(entry.kind);
      const models = filtered.models.filter((model) => rankedModelIds?.has(model.id));
      if (models.length === 0) continue;
      const provider = statusToMenuProvider(status);
      providers.push({
        ...provider,
        capabilities: { ...filtered, models },
        ...(execution === "structured" ? { presentationMode: "gui" as const } : {}),
      });
    }
  } else {
    for (const status of input.statuses) {
      if (
        !status.installed ||
        status.authState !== "authenticated" ||
        !isCrossagentProviderEnabled(status.kind, input.settings)
      ) {
        continue;
      }
      const extraHidden = new Set(input.settings.crossagentHiddenModels[status.kind] ?? []);
      const providerHidden = new Set([
        ...(input.settings.hiddenModels[status.kind] ?? []),
        ...(input.settings.hiddenModels[`${status.kind}-acp`] ?? []),
      ]);
      const models = status.capabilities.models.filter(
        (model) => !providerHidden.has(model.id) && !extraHidden.has(model.id),
      );
      if (models.length === 0) continue;
      providers.push({
        ...statusToMenuProvider(status),
        capabilities: { ...status.capabilities, models },
      });
    }
  }

  const ranked = (localRouting?.ranked ?? []).filter((entry) =>
    providers.some(
      (provider) =>
        provider.kind === entry.provider &&
        provider.capabilities.models.some((model) => model.id === entry.model.id),
    ),
  );

  const selectionFor = (agentKind: string, model: string): CrewMemberSelection | undefined => {
    const provider = providers.find((candidate) => candidate.kind === agentKind);
    if (!provider?.capabilities.models.some((candidate) => candidate.id === model))
      return undefined;
    const selection = modelSelectionFor(provider.capabilities, model);
    return {
      agentKind,
      model,
      ...(selection.reasoning.default ? { effort: selection.reasoning.default } : {}),
    };
  };
  const modelLabelOf = (selection: CrewMemberSelection) =>
    crewModelLabelOf(input.labelStatuses ?? input.statuses, selection);
  const defaultSelectionFor = (lead: HelperModelLead): CrewMemberSelection | undefined => {
    const preferRanked = localRouting !== undefined;
    const candidates =
      preferRanked && ranked.length > 0
        ? ranked.map((entry) => ({
            agentKind: entry.provider,
            model: entry.model.id,
            label: entry.model.label,
          }))
        : providers.flatMap((provider) =>
            provider.capabilities.models.map((model) => ({
              agentKind: provider.kind,
              model: model.id,
              label: model.label,
            })),
          );
    const pick = pickCheaperHelperModel(candidates, lead);
    return pick ? selectionFor(pick.agentKind, pick.model) : undefined;
  };

  return { providers, ranked, modelLabelOf, selectionFor, defaultSelectionFor };
}

export function useCrewHelperOptions(): CrewHelperOptions {
  const statuses = useAgentStatusesStore((state) => state.agentStatuses);
  const wslStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const disabledAgents = useSharedSettings((state) => state.disabledAgents);
  const hiddenModels = useSharedSettings((state) => state.hiddenModels);
  const crossagentPausedProviders = useSharedSettings((state) => state.crossagentPausedProviders);
  const crossagentHiddenModels = useSharedSettings((state) => state.crossagentHiddenModels);
  const remote = isRemoteSession();
  const routingRefreshKey = JSON.stringify([
    statuses,
    wslStatuses,
    disabledAgents,
    hiddenModels,
    crossagentPausedProviders,
    crossagentHiddenModels,
  ]);
  const [routingResult, setRoutingResult] = useState<{
    key: string;
    routing: CrossagentRoutingState | null;
  }>();
  useEffect(() => {
    if (remote) return;
    let active = true;
    const requestKey = routingRefreshKey;
    void Promise.resolve()
      .then(() => readBridge().getCrossagentRouting())
      .then((result) => {
        if (active) setRoutingResult({ key: requestKey, routing: result });
      })
      .catch(() => {
        if (active) setRoutingResult({ key: requestKey, routing: null });
      });
    return () => {
      active = false;
    };
  }, [remote, routingRefreshKey]);
  const routing = remote
    ? undefined
    : routingResult?.key === routingRefreshKey
      ? (routingResult.routing ?? EMPTY_CROSSAGENT_ROUTING)
      : EMPTY_CROSSAGENT_ROUTING;
  return buildCrewHelperOptions({
    statuses,
    labelStatuses: [...statuses, ...wslStatuses],
    settings: { disabledAgents, hiddenModels, crossagentPausedProviders, crossagentHiddenModels },
    ...(!remote && routing ? { routing } : {}),
  });
}
