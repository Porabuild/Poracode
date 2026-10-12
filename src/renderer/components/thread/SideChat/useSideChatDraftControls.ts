import type { ProviderModelSelection } from "@/renderer/components/common/ProviderModelMenu/parts/types";
import type { Project, Thread } from "@/shared/contracts";
import type { SideChatSelection } from "@/shared/ipc/sideChat";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { machineKeyForLocation } from "@/shared/machines";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { buildControls, buildProviderModelMenuProviders } from "../buildModelPickerControls";
import { resolveProviderDraftConfig } from "../threadDraftViewHelpers";
import type { ComposerControl } from "../ThreadComposer";

/** Use the ordinary chat controls, including provider-owned family selection semantics. */
export function useSideChatDraftControls(
  source: Thread,
  project: Project | undefined,
  selection: SideChatSelection,
  setSelection: (selection: SideChatSelection) => void,
  disabled: boolean,
): ComposerControl[] {
  const { agentStatuses } = useDraftEnvironment(project);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const providers = buildProviderModelMenuProviders(agentStatuses, {
    presentationMode: "gui",
    hiddenModelsByAgent: hiddenModels,
    filterAgent: (agent) =>
      agent.installed &&
      !disabledAgents.includes(agent.kind) &&
      (agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode]).includes(
        "gui",
      ),
  });
  const selected = agentStatuses.find((agent) => agent.kind === selection.agentKind);
  // The parent's live session inventory and reload consequences do not apply to a draft.
  const {
    sessionRef: _session,
    sessionConfigOptions: _options,
    agentInstanceId: _instance,
    ...base
  } = source;
  const draft: Thread = { ...base, ...selection, status: "launching", presentationMode: "gui" };
  const controls = buildControls(
    draft,
    selected,
    undefined,
    (config) => setSelection({ ...selection, config }),
    undefined,
    undefined,
    project ? machineKeyForLocation(project.location) : undefined,
  );
  return controls.map((control): ComposerControl => {
    if (control.kind === "static") return control;
    if (control.kind !== "provider-model") return { ...control, isDisabled: disabled };
    const { lockedAgentKind: _lock, ...unlocked } = control;
    return {
      ...unlocked,
      providers,
      isDisabled: disabled,
      onChange: (next: ProviderModelSelection) => {
        if (next.agentKind === selection.agentKind) {
          control.onChange(next);
          return;
        }
        const agent = agentStatuses.find((candidate) => candidate.kind === next.agentKind);
        if (!agent) return;
        const config = resolveProviderDraftConfig(agentStatusForPresentation(agent, "gui"), {});
        const target: Thread = {
          ...base,
          agentKind: agent.kind,
          config: { ...config, model: "" },
          status: "launching",
          presentationMode: "gui",
        };
        const targetControls = buildControls(target, agent, undefined, (nextConfig) =>
          setSelection({ agentKind: agent.kind, config: nextConfig }),
        );
        const picker = targetControls.find((candidate) => candidate.kind === "provider-model");
        if (picker?.kind === "provider-model") picker.onChange(next);
      },
    };
  });
}
