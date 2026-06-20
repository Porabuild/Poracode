import { useState, type ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Monitor } from "lucide-react";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { capabilitiesForPresentation } from "@/renderer/components/thread/threadComposerOptions";
import {
  buildModelPickerControls,
  buildProviderModelMenuProviders,
} from "@/renderer/components/thread/buildModelPickerControls";
import { ThreadComposer } from "@/renderer/components/thread/ThreadComposer";
import {
  getCommitGenCandidates,
  getCommitGenDefaultsHint,
  getConflictResolverCandidates,
  getConflictResolverDefaultsHint,
  getTitleGenCandidates,
  getTitleGenDefaultsHint,
  resolveCommitGenConfig,
  resolveTitleGenConfig,
  resolveConflictResolverConfig,
  sortByAutoPreference,
} from "@/renderer/components/providers";
import { TuxIcon } from "@/renderer/components/common";
import { SettingsPage } from "./SettingsForm";

type EnvKind = "windows" | "wsl";
type Mode = "auto" | "custom" | "disabled";

function deriveMode(provider: string): Mode {
  if (provider === "auto") return "auto";
  if (provider === "disabled") return "disabled";
  return "custom";
}

function GenConfigSection(props: {
  heading: string;
  description: string;
  provider: string;
  model: string;
  effort: string;
  resolve: (
    agent: AgentStatus | undefined,
    model: string,
    effort: string,
  ) => { model: string; effort: string; availableEfforts: string[] };
  getCandidates: (statuses: AgentStatus[], provider: string) => AgentStatus[];
  allowDisabled?: boolean;
  defaultsHint?: string | undefined;
  agentStatuses: AgentStatus[];
  onConfigChange: (provider: string, model: string, effort: string) => void;
  /** Extra controls rendered below the model/effort toolbar (e.g. presentation mode picker). */
  extraControls?: ReactNode;
  /** When set, model lists mirror the selected thread presentation surface (CLI vs Chat/ACP). */
  presentationMode?: ThreadPresentationMode;
  /**
   * Restrict the provider list to agents that support one-shot generation. Set
   * for the one-shot sections (Title / Commit Message); left off for the
   * conflict resolver, which launches a full interactive session instead and so
   * works with every provider.
   */
  requireOneShot?: boolean;
}) {
  const { t } = useLingui();
  const {
    heading,
    description,
    provider,
    model,
    effort,
    resolve,
    getCandidates,
    agentStatuses,
    onConfigChange,
    presentationMode,
  } = props;

  const installedAgents = agentStatuses.filter((a) => a.installed);
  // One-shot sections (title / commit) only offer providers that can run a
  // one-shot generation; the conflict resolver leaves this off (full session),
  // so providers like Factory Droid stay available there.
  const eligibleAgents = props.requireOneShot
    ? installedAgents.filter((a) => a.capabilities.supportsOneShot === true)
    : installedAgents;
  const mode = deriveMode(provider);
  const customAgent =
    mode === "custom" ? eligibleAgents.find((a) => a.kind === provider) : undefined;
  // In Auto mode, ask the section's candidate helper so the toolbar mirrors the
  // runtime fallback chain — including the "skip provider without preferred model"
  // rule that's evaluated independently per section.
  const autoAgent = mode === "auto" ? getCandidates(agentStatuses, "auto")[0] : undefined;
  const displayAgent = customAgent ?? autoAgent;
  function agentForPresentation(agent: AgentStatus | undefined): AgentStatus | undefined {
    if (!agent) return undefined;
    if (!presentationMode) return agent;
    return {
      ...agent,
      capabilities: capabilitiesForPresentation(agent.capabilities, presentationMode),
    };
  }
  const displayResolved = agentForPresentation(displayAgent)
    ? resolve(
        agentForPresentation(displayAgent),
        mode === "custom" ? model : "",
        mode === "custom" ? effort : "",
      )
    : undefined;

  const providers = buildProviderModelMenuProviders(eligibleAgents, {
    ...(presentationMode ? { presentationMode } : {}),
  });

  function changeMode(next: Mode) {
    if (next === mode) return;
    if (next === "auto") {
      onConfigChange("auto", "", "");
      return;
    }
    if (next === "disabled") {
      onConfigChange("disabled", "", "");
      return;
    }
    const first = sortByAutoPreference(eligibleAgents)[0];
    if (!first) return;
    const r = resolve(agentForPresentation(first), "", "");
    onConfigChange(first.kind, r.model, r.effort);
  }

  const showToolbar = (mode === "custom" || mode === "auto") && displayAgent && displayResolved;
  const isReadOnly = mode === "auto";

  const modelPickerControls =
    showToolbar && displayAgent && displayResolved
      ? buildModelPickerControls({
          providers,
          selectedAgentKind: displayAgent.kind,
          model: displayResolved.model,
          effort: displayResolved.effort,
          capabilities:
            agentForPresentation(displayAgent)?.capabilities ?? displayAgent.capabilities,
          ...(presentationMode ? { presentationMode } : {}),
          isDisabled: isReadOnly,
          includeFastToggle: false,
          onProviderModelChange: (next) => {
            const nextAgent = installedAgents.find((a) => a.kind === next.agentKind);
            const r = resolve(agentForPresentation(nextAgent), next.model, effort);
            onConfigChange(next.agentKind, r.model, r.effort);
          },
          onConfigPatch: (patch) => {
            if (!customAgent || !displayResolved || patch.effort === undefined) return;
            onConfigChange(provider, displayResolved.model, patch.effort);
          },
        })
      : [];

  const heading2 = props.defaultsHint ? (
    <Tooltip delay={300}>
      <Tooltip.Trigger tabIndex={-1} role="none">
        <h2 className="w-fit cursor-default text-sm font-semibold text-foreground">{heading}</h2>
      </Tooltip.Trigger>
      <Tooltip.Content className="text-xs">{props.defaultsHint}</Tooltip.Content>
    </Tooltip>
  ) : (
    <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {heading2}
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {mode !== "disabled" && props.extraControls ? props.extraControls : null}
          <ToggleButtonGroup
            aria-label={t`${heading} mode`}
            className="h-7 [&_button]:h-7 [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-2"
            selectionMode="single"
            disallowEmptySelection
            size="sm"
            selectedKeys={[mode]}
            onSelectionChange={(keys) => {
              const next = [...keys][0] as Mode | undefined;
              if (next) changeMode(next);
            }}
          >
            <ToggleButton id="auto">
              <Trans>Auto</Trans>
            </ToggleButton>
            <ToggleButton id="custom" isDisabled={eligibleAgents.length === 0}>
              <Trans>Custom</Trans>
            </ToggleButton>
            {props.allowDisabled ? (
              <ToggleButton id="disabled">
                <Trans>Disabled</Trans>
              </ToggleButton>
            ) : null}
          </ToggleButtonGroup>
        </div>
      </div>

      {showToolbar && modelPickerControls.length > 0 ? (
        <ThreadComposer
          compact
          toolbarOnly
          hideSubmitButton
          preserveDisabledControlStyle={isReadOnly}
          controls={modelPickerControls}
          placeholder=""
          prompt=""
          submitDisabled
          submitLabel=""
          onPromptChange={() => undefined}
          onSubmit={() => undefined}
        />
      ) : null}
    </section>
  );
}

