import { useEffect, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import type { AgentStatus, ThreadConfig } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadComposer } from "./ThreadComposer";
import { useProviderTargetSelection } from "./providerTargetSelection";

export interface MoveThreadAgentValue {
  readonly kind: string;
  readonly config: ThreadConfig;
}

/**
 * The move-to-machine target agent picker: the same provider/model/effort/
 * context/fast/access controls the continue-in-provider dialog offers, over a
 * plain chat message box. Chat presentation only — no attachments, slash
 * commands, mentions, MCP, crew, or plan-mode panel. Unlike that dialog the
 * candidate list includes the thread's own agent, so the user can keep the
 * provider or switch to any other ready one on every move.
 *
 * The component is uncontrolled: `value` seeds the opening selection (the
 * dialog remounts it per target via `key`), and `onChange` reports the live
 * `{ agentKind, config }` the move commit should carry.
 */
export function MoveThreadAgentComposer(props: {
  readonly agents: readonly AgentStatus[];
  readonly value: MoveThreadAgentValue;
  readonly onChange: (next: MoveThreadAgentValue) => void;
  readonly prompt: string;
  readonly onPromptChange: (value: string) => void;
  readonly placeholder: string;
  readonly isDisabled: boolean;
}) {
  const { t } = useLingui();
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const providerConfigs = useSharedSettings((s) => s.providerConfigs);
  const providerModelPreferences = useSharedSettings((s) => s.providerModelPreferences);
  const lastPresentationModeByAgent = useSharedSettings((s) => s.lastPresentationModeByAgent);
  const setLastPresentationMode = useSharedSettings((s) => s.setLastPresentationMode);

  const selection = useProviderTargetSelection({
    agents: props.agents,
    initialAgentKind: props.value.kind,
    initialPresentationMode: "gui",
    resolveInitialConfig: () => props.value.config,
    providerConfigs,
    providerModelPreferences,
    hiddenModelsByAgent: hiddenModels,
    lastPresentationModeByAgent,
    sourcePresentationMode: "gui",
    setLastPresentationMode,
    isDisabled: props.isDisabled,
  });

  const onChangeRef = useRef(props.onChange);
  useEffect(() => {
    onChangeRef.current = props.onChange;
  });
  useEffect(() => {
    onChangeRef.current({ kind: selection.agentKind, config: selection.config });
  }, [selection.agentKind, selection.config]);

  const { agentKind, presentationMode, config } = selection;
  return (
    <ThreadComposer
      compact
      variant="draft"
      hideSubmitButton
      controls={selection.controls}
      toolbarLayoutKey={[
        agentKind,
        presentationMode,
        config.model,
        config.effort ?? "",
        config.contextSize ?? "",
        config.fast ? "fast" : "normal",
        config.thinking ? "thinking" : "standard",
      ].join("|")}
      prompt={props.prompt}
      placeholder={props.placeholder}
      promptDisabled={props.isDisabled}
      submitLabel={t`Move`}
      submitDisabled
      onPromptChange={props.onPromptChange}
      onSubmit={() => undefined}
    />
  );
}
