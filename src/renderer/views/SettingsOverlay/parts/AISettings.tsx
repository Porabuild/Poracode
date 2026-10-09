import { useEffect, useState, type ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Monitor } from "lucide-react";
import type { AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import type { ModelFamilyConfig } from "@/shared/modelFamilySelection";
import { modelFamilyForModel } from "@/shared/modelFamilySelection";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { SELECTION_AXES } from "@/shared/selectionBinding";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import {
  buildModelPickerControls,
  buildProviderModelMenuProviders,
  resolveModelSelectionEdit,
} from "@/renderer/components/thread/buildModelPickerControls";
import { ThreadComposer } from "@/renderer/components/thread/ThreadComposer";
import {
  getCommitGenCandidates,
  getCommitGenDefaultsHint,
  resolveCommitGenConfig,
} from "@/renderer/components/providers/commitGen";
import {
  getConflictResolverCandidates,
  getConflictResolverDefaultsHint,
  resolveConflictResolverConfig,
} from "@/renderer/components/providers/conflictResolver";
import {
  getTitleGenCandidates,
  getTitleGenDefaultsHint,
  resolveTitleGenConfig,
} from "@/renderer/components/providers/titleGen";
import { sortByAutoPreference } from "@/renderer/components/providers/utilityTask";
import {
  readUtilitySelection,
  relationForResolvedMember,
  type UtilityPresetEdit,
} from "@/renderer/utils/utilitySelection";
import {
  createUtilityPresetSetter,
  setUtilityPresentation,
  utilitySettingsKeys,
} from "./utilityPreset";
import { TuxIcon } from "@/renderer/components/common";
import { SettingsPage } from "./SettingsForm";

export { createUtilityPresetSetter } from "./utilityPreset";

type EnvKind = "windows" | "wsl";
type Mode = "auto" | "custom" | "disabled";

function deriveMode(provider: string): Mode {
  if (provider === "auto") return "auto";
  if (provider === "disabled") return "disabled";
  return "custom";
}

export function GenConfigSection(props: {
  heading: string;
  description: string;
  provider: string;
  model: string;
  effort: string;
  fast: boolean;
  selection?: ModelSelection | undefined;
  resolve: (
    agent: AgentStatus | undefined,
    model: string,
    effort: string,
  ) => { model: string; effort: string; availableEfforts: string[] };
  getCandidates: (statuses: AgentStatus[], provider: string) => AgentStatus[];
  allowDisabled?: boolean;
  defaultsHint?: string | undefined;
  agentStatuses: AgentStatus[];
  /** Deliberate preset edit: legacy scalars plus the eventful edit descriptor. */
  onConfigChange: (
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
    edit: UtilityPresetEdit,
  ) => void;
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
    resolve,
    getCandidates,
    agentStatuses,
    onConfigChange,
    presentationMode,
  } = props;

  const selection = readUtilitySelection(props.selection, props);
  const { model, effort = "", fast = false } = selection;

  const installedAgents = agentStatuses.filter((a) => a.installed);
  // One-shot sections (title / commit) only offer providers that can run a
  // one-shot generation; the conflict resolver leaves this off (full session),
  // so interactive-only ACP registry providers stay available there.
  const eligibleAgents = props.requireOneShot
    ? installedAgents.filter((a) => a.capabilities.supportsOneShot === true)
    : installedAgents;
  const mode = deriveMode(provider);
  const customAgent =
    mode === "custom" ? eligibleAgents.find((a) => a.kind === provider) : undefined;

  // Self-heal a stale saved selection. A one-shot section can still point at a
  // provider that was selectable before one-shot filtering existed but can't run
  // a one-shot (e.g. a legacy ACP-registry generic). That provider is gone from the
  // picker, so the toolbar disappears with no way to re-pick — reset to Auto.
  // Guarded on the provider being *installed but ineligible* so it never fires
  // mid-detection (when the provider is merely absent from the list yet).
  const savedProviderIneligible =
    props.requireOneShot === true &&
    mode === "custom" &&
    customAgent === undefined &&
    installedAgents.some((a) => a.kind === provider && a.capabilities.supportsOneShot !== true);
  useEffect(() => {
    if (savedProviderIneligible) onConfigChange("auto", "", "", false, { kind: "reset" });
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
  const legacyResolved = agentForPresentation(displayAgent)
    ? resolve(
        agentForPresentation(displayAgent),
        mode === "custom" ? model : "",
        mode === "custom" ? effort : "",
      )
    : undefined;

  const displayResolved =
    props.selection && legacyResolved
      ? { ...legacyResolved, model: model === "" ? legacyResolved.model : model, effort }
      : legacyResolved;

  const providers = buildProviderModelMenuProviders(eligibleAgents, {
    ...(presentationMode ? { presentationMode } : {}),
  });

  function changeMode(next: Mode) {
    if (next === mode) return;
    if (next === "auto") {
      onConfigChange("auto", "", "", false, { kind: "reset" });
      return;
    }
    if (next === "disabled") {
      onConfigChange("disabled", "", "", false, { kind: "reset" });
      return;
    }
    const first = sortByAutoPreference(eligibleAgents)[0];
    if (!first) return;
    const r = resolve(agentForPresentation(first), "", "");
    onConfigChange(first.kind, r.model, r.effort, false, { kind: "model" });
  }

  const showToolbar = (mode === "custom" || mode === "auto") && displayAgent && displayResolved;
  const isReadOnly = mode === "auto";
  // Modern presets display their actual controls; legacy Auto keeps its
  // existing read-only default view.
  const resolvedFast = props.selection || mode === "custom" ? fast : false;

  const modelPickerControls =
    showToolbar && displayAgent && displayResolved
      ? buildModelPickerControls({
          providers,
          selectedAgentKind: displayAgent.kind,
          model: displayResolved.model,
          effort: displayResolved.effort,
          fast: resolvedFast,
          ...(selection.thinking !== undefined ? { thinking: selection.thinking } : {}),
          ...(selection.contextSize !== undefined ? { contextSize: selection.contextSize } : {}),
          capabilities:
            agentForPresentation(displayAgent)?.capabilities ?? displayAgent.capabilities,
          ...(presentationMode ? { presentationMode } : {}),
          isDisabled: isReadOnly,
          includeFastToggle: true,
          onProviderModelChange: (next) => {
            const nextAgent = installedAgents.find((a) => a.kind === next.agentKind);
            const presented = agentForPresentation(nextAgent);
            // A pick touching a family relation resolves through the shared
            // edit helper exactly like the thread composer: a projected
            // family row keeps the family's current member, an exact row
            // selects its member, `null` is rejected visibly by the helper,
            // and `{}` is a family-row no-op.
            const familyCaps = presented?.capabilities;
            if (
              familyCaps &&
              (familyCaps.modelFamilies?.length ?? 0) > 0 &&
              (modelFamilyForModel(familyCaps, next.model) ||
                modelFamilyForModel(familyCaps, model))
            ) {
              const familyConfig: ModelFamilyConfig = selection;
              const patch = resolveModelSelectionEdit(
                familyCaps,
                familyConfig,
                next.selectionIntent === "family"
                  ? { kind: "family", model: next.model }
                  : { kind: "model", model: next.model },
              );
              if (patch === null) return;
              if (Object.keys(patch).length === 0) {
                onConfigChange(next.agentKind, model, effort, fast, { kind: "family-noop" });
                return;
              }
              const nextModel = patch.model ?? model;
              // Origin follows the row's intent, never the resolved patch:
              // only a family row may carry a minting relation, while an
              // exact/favorite/recent pick — same UID included — revokes.
              const relation =
                next.selectionIntent === "family"
                  ? relationForResolvedMember(familyCaps, nextModel)
                  : undefined;
              onConfigChange(
                next.agentKind,
                nextModel,
                patch.effort ?? effort,
                patch.fast ?? fast,
                relation ? { kind: "model", relation, patch } : { kind: "model", patch },
              );
              return;
            }
            onConfigChange(next.agentKind, next.model, effort, fast, { kind: "model" });
          },
          onConfigPatch: (patch, origin) => {
            if (!customAgent || !displayResolved) return;
            if (patch.model !== undefined) {
              // Only a member patch the shared edit helper resolved carries
              // its projected relation, so only that edit can mint.
              const presented = agentForPresentation(customAgent);
              const relation =
                origin?.kind === "family-resolved"
                  ? relationForResolvedMember(
                      presented?.capabilities ?? customAgent.capabilities,
                      patch.model,
                    )
                  : undefined;
              onConfigChange(
                provider,
                patch.model,
                patch.effort ?? effort,
                patch.fast ?? fast,
                relation ? { kind: "model", relation, patch } : { kind: "model", patch },
              );
              return;
            }
            const axes = SELECTION_AXES.filter((axis) => Object.hasOwn(patch, axis));
            if (axes.length > 0) {
              onConfigChange(provider, model, patch.effort ?? effort, patch.fast ?? fast, {
                kind: "carrier",
                axes,
                patch,
              });
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

export function PresentationModeToggle(props: {
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
  const wsl = envKind === "wsl";

  const titleGenSelection = useSharedSettings((s) =>
    wsl ? s.wslTitleGenSelection : s.titleGenSelection,
  );
  const titleGenProvider = useSharedSettings((s) =>
    wsl ? s.wslTitleGenProvider : s.titleGenProvider,
  );
  const titleGenModel = useSharedSettings((s) => (wsl ? s.wslTitleGenModel : s.titleGenModel));
  const titleGenEffort = useSharedSettings((s) => (wsl ? s.wslTitleGenEffort : s.titleGenEffort));
  const titleGenFast = useSharedSettings((s) => (wsl ? s.wslTitleGenFast : s.titleGenFast));
  const setTitleGenConfig = useSharedSettings((s) =>
    wsl ? s.setWslTitleGenConfig : s.setTitleGenConfig,
  );

  const commitGenSelection = useSharedSettings((s) =>
    wsl ? s.wslCommitGenSelection : s.commitGenSelection,
  );
  const commitGenProvider = useSharedSettings((s) =>
    wsl ? s.wslCommitGenProvider : s.commitGenProvider,
  );
  const commitGenModel = useSharedSettings((s) => (wsl ? s.wslCommitGenModel : s.commitGenModel));
  const commitGenEffort = useSharedSettings((s) =>
    wsl ? s.wslCommitGenEffort : s.commitGenEffort,
  );
  const commitGenFast = useSharedSettings((s) => (wsl ? s.wslCommitGenFast : s.commitGenFast));
  const setCommitGenConfig = useSharedSettings((s) =>
    wsl ? s.setWslCommitGenConfig : s.setCommitGenConfig,
  );

  const conflictResolverSelection = useSharedSettings((s) =>
    wsl ? s.wslConflictResolverSelection : s.conflictResolverSelection,
  );
  const conflictResolverProvider = useSharedSettings((s) =>
    wsl ? s.wslConflictResolverProvider : s.conflictResolverProvider,
  );
  const conflictResolverModel = useSharedSettings((s) =>
    wsl ? s.wslConflictResolverModel : s.conflictResolverModel,
  );
  const conflictResolverEffort = useSharedSettings((s) =>
    wsl ? s.wslConflictResolverEffort : s.conflictResolverEffort,
  );
  const conflictResolverFast = useSharedSettings((s) =>
    wsl ? s.wslConflictResolverFast : s.conflictResolverFast,
  );
  const setConflictResolverConfig = useSharedSettings((s) =>
    wsl ? s.setWslConflictResolverConfig : s.setConflictResolverConfig,
  );
  const conflictResolverPresentationMode = useSharedSettings((s) =>
    wsl ? s.wslConflictResolverPresentationMode : s.conflictResolverPresentationMode,
  );

  return (
    <SettingsPage
      title={t`AI Helpers`}
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
        selection={titleGenSelection}
        provider={titleGenProvider}
        model={titleGenModel}
        effort={titleGenEffort}
        fast={titleGenFast}
        resolve={resolveTitleGenConfig}
        getCandidates={getTitleGenCandidates}
        onConfigChange={createUtilityPresetSetter({
          keys: utilitySettingsKeys("titleGen", wsl),
          presentation: undefined,
          setScalars: setTitleGenConfig,
        })}
      />

      <GenConfigSection
        anchorId="ai.commitMessageGeneration"
        heading={t`Commit Message Generation`}
        requireOneShot
        description={t`Generates commit messages from staged changes.`}
        defaultsHint={getCommitGenDefaultsHint()}
        agentStatuses={activeStatuses}
        selection={commitGenSelection}
        provider={commitGenProvider}
        model={commitGenModel}
        effort={commitGenEffort}
        fast={commitGenFast}
        resolve={resolveCommitGenConfig}
        getCandidates={getCommitGenCandidates}
        onConfigChange={createUtilityPresetSetter({
          keys: utilitySettingsKeys("commitGen", wsl),
          presentation: undefined,
          setScalars: setCommitGenConfig,
        })}
      />

      <GenConfigSection
        anchorId="ai.conflictResolver"
        heading={t`Conflict Resolver`}
        description={t`Resolves merge conflicts during rebase or merge.`}
        defaultsHint={getConflictResolverDefaultsHint()}
        agentStatuses={activeStatuses}
        selection={conflictResolverSelection}
        provider={conflictResolverProvider}
        model={conflictResolverModel}
        effort={conflictResolverEffort}
        fast={conflictResolverFast}
        resolve={resolveConflictResolverConfig}
        getCandidates={getConflictResolverCandidates}
        onConfigChange={createUtilityPresetSetter({
          keys: utilitySettingsKeys("conflictResolver", wsl),
          // The conflict resolver's existing declaration: the target
          // presentation is its presentation-mode setting.
          presentation: conflictResolverPresentationMode,
          setScalars: setConflictResolverConfig,
        })}
        presentationMode={conflictResolverPresentationMode}
        extraControls={
          <PresentationModeToggle
            ariaLabel={t`Open conflict resolver in`}
            value={conflictResolverPresentationMode}
            onChange={(mode) => setUtilityPresentation(wsl, mode)}
          />
        }
      />
    </SettingsPage>
  );
}
