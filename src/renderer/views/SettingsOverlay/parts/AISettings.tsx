import { useEffect, useState, type ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Monitor } from "lucide-react";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { capabilitiesForPresentation } from "@/renderer/components/thread/threadComposerOptions";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
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
  fast: boolean;
  resolve: (
    agent: AgentStatus | undefined,
    model: string,
    effort: string,
  ) => { model: string; effort: string; availableEfforts: string[] };
  getCandidates: (statuses: AgentStatus[], provider: string) => AgentStatus[];
  allowDisabled?: boolean;
  defaultsHint?: string | undefined;
  agentStatuses: AgentStatus[];
  onConfigChange: (provider: string, model: string, effort: string, fast: boolean) => void;
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
  /** Search anchor for the section host — see ./settingsSearchIndex. */
  anchorId?: string;
}) {
  const { t } = useLingui();
  const {
    heading,
    description,
    provider,
    model,
    effort,
    fast,
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

  // Self-heal a stale saved selection. A one-shot section can still point at a
  // provider that was selectable before one-shot filtering existed but can't run
  // a one-shot (e.g. Grok / Factory Droid). That provider is gone from the
  // picker, so the toolbar disappears with no way to re-pick — reset to Auto.
  // Guarded on the provider being *installed but ineligible* so it never fires
  // mid-detection (when the provider is merely absent from the list yet).
  const savedProviderIneligible =
    props.requireOneShot === true &&
    mode === "custom" &&
    customAgent === undefined &&
    installedAgents.some((a) => a.kind === provider && a.capabilities.supportsOneShot !== true);
  useEffect(() => {
    if (savedProviderIneligible) onConfigChange("auto", "", "", false);
  }, [savedProviderIneligible, onConfigChange]);
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
      onConfigChange("auto", "", "", false);
      return;
    }
    if (next === "disabled") {
      onConfigChange("disabled", "", "", false);
      return;
    }
    const first = sortByAutoPreference(eligibleAgents)[0];
    if (!first) return;
    const r = resolve(agentForPresentation(first), "", "");
    onConfigChange(first.kind, r.model, r.effort, false);
  }

  const showToolbar = (mode === "custom" || mode === "auto") && displayAgent && displayResolved;
  const isReadOnly = mode === "auto";
  // Fast mode is only meaningful in Custom mode for a fast-capable model — Auto
  // never opts a utility task into fast, so the read-only mirror shows it off.
  const resolvedFast = mode === "custom" ? fast : false;

  const modelPickerControls =
    showToolbar && displayAgent && displayResolved
      ? buildModelPickerControls({
          providers,
          selectedAgentKind: displayAgent.kind,
          model: displayResolved.model,
          effort: displayResolved.effort,
          fast: resolvedFast,
          capabilities:
            agentForPresentation(displayAgent)?.capabilities ?? displayAgent.capabilities,
          ...(presentationMode ? { presentationMode } : {}),
          isDisabled: isReadOnly,
          includeFastToggle: true,
          onProviderModelChange: (next) => {
            const nextAgent = installedAgents.find((a) => a.kind === next.agentKind);
            const presented = agentForPresentation(nextAgent);
            const r = resolve(presented, next.model, effort);
            // Drop fast when the newly selected model can't actually use it.
            const nextFast = presented ? resolveFastValue(presented, r.model, fast) : false;
            onConfigChange(next.agentKind, r.model, r.effort, nextFast);
          },
          onConfigPatch: (patch) => {
            if (!customAgent || !displayResolved) return;
            if (patch.fast !== undefined) {
              onConfigChange(provider, displayResolved.model, displayResolved.effort, patch.fast);
              return;
            }
            if (patch.effort !== undefined) {
              onConfigChange(provider, displayResolved.model, patch.effort, fast);
            }
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
    <section
      {...(props.anchorId ? { id: props.anchorId, "data-settings-anchor": props.anchorId } : {})}
      className={`space-y-3 ${props.anchorId ? "scroll-mt-4" : ""}`}
    >
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
  const titleGenFast = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenFast : s.titleGenFast,
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
  const commitGenFast = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenFast : s.commitGenFast,
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
  const conflictResolverFast = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverFast : s.conflictResolverFast,
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
        anchorId="ai.titleGeneration"
        heading={t`Title Generation`}
        allowDisabled
        requireOneShot
        description={t`Generates short titles for new threads.`}
        defaultsHint={getTitleGenDefaultsHint()}
        agentStatuses={activeStatuses}
        provider={titleGenProvider}
        model={titleGenModel}
        effort={titleGenEffort}
        fast={titleGenFast}
        resolve={resolveTitleGenConfig}
        getCandidates={getTitleGenCandidates}
        onConfigChange={setTitleGenConfig}
      />

      <GenConfigSection
        anchorId="ai.commitMessageGeneration"
        heading={t`Commit Message Generation`}
        requireOneShot
        description={t`Generates commit messages from staged changes.`}
        defaultsHint={getCommitGenDefaultsHint()}
        agentStatuses={activeStatuses}
        provider={commitGenProvider}
        model={commitGenModel}
        effort={commitGenEffort}
        fast={commitGenFast}
        resolve={resolveCommitGenConfig}
        getCandidates={getCommitGenCandidates}
        onConfigChange={setCommitGenConfig}
      />

      <GenConfigSection
        anchorId="ai.conflictResolver"
        heading={t`Conflict Resolver`}
        description={t`Resolves merge conflicts during rebase or merge.`}
        defaultsHint={getConflictResolverDefaultsHint()}
        agentStatuses={activeStatuses}
        provider={conflictResolverProvider}
        model={conflictResolverModel}
        effort={conflictResolverEffort}
        fast={conflictResolverFast}
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
