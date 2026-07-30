import { Modal, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Crown } from "lucide-react";
import type { AgentStatus, ExperimentJudgeMode } from "@/shared/contracts";
import { Button } from "@/renderer/components/common/Button";
import {
  buildModelPickerControls,
  buildProviderModelMenuProviders,
} from "@/renderer/components/thread/buildModelPickerControls";
import { ThreadComposer } from "@/renderer/components/thread/ThreadComposer";
import {
  resolveEffortValue,
  resolveFastValue,
  resolveModelValue,
} from "@/renderer/components/thread/threadDraftViewHelpers";

export interface ExperimentJudgeConfig {
  agentKind: string;
  model: string;
  effort: string;
  fast: boolean;
  mode: ExperimentJudgeMode;
}

export function resolveExperimentJudgeConfig(
  agents: readonly AgentStatus[],
  saved: Omit<ExperimentJudgeConfig, "mode"> & { mode?: ExperimentJudgeMode },
): ExperimentJudgeConfig | null {
  const agent = agents.find((candidate) => candidate.kind === saved.agentKind) ?? agents[0];
  if (!agent) return null;

  const useSavedConfig = agent.kind === saved.agentKind;
  const model = resolveModelValue(agent, useSavedConfig ? saved.model : undefined);
  return {
    agentKind: agent.kind,
    model,
    effort: resolveEffortValue(agent, model, useSavedConfig ? saved.effort : undefined),
    fast: resolveFastValue(agent, model, useSavedConfig ? saved.fast : undefined),
    mode: saved.mode ?? "changes",
  };
}

export function ExperimentJudgeDialog(props: {
  agents: AgentStatus[];
  config: ExperimentJudgeConfig;
  onChange: (config: ExperimentJudgeConfig) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const selectedAgent =
    props.agents.find((candidate) => candidate.kind === props.config.agentKind) ?? props.agents[0];
  const controls = selectedAgent
    ? buildModelPickerControls({
        providers: buildProviderModelMenuProviders(props.agents),
        selectedAgentKind: selectedAgent.kind,
        model: props.config.model,
        effort: props.config.effort,
        fast: props.config.fast,
        capabilities: selectedAgent.capabilities,
        hideLabelOnWrap: false,
        includeFastToggle: true,
        onProviderModelChange: (next) => {
          const nextAgent = props.agents.find((candidate) => candidate.kind === next.agentKind);
          if (!nextAgent) return;
          const model = resolveModelValue(nextAgent, next.model);
          props.onChange({
            agentKind: nextAgent.kind,
            model,
            effort: resolveEffortValue(nextAgent, model, props.config.effort),
            fast: resolveFastValue(nextAgent, model, props.config.fast),
            mode: props.config.mode,
          });
        },
        onConfigPatch: (patch) => {
          props.onChange({
            ...props.config,
            ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
            ...(patch.fast !== undefined ? { fast: patch.fast } : {}),
          });
        },
      })
    : [];

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Container size="sm">
        <Modal.Dialog className="sm:max-w-[480px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-default text-foreground">
              <Crown className="size-5" />
            </Modal.Icon>
            <Modal.Heading>
              <Trans>AI judge</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5">
            <p className="text-sm text-muted">
              {props.config.mode === "responses" ? (
                <Trans>
                  The selected model compares each candidate's chat response under anonymous labels.
                  Files in their worktrees are ignored.
                </Trans>
              ) : (
                <Trans>
                  The selected model compares snapshots of each candidate's changes under anonymous
                  labels. It recommends a winner without merging anything.
                </Trans>
              )}
            </p>
            <ToggleButtonGroup
              aria-label={t`Mode`}
              className="h-8 w-fit [&_button]:h-8 [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-3"
              selectionMode="single"
              disallowEmptySelection
              size="sm"
              selectedKeys={[props.config.mode]}
              onSelectionChange={(keys) => {
                const mode = [...keys][0] as ExperimentJudgeMode | undefined;
                if (mode) props.onChange({ ...props.config, mode });
              }}
            >
              <ToggleButton id="changes">
                <Trans>Changes</Trans>
              </ToggleButton>
              <ToggleButton id="responses">
                <Trans>Chat</Trans>
              </ToggleButton>
            </ToggleButtonGroup>
            <div className="-ml-1.5">
              <ThreadComposer
                compact
                toolbarOnly
                hideSubmitButton
                controls={controls}
                placeholder=""
                prompt=""
                submitDisabled
                submitLabel=""
                onPromptChange={() => undefined}
                onSubmit={() => undefined}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Cancel</Trans>
            </Button>
            <Button isDisabled={!props.config.model} onPress={props.onConfirm}>
              <Trans>Crown with AI</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