function PresentationModeToggle(props: {
  ariaLabel: string;
  value: ThreadPresentationMode;
  onChange: (value: ThreadPresentationMode) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label={props.ariaLabel}
      className="h-7 [&_button]:h-7 [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-2"
      selectionMode="single"
      disallowEmptySelection
      size="sm"
      selectedKeys={[props.value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0] as ThreadPresentationMode | undefined;
        if (next) props.onChange(next);
      }}
    >
      <ToggleButton id="gui">
        <Trans>Chat</Trans>
      </ToggleButton>
      <ToggleButton id="terminal">
        <Trans>CLI</Trans>
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

export function AISettings() {
  const { t } = useLingui();
  const [envKind, setEnvKind] = useState<EnvKind>("windows");

  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const hasWsl = wslAgentStatuses.length > 0;
  const activeStatuses = envKind === "wsl" ? wslAgentStatuses : agentStatuses;

  const titleGenProvider = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenProvider : s.titleGenProvider,
  );
  const titleGenModel = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenModel : s.titleGenModel,
  );
  const titleGenEffort = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenEffort : s.titleGenEffort,
  );
  const setTitleGenConfig = useSharedSettings((s) =>
    envKind === "wsl" ? s.setWslTitleGenConfig : s.setTitleGenConfig,
  );

  const commitGenProvider = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenProvider : s.commitGenProvider,
  );
  const commitGenModel = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenModel : s.commitGenModel,
  );
  const commitGenEffort = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenEffort : s.commitGenEffort,
  );
  const setCommitGenConfig = useSharedSettings((s) =>
    envKind === "wsl" ? s.setWslCommitGenConfig : s.setCommitGenConfig,
  );

  const conflictResolverProvider = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverProvider : s.conflictResolverProvider,
  );
  const conflictResolverModel = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverModel : s.conflictResolverModel,
  );
  const conflictResolverEffort = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverEffort : s.conflictResolverEffort,
  );
  const setConflictResolverConfig = useSharedSettings((s) =>
    envKind === "wsl" ? s.setWslConflictResolverConfig : s.setConflictResolverConfig,
  );
  const conflictResolverPresentationMode = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverPresentationMode : s.conflictResolverPresentationMode,
  );
  const setConflictResolverPresentationMode = useSharedSettings((s) =>
    envKind === "wsl"
      ? s.setWslConflictResolverPresentationMode
      : s.setConflictResolverPresentationMode,
  );

  return (
    <SettingsPage
      title={t`AI`}
      bodyClassName="space-y-8"
      actions={
        hasWsl ? (
          <ToggleButtonGroup
            aria-label={t`Environment`}
            className="h-7 [&_button]:h-7 [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-2"
            selectionMode="single"
            disallowEmptySelection
            size="sm"
            selectedKeys={[envKind]}
            onSelectionChange={(keys) => {
              const next = [...keys][0] as EnvKind | undefined;
              if (next) setEnvKind(next);
            }}
          >
            <ToggleButton isIconOnly id="windows" aria-label={t`Windows`}>
              <Monitor className="size-3.5" />
            </ToggleButton>
            <ToggleButton isIconOnly id="wsl" aria-label={t`WSL`}>
              <ToggleButtonGroup.Separator />
              <TuxIcon className="size-7" />
            </ToggleButton>
          </ToggleButtonGroup>
        ) : null
      }
    >
      <GenConfigSection
        heading={t`Title Generation`}
        allowDisabled
        requireOneShot
        description={t`Generates short titles for new threads.`}
        defaultsHint={getTitleGenDefaultsHint()}
        agentStatuses={activeStatuses}
        provider={titleGenProvider}
        model={titleGenModel}
        effort={titleGenEffort}
        resolve={resolveTitleGenConfig}
        getCandidates={getTitleGenCandidates}
        onConfigChange={setTitleGenConfig}
      />

      <GenConfigSection
        heading={t`Commit Message Generation`}
        requireOneShot
        description={t`Generates commit messages from staged changes.`}
        defaultsHint={getCommitGenDefaultsHint()}
        agentStatuses={activeStatuses}
        provider={commitGenProvider}
        model={commitGenModel}
        effort={commitGenEffort}
        resolve={resolveCommitGenConfig}
        getCandidates={getCommitGenCandidates}
        onConfigChange={setCommitGenConfig}
      />

      <GenConfigSection
        heading={t`Conflict Resolver`}
        description={t`Resolves merge conflicts during rebase or merge.`}
        defaultsHint={getConflictResolverDefaultsHint()}
        agentStatuses={activeStatuses}
        provider={conflictResolverProvider}
        model={conflictResolverModel}
        effort={conflictResolverEffort}
        resolve={resolveConflictResolverConfig}
        getCandidates={getConflictResolverCandidates}
        onConfigChange={setConflictResolverConfig}
        presentationMode={conflictResolverPresentationMode}
        extraControls={
          <PresentationModeToggle
            ariaLabel={t`Open conflict resolver in`}
            value={conflictResolverPresentationMode}
            onChange={setConflictResolverPresentationMode}
          />
        }
      />
    </SettingsPage>
  );
}
