import { useState } from "react";
import { Modal, ToggleButton, Tooltip } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type {
  AgentStatus,
  ExtractContextResult,
  ProjectDraftConfig,
  ProjectLocation,
  Thread,
  ThreadConfig,
} from "@/shared/contracts";
import { Button, OptionMenu, PixelLoader } from "@/renderer/components/common";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { ProviderIcon, getComposerControls } from "@/renderer/components/providers";
import { EffortIcon } from "@/renderer/components/providers/EffortIcon";
import { PermissionIcon } from "@/renderer/components/providers/PermissionIcon";
import { readBridge } from "@/renderer/bridge";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { filterHiddenModels } from "@/renderer/components/thread/threadComposerOptions";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

type Phase = "select" | "extracting" | "error";

function renderComposerControl(control: ComposerControl, index: number) {
  if (control.kind === "static") return null;
  if (control.kind === "provider-model" || control.kind === "effort-context") return null;

  if (control.kind === "toggle") {
    const icon =
      control.iconKind === "permission" ? (
        <PermissionIcon
          className="size-4 text-foreground"
          index={control.isSelected ? 1 : 0}
          count={2}
        />
      ) : (
        control.icon
      );
    return (
      <Tooltip key={`toggle-${index}`}>
        <ToggleButton
          className={`lightcode-composer-toggle ${
            control.isCurrentState ? "lightcode-composer-toggle--current " : ""
          }min-w-0 px-2.5`}
          isDisabled={control.isDisabled ?? false}
          isSelected={control.isSelected}
          size="sm"
          variant="ghost"
          onChange={control.onChange ?? (() => undefined)}
        >
          {icon}
          <span>{control.label}</span>
        </ToggleButton>
        <Tooltip.Content placement="top">{control.label}</Tooltip.Content>
      </Tooltip>
    );
  }

  // Menu control
  const effortIds =
    control.iconKind === "effort"
      ? control.options.map((o) => (typeof o === "string" ? o : o.id))
      : undefined;
  const permissionIds =
    control.iconKind === "permission"
      ? control.options.map((o) => (typeof o === "string" ? o : o.id))
      : undefined;
  const icon = effortIds ? (
    <EffortIcon className="size-4 text-foreground" effort={control.value} efforts={effortIds} />
  ) : permissionIds ? (
    <PermissionIcon
      className="size-4 text-foreground"
      index={permissionIds.indexOf(control.value)}
      count={permissionIds.length}
    />
  ) : (
    control.icon
  );

  return (
    <OptionMenu
      key={`menu-${index}`}
      buttonVariant="ghost"
      className="lightcode-composer-menu min-w-0 px-2.5"
      options={control.options}
      value={control.value}
      onChange={control.onChange ?? (() => undefined)}
      icon={icon}
    />
  );
}

function resolveDefaultConfig(agent: AgentStatus, savedConfig?: ProjectDraftConfig): ThreadConfig {
  const models = agent.capabilities.models;
  const savedModel =
    savedConfig?.agentKind === agent.kind && savedConfig.model ? savedConfig.model : undefined;
  const model =
    savedModel && models.some((m) => m.id === savedModel) ? savedModel : (models[0]?.id ?? "");

  const efforts = agent.capabilities.modelEfforts?.[model] ?? agent.capabilities.efforts ?? [];
  const savedEffort = savedConfig?.agentKind === agent.kind ? savedConfig.effort : undefined;
  const effort =
    savedEffort && efforts.includes(savedEffort)
      ? savedEffort
      : agent.capabilities.defaultEffort && efforts.includes(agent.capabilities.defaultEffort)
        ? agent.capabilities.defaultEffort
        : efforts[0];

  const policies = agent.capabilities.approvalPolicies;
  const savedApproval =
    savedConfig?.agentKind === agent.kind ? savedConfig.approvalPolicy : undefined;
  const approvalPolicy =
    savedApproval && policies.some((p) => p.id === savedApproval) ? savedApproval : policies[0]?.id;

  return {
    model,
    ...(effort ? { effort } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
  };
}

export function ContinueInProviderDialog(props: {
  isOpen: boolean;
  thread: Thread;
  projectLocation: ProjectLocation;
  installedAgents: AgentStatus[];
  lastDraftConfig?: ProjectDraftConfig;
  onClose: () => void;
  onContinue: (
    targetAgentKind: string,
    targetConfig: ThreadConfig,
    closeOriginal: boolean,
    extractedContext: ExtractContextResult | null,
  ) => void;
}) {
  const { thread, installedAgents, onClose, onContinue } = props;

  const otherAgents = installedAgents.filter((a) => a.kind !== thread.agentKind);
  const [selectedKind, setSelectedKind] = useState<string>(otherAgents[0]?.kind ?? "");
  const [phase, setPhase] = useState<Phase>("select");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingCloseOriginal, setPendingCloseOriginal] = useState(false);

  const sourceAgent = installedAgents.find((a) => a.kind === thread.agentKind);
  const selectedAgent = otherAgents.find((a) => a.kind === selectedKind);

  // --- Target provider config ---
  const [targetConfig, setTargetConfig] = useState<ThreadConfig>(() =>
    selectedAgent ? resolveDefaultConfig(selectedAgent, props.lastDraftConfig) : { model: "" },
  );

  function handleProviderChange(kind: string) {
    setSelectedKind(kind);
    const agent = otherAgents.find((a) => a.kind === kind);
    if (agent) {
      setTargetConfig(resolveDefaultConfig(agent, props.lastDraftConfig));
    }
  }

  const hiddenTargetModelIds = useSharedSettings(
    (s) => s.hiddenModels[modelVisibilityKey(selectedKind)],
  );
  const targetControls = (
    selectedAgent
      ? (getComposerControls(selectedKind)?.({
          capabilities: filterHiddenModels(selectedAgent.capabilities, hiddenTargetModelIds),
          config: targetConfig,
          isDisabled: false,
          onConfigChange: (patch) => setTargetConfig((prev) => ({ ...prev, ...patch })),
        }) ?? [])
      : []
  ).filter((c) => !(c.kind === "toggle" && c.label === "Plan"));

  // --- Extraction config (source provider) ---
  const models = sourceAgent?.capabilities.models ?? [];
  const [extractModel, setExtractModel] = useState(thread.config.model || models[0]?.id || "");
  const [extractEffort, setExtractEffort] = useState("low");

  const hiddenModelIds = useSharedSettings(
    (s) => s.hiddenModels[modelVisibilityKey(thread.agentKind, thread.presentationMode)],
  );
  const filteredSourceCaps = sourceAgent
    ? filterHiddenModels(sourceAgent.capabilities, hiddenModelIds)
    : undefined;
  const extractionEfforts =
    filteredSourceCaps?.modelEfforts?.[extractModel] ?? filteredSourceCaps?.efforts ?? [];
  const modelEffortControls: ComposerControl[] =
    sourceAgent && thread.sessionRef && filteredSourceCaps
      ? [
          {
            options: filteredSourceCaps.models,
            value: extractModel,
            isDisabled: false,
            onChange: (value: string) => setExtractModel(value),
          },
          ...(extractionEfforts.length > 0
            ? [
                {
                  iconKind: "effort" as const,
                  options: extractionEfforts.map((id) => ({
                    id,
                    label: id.charAt(0).toUpperCase() + id.slice(1),
                  })),
                  value: extractEffort || extractionEfforts[0] || "",
                  isDisabled: false,
                  onChange: (value: string) => setExtractEffort(value),
                },
              ]
            : []),
        ]
      : [];

  async function handleAction(closeOriginal: boolean) {
    setPendingCloseOriginal(closeOriginal);

    if (!thread.sessionRef) {
      onContinue(selectedKind, targetConfig, closeOriginal, null);
      return;
    }

    setPhase("extracting");
    try {
      const result = await readBridge().extractContext({
        threadId: thread.id,
        agentKind: thread.agentKind,
        sessionRef: thread.sessionRef,
        projectLocation: props.projectLocation,
        ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
        ...(extractModel ? { model: extractModel } : {}),
        ...(extractEffort ? { effort: extractEffort } : {}),
      });
      onContinue(selectedKind, targetConfig, closeOriginal, result);
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function handleCancel() {
    if (phase === "extracting") {
      readBridge()
        .cancelExtractContext({ threadId: thread.id })
        .catch(() => {});
    }
    setPhase("select");
    setErrorMessage("");
    onClose();
  }

  function handleStartWithoutContext() {
    onContinue(selectedKind, targetConfig, pendingCloseOriginal, null);
  }

  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[540px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Continue in another provider</Trans>
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body className="px-5 pb-5 pt-2">
            {phase === "select" && (
              <div className="flex flex-col gap-4">
                {/* Target provider + config */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">
                    <Trans>Target provider</Trans>
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <OptionMenu
                      buttonVariant="ghost"
                      className="lightcode-composer-menu min-w-0 px-2.5"
                      iconOnly
                      value={selectedKind}
                      options={otherAgents.map((a) => ({
                        id: a.kind,
                        label: a.label,
                        icon: (
                          <ProviderIcon
                            kind={a.kind}
                            {...(a.icon ? { icon: a.icon } : {})}
                            fallbackLabel={a.label}
                            tone="active"
                            className="size-3.5 shrink-0"
                          />
                        ),
                      }))}
                      onChange={handleProviderChange}
                      icon={
                        selectedAgent ? (
                          <ProviderIcon
                            kind={selectedAgent.kind}
                            {...(selectedAgent.icon ? { icon: selectedAgent.icon } : {})}
                            fallbackLabel={selectedAgent.label}
                            tone="active"
                            className="size-3.5 shrink-0"
                          />
                        ) : undefined
                      }
                    />
                    {targetControls.map((control, index) => renderComposerControl(control, index))}
                  </div>
                </div>

                {/* Context extraction model/effort */}
                {modelEffortControls.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted">
                      <Trans>Context extraction ({sourceAgent?.label ?? thread.agentKind})</Trans>
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {modelEffortControls.map((control, index) =>
                        renderComposerControl(control, index),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {phase === "extracting" && (
              <div className="flex items-center gap-3 py-2">
                <PixelLoader size="sm" />
                <p className="text-sm text-muted">
                  <Trans>Extracting context from {sourceAgent?.label ?? thread.agentKind}...</Trans>
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  <Trans>Could not extract context.</Trans>
                </p>
                {errorMessage && (
                  <p className="max-h-20 overflow-y-auto text-xs text-muted">{errorMessage}</p>
                )}
              </div>
            )}
          </Modal.Body>

          <Modal.Footer>
            {phase === "select" && (
              <>
                <Button slot="close" variant="tertiary">
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={!selectedKind}
                  onPress={() => handleAction(false)}
                >
                  <Trans>Clone</Trans>
                </Button>
                <Button
                  variant="primary"
                  isDisabled={!selectedKind}
                  onPress={() => handleAction(true)}
                >
                  <Trans>Move</Trans>
                </Button>
              </>
            )}
            {phase === "extracting" && (
              <Button variant="tertiary" onPress={handleCancel}>
                <Trans>Cancel</Trans>
              </Button>
            )}
            {phase === "error" && (
              <>
                <Button variant="tertiary" onPress={handleCancel}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button variant="secondary" onPress={handleStartWithoutContext}>
                  <Trans>Start Without Context</Trans>
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
