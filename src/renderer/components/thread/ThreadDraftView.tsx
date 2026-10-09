import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type {
  AgentStatus,
  BuiltInMcpServerId,
  Project,
  ProjectDraftConfig,
  ProviderDraftConfig,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { HOME_PROJECT_NAME, isHomeProject } from "@/shared/homeScope";
import { readBridge } from "@/renderer/bridge";
import { getComputerUseScope } from "@/renderer/components/composer/computerUseScope";
import { useImplicitMcpServers } from "@/renderer/components/composer/implicitMcpServers";
import {
  chromeMcpServer,
  COMPUTER_USE_MCP_ID,
  resolveMcpScope,
} from "@/renderer/components/composer/composerMcpServers";
import { getConfigNormalizer } from "@/renderer/components/providers/providerComposer";
import { useGitStore } from "@/renderer/state/gitStore";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { modelVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import type { ProviderModelSelectionIntent } from "@/renderer/components/common/ProviderModelMenu/parts/types";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { dispatchManagedRootProjectDraftConfig } from "@/renderer/state/managedRootCatalog/rootCatalogIntents";
import { capabilitiesForPresentation, filterHiddenModels } from "@/shared/agentSelection";
import { normalizeProviderModelConfig } from "@/renderer/components/providers/modelConfig";
import type { ProviderModelPreference } from "@/shared/settings";
import {
  appendProviderComposerControls,
  buildModelPickerControls,
  buildProviderModelMenuProviders,
  patchConfigForModelChange,
  resolveModelSelectionEdit,
} from "./buildModelPickerControls";
import {
  modelFamilyForModel,
  resolveFamilyPresentationTransition,
} from "@/shared/modelFamilySelection";
import { i18n } from "@/renderer/i18n/i18n";
import { machineKeyForLocation } from "@/shared/machines";
import {
  agentWithCapabilities,
  formatAgentList,
  resolveContextSizeValue,
  resolveEffortValue,
  resolveFastValue,
  resolveInitialPresentationMode,
  resolveModelValue,
  resolvePreferredAgentKind,
  resolveProviderDraftConfig,
  resolveProviderModelPreference,
  resolveSavedProviderDraftConfig,
  resolveThinkingValue,
  launchSelectionFields,
} from "./threadDraftViewHelpers";
import { composerSelectionEvent, type ComposerSelectionOrigin } from "./composerSelectionMutation";
import { applyThreadConfigMutation, type SelectionMutationEvent } from "@/shared/selectionBinding";
import { isThreadConfigEqual } from "@/shared/contracts/config";
import { friendlyError } from "@/shared/messages";
import { PresentationModeTabs } from "./PresentationModeTabs";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";
import { ThreadDraftComposerArea, type DraftStartInput } from "./ThreadDraftComposerArea";
import type { SaveClipboardImage } from "../composer/useAttachments";
import { AgentDiscoveryScreen } from "./AgentDiscoveryScreen";
import {
  isDiscoveryActiveForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import {
  ThreadDraftCompactHeader,
  ThreadDraftDropIndicators,
  ThreadDraftHero,
  type ThreadDraftDropIndicator,
} from "./ThreadDraftChrome";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Minimum gap kept above the composer once it can no longer stay centered. */
const COMPOSER_ANCHOR_MIN_TOP = 8;

/**
 * Keeps the centered draft composer visually *stable* instead of re-centering on
 * every height change. The composer starts vertically centered, then the top
 * edge of the input is locked to that initial line: typing extra rows grows the
 * box downward (top stays put), while rows that appear above the input (slash
 * command panel, attachments, docks) grow the box upward (the input + toolbar
 * stay put). Implemented by driving the height of a spacer above the block so
 * the input's top edge holds a fixed fraction of the container height.
 */
function useStableComposerAnchor(opts: {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  blockRef: React.RefObject<HTMLDivElement | null>;
  spacerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { enabled, containerRef, blockRef, spacerRef } = opts;
  // Fraction of the container height where the input's top edge is pinned.
  // Captured once from the initial centered layout so window resizes keep the
  // composer at the same relative position.
  const anchorRatioRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const block = blockRef.current;
    const spacer = spacerRef.current;
    if (!container || !block || !spacer) return;

    const apply = () => {
      const height = container.clientHeight;
      if (height <= 0) return;
      const containerTop = container.getBoundingClientRect().top;
      const blockTop = block.getBoundingClientRect().top;
      const inputEl = block.querySelector<HTMLElement>("[data-composer-input-anchor]");
      const inputTop = (inputEl ?? block).getBoundingClientRect().top;
      // Distance from the block's top to the input's top — grows when rows are
      // inserted above the input (command panel, attachments, docks).
      const aboveInput = inputTop - blockTop;
      const blockHeight = block.offsetHeight;

      // Establish the anchor once from the initial (centered) layout: the line
      // the input's top edge would sit on if the block were centered.
      if (anchorRatioRef.current === null) {
        const centeredInputOffset = (height - blockHeight) / 2 + aboveInput;
        anchorRatioRef.current = clampNumber(centeredInputOffset / height, 0, 1);
      }

      const desiredInputOffset = Math.round(anchorRatioRef.current * height);
      const currentInputOffset = inputTop - containerTop;
      const currentSpacer = spacer.offsetHeight;
      const maxSpacer = Math.max(COMPOSER_ANCHOR_MIN_TOP, height - blockHeight);
      // Snap to whole pixels. A fractional spacer height (e.g. 443.5px) reads
      // back from offsetHeight rounded, so the next correction measures a stale
      // value and the input/toolbar drift by a sub-pixel each time the box
      // changes height (the toolbar visibly creeping up as the slash panel opens).
      const nextSpacer = Math.round(
        clampNumber(
          currentSpacer + (desiredInputOffset - currentInputOffset),
          COMPOSER_ANCHOR_MIN_TOP,
          maxSpacer,
        ),
      );
      // Integer guard: only write on a whole-pixel change, never feed a fraction
      // back into the ResizeObserver loop.
      if (Math.abs(nextSpacer - currentSpacer) >= 1) {
        spacer.style.height = `${nextSpacer}px`;
      }
    };

    apply();
    const observer = new ResizeObserver(() => apply());
    observer.observe(container);
    observer.observe(block);
    return () => observer.disconnect();
  }, [enabled, containerRef, blockRef, spacerRef]);
}

export function ThreadDraftView(props: {
  project: Project;
  agentStatuses: AgentStatus[];
  /**
   * True when the supervisor hasn't yet returned agent statuses for this
   * project's environment (first launch, no cache).  The composer shows a
   * "Detecting agents…" placeholder instead of the "No supported agents"
   * prompt while this is true.
   */
  isDetectingAgents?: boolean;
  lastDraftConfig?: ProjectDraftConfig;
  compact?: boolean;
  /** Bottom-anchored embedded chat draft: structured providers, no workspace controls. */
  chatOnly?: boolean;
  quickComposer?: boolean;
  composerPlaceholder?: string;
  restoreWorktreeSelectionToken?: number;
  /**
   * Override whether unmodified Enter submits instead of inserting a newline.
   * Defaults to submit on desktop (Electron and desktop PWA) and newline on
   * compact/mobile PWA.
   */
  submitOnEnter?: boolean;
  /** Override mount autofocus for embedded draft-composer surfaces. */
  autoFocusComposer?: boolean;
  pickFiles?: () => Promise<string[] | null>;
  saveClipboardImage?: SaveClipboardImage;
  paneAlign?: "left" | "center" | "right";
  showCloseButton?: boolean;
  isDragging?: boolean;
  dropIndicator?: ThreadDraftDropIndicator;
  paneIndex?: number;
  paneCount?: number;
  /**
   * True when this draft pane sits in the top-left and there is no group header
   * above it. Adds a class so CSS can pad the header to clear the macOS
   * traffic-light controls when the sidebar is collapsed.
   */
  headerNeedsTrafficLightPad?: boolean | undefined;
  /** Pane id when rendered as a draft pane; absent for the top-level draft view. */
  paneId?: string | undefined;
  droppableRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: (() => void) | undefined;
  dragHandleRef?: React.RefCallback<Element>;
  onProjectChange?: (projectId: string) => void;
  onStart: (input: DraftStartInput) => void | Promise<void>;
}) {
  const {
    project,
    agentStatuses,
    lastDraftConfig,
    onStart,
    headerNeedsTrafficLightPad = false,
  } = props;
  const implicitMcpServers = useImplicitMcpServers();
  const gitBranch = useGitStore((s) => s.statuses[project.id]?.branch);
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const sharedSettingsHydrated = useSharedSettings((s) => s.sharedSettingsHydrated);
  const showAgentDiscovery = useAgentStatusesStore((s) =>
    isDiscoveryActiveForLocation(s, project.location),
  );
  const isHomeScope = isHomeProject(project);
  const scopeLabel = isHomeScope ? HOME_PROJECT_NAME : undefined;
  const remoteConnection = useRemoteServersStore((state) => {
    const { remoteServerId } = project;
    if (!remoteServerId) return "local";
    // Projected projects carry the CONNECTION key, which for a host-owned
    // environment is the locally minted id, not the child host identity.
    if (!state.servers.some((server) => remoteConnectionKey(server) === remoteServerId)) {
      return "missing";
    }
    return state.runtime[remoteServerId]?.status ?? "connecting";
  });
  const hostUpdateRestarting = useRemoteServersStore((state) =>
    project.remoteServerId ? state.hostUpdateRestarts[project.remoteServerId] !== undefined : false,
  );
  const remoteConnectionMessage = useRemoteServersStore((state) =>
    project.remoteServerId ? state.runtime[project.remoteServerId]?.message : undefined,
  );

  // Debugging showed config-only edits were rebuilding the provider/model
  // payload. Keep the installed-agent list stable unless the source inputs
  // actually change.
  const installedAgents = useMemo(
    () =>
      agentStatuses.filter(
        (status) =>
          status.installed &&
          !disabledAgents.includes(status.kind) &&
          (!props.chatOnly ||
            (
              status.capabilities.presentationModes ?? [status.capabilities.presentationMode]
            ).includes("gui")),
      ),
    [agentStatuses, disabledAgents, props.chatOnly],
  );
  const preferredAgentKind = resolvePreferredAgentKind(installedAgents, lastDraftConfig);
  const [agentKind, setAgentKind] = useState<AgentStatus["kind"] | undefined>(preferredAgentKind);
  const effectiveAgentKind = installedAgents.some((status) => status.kind === agentKind)
    ? agentKind
    : preferredAgentKind;
  const selectedAgent =
    installedAgents.find((status) => status.kind === effectiveAgentKind) ?? installedAgents[0];
  // One complete draft config: own empty/false carriers, absence, and the
  // selection binding survive restore, edits, persistence, and launch. The
  // scalar reads below are display projections only.
  const [draftConfig, setDraftConfig] = useState<ProviderDraftConfig>(() => {
    const initialContext =
      lastDraftConfig &&
      lastDraftConfig.agentKind === preferredAgentKind &&
      lastDraftConfig.contextSize
        ? lastDraftConfig.contextSize
        : !preferredAgentKind || isHomeScope
          ? undefined
          : useSharedSettings.getState().providerConfigs[preferredAgentKind]?.contextSize;
    return {
      model: "",
      effort: "",
      ...(initialContext !== undefined ? { contextSize: initialContext } : {}),
      mode: "agent",
      approvalPolicy: "",
      approvalsReviewer: "",
      sandboxMode: "",
    };
  });
  const model = draftConfig.model;
  const effort = draftConfig.effort ?? "";
  const contextSize = draftConfig.contextSize;
  const fast = draftConfig.fast ?? false;
  const thinking = draftConfig.thinking ?? false;
  const mode = (draftConfig.mode ?? "agent") as "agent" | "plan" | "autopilot";
  const approvalPolicy = draftConfig.approvalPolicy ?? "";
  const approvalsReviewer = draftConfig.approvalsReviewer ?? "";
  const sandboxMode = draftConfig.sandboxMode ?? "";
  // Per-draft `@`-mentions of a composer MCP. These are NOT the persistent
  // enablement (that lives in `enabledMcpServers`); they capture a one-off
  // mention in this draft and reset with every new thread. The effective launch
  // flag is `mention || (persistent && scope available)`, computed below.
  const [browserMcpMention, setBrowserMcpMention] = useState(false);
  const [crossagentMcpMention, setCrossagentMcpMention] = useState(false);
  const [chromeMcpMention, setChromeMcpMention] = useState(false);
  const [computerUseMention, setComputerUseMention] = useState(false);
  const [worktreeMode, setWorktreeMode] = useState(
    isHomeScope ? false : (lastDraftConfig?.worktreeMode ?? false),
  );
  const effectiveWorktreeMode = isHomeScope || props.chatOnly ? false : worktreeMode;
  const lastAppliedAgentKindRef = useRef<AgentStatus["kind"] | undefined>(undefined);

  // Presentation-mode picker — only meaningful for adapters that advertise
  // multiple modes. The render fork in ThreadView consumes `presentationMode`
  // off the Thread row, but we resolve it here so the user's last choice for
  // this provider is remembered across new-thread drafts.
  const lastPresentationModeByAgent = useSharedSettings((s) => s.lastPresentationModeByAgent);
  const setLastPresentationMode = useSharedSettings((s) => s.setLastPresentationMode);
  // Persistent composer MCP enablement (standing default across new threads).
  const enabledMcpServers = useSharedSettings((s) => s.enabledMcpServers);
  const disabledBuiltInMcpServers = useSharedSettings((s) => s.disabledBuiltInMcpServers);
  const supportedPresentationModes = selectedAgent
    ? (selectedAgent.capabilities.presentationModes ?? [
        selectedAgent.capabilities.presentationMode,
      ])
    : [];
  // CLI/Chat reachability is aggregated across all installed providers — the
  // picker stays enabled whenever some provider can serve the mode, even if
  // the currently-selected one can't. Clicking an unreachable-for-this-agent
  // tab swaps to a fallback provider rather than being blocked.
  const anyAgentSupports = (presentation: ThreadPresentationMode): boolean =>
    installedAgents.some((agent) => {
      const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
      return modes.includes(presentation);
    });
  const supportsTerminalMode = anyAgentSupports("terminal");
  const supportsGuiMode = anyAgentSupports("gui");
  const supportsModePicker = supportsTerminalMode && supportsGuiMode;
  const [presentationMode, setPresentationMode] = useState<ThreadPresentationMode>(() =>
    props.chatOnly
      ? "gui"
      : resolveInitialPresentationMode(selectedAgent, lastPresentationModeByAgent),
  );
  const selectedAgentForConfig = useMemo(
    () => (selectedAgent ? agentWithCapabilities(selectedAgent, presentationMode) : undefined),
    [selectedAgent, presentationMode],
  );
  const previousPresentationAgentKindRef = useRef<AgentStatus["kind"] | undefined>(
    selectedAgent?.kind,
  );
  // Re-resolve when the first provider arrives after an empty draft, or on a
  // provider switch when the new provider can't serve the current mode. Why
  // this set of deps:
  //   - `lastPresentationModeByAgent` is the user's per-provider memory; we
  //     intentionally read the *latest* value at provider-switch time but
  //     don't want intra-session writes to retrigger this effect (the user
  //     hasn't changed providers, so their current selection wins).
  //   - `supportedPresentationModes` and `presentationMode` are derived from
  //     `selectedAgent` and `effectiveAgentKind`; including them would either
  //     duplicate the trigger or fire mid-edit on unrelated state.
  // Provider picks can switch CLI/Chat explicitly when the chosen provider
  // only supports the other surface; provider-change re-resolution handles the
  // same fallback for status/default changes.
  useEffect(() => {
    const previousAgentKind = previousPresentationAgentKindRef.current;
    previousPresentationAgentKindRef.current = selectedAgent?.kind;
    if (!selectedAgent) return;
    if (props.chatOnly) {
      setPresentationMode("gui");
      return;
    }
    if (!previousAgentKind) {
      setPresentationMode(
        resolveInitialPresentationMode(selectedAgent, lastPresentationModeByAgent),
      );
      return;
    }
    if (supportedPresentationModes.includes(presentationMode)) return;
    setPresentationMode(resolveInitialPresentationMode(selectedAgent, lastPresentationModeByAgent));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on provider change
  }, [effectiveAgentKind]);

  // --- Per-provider config memory (app-wide via shared settings) ---
  // Root projects persist `lastDraftConfig` host-side as an explicit narrow
  // intent; the store write keeps the local paint immediate, and a failed
  // command is surfaced while the next authoritative pass restores the host
  // value. The ref keeps the wrapper identity stable for effect deps.
  const updateProjectDraftConfigStore = useAppStore((s) => s.updateProjectDraftConfig);
  const updateProjectDraftConfigRef = useRef(
    (projectId: string, nextDraftConfig: ProjectDraftConfig) => {
      updateProjectDraftConfigStore(projectId, nextDraftConfig);
      dispatchManagedRootProjectDraftConfig(projectId, nextDraftConfig);
    },
  );
  const updateProjectDraftConfig = updateProjectDraftConfigRef.current;
  const setProviderConfig = useSharedSettings((s) => s.setProviderConfig);
  const setProviderModelPreference = useSharedSettings((s) => s.setProviderModelPreference);
  const effectiveAgentKindRef = useRef(effectiveAgentKind);
  const providerConfigsRef = useRef<Record<string, ProviderDraftConfig>>({});
  const providerModelPreferencesRef = useRef<
    Record<string, Record<string, ProviderModelPreference>>
  >({});
  const initialLastDraftConfigRef = useRef(lastDraftConfig);
  const hasLocalConfigEditRef = useRef(false);
  const hasLocalContextEditRef = useRef(false);
  effectiveAgentKindRef.current = effectiveAgentKind;
  // Spread is required: the effects below mutate `providerConfigsRef.current[kind]`
  // in place to keep effort/model selections in sync mid-render. Assigning the
  // store reference directly would mutate Zustand state and skip subscribers.
  providerConfigsRef.current = { ...useSharedSettings.getState().providerConfigs };
  providerModelPreferencesRef.current = {
    ...useSharedSettings.getState().providerModelPreferences,
  };

  function persistProviderModelPreference(providerKind: string, config: ProviderDraftConfig) {
    const preference: ProviderModelPreference = {
      ...(config.effort ? { effort: config.effort } : {}),
      ...(config.fast !== undefined ? { fast: config.fast } : {}),
    };
    providerModelPreferencesRef.current = {
      ...providerModelPreferencesRef.current,
      [providerKind]: {
        ...providerModelPreferencesRef.current[providerKind],
        [config.model]: preference,
      },
    };
    setProviderModelPreference(providerKind, config.model, preference);
  }

  function persistProviderConfig(providerKind: string, config: ProviderDraftConfig) {
    providerConfigsRef.current[providerKind] = config;
    if (!isHomeScope) {
      setProviderConfig(providerKind, config);
    }
    persistProviderModelPreference(providerKind, config);
  }

  function persistProjectDraftConfig(nextDraftConfig: ProjectDraftConfig) {
    updateProjectDraftConfig(project.id, nextDraftConfig);
  }

  // The one commit for a complete draft selection: component state, the
  // per-provider config, and the project draft record land together with every
  // own field intact, so no projection can drop an empty/false carrier or the
  // selection binding.
  function commitDraftConfig(kind: AgentStatus["kind"], config: ProviderDraftConfig) {
    setDraftConfig(config);
    lastAppliedAgentKindRef.current = kind;
    persistProviderConfig(kind, config);
    persistProjectDraftConfig({ ...config, agentKind: kind, worktreeMode: effectiveWorktreeMode });
  }

  const persistProviderConfigRef = useRef(persistProviderConfig);
  const persistProjectDraftConfigRef = useRef(persistProjectDraftConfig);
  const commitDraftConfigRef = useRef(commitDraftConfig);
  persistProviderConfigRef.current = persistProviderConfig;
  persistProjectDraftConfigRef.current = persistProjectDraftConfig;
  commitDraftConfigRef.current = commitDraftConfig;

  function handleSwitchBranch(branch: string, createNew: boolean) {
    readBridge()
      .gitSwitchBranch({
        projectLocation: project.location,
        branch,
        createNew,
      })
      .then((result) => {
        // Immediately patch the store so the UI updates without waiting
        // for the file-watcher → refreshProject cascade.
        const store = useGitStore.getState();
        const status = store.statuses[project.id];
        if (status) {
          store.setStatus(project.id, {
            ...status,
            branch: result.branch,
            tracking: result.tracking,
            ahead: result.ahead,
            behind: result.behind,
          });
        }
      })
      .catch((err: unknown) => {
        console.error("[git] switch branch failed", err);
        toast.danger(friendlyError(err));
      });
  }

  useEffect(() => {
    if (effectiveAgentKind && agentKind !== effectiveAgentKind) {
      setAgentKind(effectiveAgentKind);
    }
  }, [agentKind, effectiveAgentKind]);

  useEffect(() => {
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }

    if (lastAppliedAgentKindRef.current === effectiveAgentKind) {
      return;
    }

    const saved = resolveSavedProviderDraftConfig(
      effectiveAgentKind,
      lastDraftConfig,
      isHomeScope ? {} : providerConfigsRef.current,
      providerModelPreferencesRef.current,
      // Surface-aware restoration: a saved family member keeps its own
      // carriers; unscoped per-model preferences are never replayed onto it.
      selectedAgentForConfig.capabilities,
    );
    // Persist per-provider config app-wide, last-used provider per project.
    commitDraftConfigRef.current(
      effectiveAgentKind,
      resolveProviderDraftConfig(selectedAgentForConfig, saved),
    );
  }, [
    effectiveAgentKind,
    selectedAgentForConfig,
    project.id,
    lastDraftConfig,
    effectiveWorktreeMode,
    isHomeScope,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  useEffect(() => {
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }
    if (!model) {
      return;
    }

    const nextModel = resolveModelValue(selectedAgentForConfig, model);
    if (
      nextModel === model &&
      modelFamilyForModel(selectedAgentForConfig.capabilities, nextModel)
    ) {
      // A family member owns its display coordinates: the exact UID already
      // resolves, and the stored carriers — inert seeds or a meaningful legacy
      // override kept visible for the strict resolver — must not be rewritten
      // into ladder defaults on restore.
      return;
    }
    const nextEffort = resolveEffortValue(selectedAgentForConfig, nextModel, effort);
    const nextContext = resolveContextSizeValue(selectedAgentForConfig, nextModel, contextSize);
    const nextFast = resolveFastValue(selectedAgentForConfig, nextModel, fast);
    const nextThinking = resolveThinkingValue(selectedAgentForConfig, nextModel, thinking);
    if (
      nextModel !== model ||
      nextEffort !== effort ||
      nextContext !== contextSize ||
      nextFast !== fast ||
      nextThinking !== thinking
    ) {
      setDraftConfig(({ contextSize: _previousContext, ...current }) => ({
        ...current,
        model: nextModel,
        effort: nextEffort,
        ...(nextContext !== undefined ? { contextSize: nextContext } : {}),
        fast: nextFast,
        thinking: nextThinking,
      }));

      // Persist the corrected values
      const corrected: ProviderDraftConfig = {
        ...providerConfigsRef.current?.[effectiveAgentKind],
        model: nextModel,
        effort: nextEffort,
        ...(nextContext ? { contextSize: nextContext } : {}),
        fast: nextFast,
        thinking: nextThinking,
      };
      persistProviderConfigRef.current(effectiveAgentKind, corrected);
      updateProjectDraftConfig(project.id, {
        agentKind: effectiveAgentKind,
        model: nextModel,
        effort: nextEffort,
        ...(nextContext ? { contextSize: nextContext } : {}),
        fast: nextFast,
        thinking: nextThinking,
        mode,
        approvalPolicy,
        approvalsReviewer,
        sandboxMode,
        worktreeMode: effectiveWorktreeMode,
      });
    }
  }, [
    effort,
    contextSize,
    fast,
    thinking,
    model,
    selectedAgentForConfig,
    effectiveAgentKind,
    mode,
    approvalPolicy,
    approvalsReviewer,
    sandboxMode,
    effectiveWorktreeMode,
    isHomeScope,
    project.id,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  useEffect(() => {
    if (!sharedSettingsHydrated || !selectedAgentForConfig || !effectiveAgentKind || !model) {
      return;
    }
    if (hasLocalConfigEditRef.current) return;

    const settings = useSharedSettings.getState();
    providerConfigsRef.current = { ...settings.providerConfigs };
    providerModelPreferencesRef.current = { ...settings.providerModelPreferences };
    // A family member's carriers in state are authoritative on this surface;
    // the unscoped per-model preference replay must not overwrite them (the
    // same UID accepts the other surface's carrier semantics).
    if (modelFamilyForModel(selectedAgentForConfig.capabilities, model)) return;
    const preference = resolveProviderModelPreference(
      effectiveAgentKind,
      model,
      settings.providerConfigs,
      settings.providerModelPreferences,
    );
    if (!preference) return;

    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, {
      model,
      ...(preference.effort !== undefined ? { effort: preference.effort } : {}),
      ...(contextSize ? { contextSize } : {}),
      ...(preference.fast !== undefined ? { fast: preference.fast } : {}),
      thinking,
      mode,
      approvalPolicy,
      approvalsReviewer,
      sandboxMode,
    });
    const nextEffort = resolved.effort ?? "";
    const nextFast = resolved.fast ?? false;
    if (nextEffort === effort && nextFast === fast) return;

    setDraftConfig((current) => ({ ...current, effort: nextEffort, fast: nextFast }));
    const corrected: ProviderDraftConfig = {
      model,
      effort: nextEffort,
      ...(contextSize ? { contextSize } : {}),
      ...(resolved.fast !== undefined ? { fast: resolved.fast } : {}),
      ...(resolved.thinking !== undefined ? { thinking: resolved.thinking } : {}),
      mode,
      approvalPolicy,
      approvalsReviewer,
      sandboxMode,
    };
    persistProviderConfigRef.current(effectiveAgentKind, corrected);
    persistProjectDraftConfigRef.current({
      agentKind: effectiveAgentKind,
      ...corrected,
      worktreeMode: effectiveWorktreeMode,
    });
  }, [
    sharedSettingsHydrated,
    selectedAgentForConfig,
    effectiveAgentKind,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    mode,
    approvalPolicy,
    approvalsReviewer,
    sandboxMode,
    effectiveWorktreeMode,
  ]);

  useEffect(() => {
    if (isHomeScope || !sharedSettingsHydrated) {
      return;
    }
    if (!selectedAgentForConfig || !effectiveAgentKind) {
      return;
    }
    const initialLastDraftConfig = initialLastDraftConfigRef.current;
    const hasInitialProjectDraft =
      initialLastDraftConfig?.agentKind === effectiveAgentKind &&
      Boolean(initialLastDraftConfig.model.trim());
    // An own empty context is an exact saved carrier, not a missing one.
    const hasInitialContext =
      hasInitialProjectDraft && initialLastDraftConfig.contextSize !== undefined;
    const shouldInheritContext = !hasInitialContext && !hasLocalContextEditRef.current;
    if (hasLocalConfigEditRef.current && !shouldInheritContext) {
      return;
    }
    if (hasInitialContext) {
      return;
    }

    const providerConfigs = useSharedSettings.getState().providerConfigs;
    const providerModelPreferences = useSharedSettings.getState().providerModelPreferences;
    const providerConfig = providerConfigs[effectiveAgentKind];
    if (!providerConfig) {
      return;
    }
    providerConfigsRef.current = { ...providerConfigs };
    providerModelPreferencesRef.current = { ...providerModelPreferences };

    if (hasLocalConfigEditRef.current) {
      // A family member's own context — an empty carrier included — is exact
      // selection state its binding may record; deferred inheritance only
      // fills a missing one.
      if (
        contextSize !== undefined &&
        modelFamilyForModel(selectedAgentForConfig.capabilities, model)
      ) {
        return;
      }
      const nextContext = resolveContextSizeValue(
        selectedAgentForConfig,
        model,
        providerConfig.contextSize,
      );
      if (nextContext === contextSize) {
        return;
      }
      const { contextSize: _previousContext, ...current } = draftConfig;
      const next = { ...current, ...(nextContext ? { contextSize: nextContext } : {}) };
      setDraftConfig(next);
      updateProjectDraftConfig(project.id, {
        ...next,
        agentKind: effectiveAgentKind,
        worktreeMode: effectiveWorktreeMode,
      });
      return;
    }

    const saved = resolveSavedProviderDraftConfig(
      effectiveAgentKind,
      hasInitialProjectDraft ? initialLastDraftConfig : undefined,
      providerConfigs,
      providerModelPreferences,
      // Same surface-aware restoration contract as the provider-switch effect.
      selectedAgentForConfig.capabilities,
    );
    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, saved);
    const nextModel = resolved.model;
    const nextEffort = resolved.effort ?? "";
    const nextContext = resolved.contextSize;
    const nextFast = resolved.fast ?? false;
    const nextThinking = resolved.thinking ?? false;
    const nextMode = (resolved.mode ?? "agent") as "agent" | "plan" | "autopilot";
    const nextApproval = resolved.approvalPolicy ?? "";
    const nextReviewer = resolved.approvalsReviewer ?? "";
    const nextSandbox = resolved.sandboxMode ?? "";

    if (
      nextModel === model &&
      nextEffort === effort &&
      nextContext === contextSize &&
      nextFast === fast &&
      nextThinking === thinking &&
      nextMode === mode &&
      nextApproval === approvalPolicy &&
      nextReviewer === approvalsReviewer &&
      nextSandbox === sandboxMode
    ) {
      return;
    }

    setDraftConfig(resolved);
    lastAppliedAgentKindRef.current = effectiveAgentKind;

    if (
      !hasInitialProjectDraft &&
      (providerConfig.model !== nextModel ||
        providerConfig.effort !== nextEffort ||
        providerConfig.contextSize !== nextContext ||
        providerConfig.fast !== nextFast ||
        providerConfig.thinking !== nextThinking ||
        providerConfig.mode !== nextMode ||
        providerConfig.approvalPolicy !== nextApproval ||
        providerConfig.approvalsReviewer !== nextReviewer ||
        providerConfig.sandboxMode !== nextSandbox)
    ) {
      persistProviderConfigRef.current(effectiveAgentKind, resolved);
    }

    updateProjectDraftConfig(project.id, {
      ...resolved,
      agentKind: effectiveAgentKind,
      worktreeMode: effectiveWorktreeMode,
    });
  }, [
    sharedSettingsHydrated,
    selectedAgentForConfig,
    effectiveAgentKind,
    lastDraftConfig,
    draftConfig,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    mode,
    approvalPolicy,
    approvalsReviewer,
    sandboxMode,
    project.id,
    effectiveWorktreeMode,
    isHomeScope,
    updateProjectDraftConfig,
    setProviderConfig,
  ]);

  const hiddenModelIds = useSharedSettings((s) =>
    selectedAgent
      ? s.hiddenModels[
          modelVisibilityKey(
            selectedAgent.kind,
            presentationMode,
            selectedAgentForConfig?.capabilities.runtimeLabel,
          )
        ]
      : undefined,
  );
  const allHiddenModels = useSharedSettings((s) => s.hiddenModels);
  const selectedAgentFilteredCapabilities = useMemo(
    () =>
      selectedAgentForConfig
        ? filterHiddenModels(selectedAgentForConfig.capabilities, hiddenModelIds)
        : undefined,
    [selectedAgentForConfig, hiddenModelIds],
  );
  const providerModelProviders = useMemo(
    () =>
      buildProviderModelMenuProviders(installedAgents, {
        resolvePresentationMode: (agent) => {
          const supported = agent.capabilities.presentationModes ?? [
            agent.capabilities.presentationMode,
          ];
          return supported.includes(presentationMode)
            ? presentationMode
            : resolveInitialPresentationMode(agent, lastPresentationModeByAgent);
        },
        hiddenModelsByAgent: allHiddenModels,
      }),
    [installedAgents, presentationMode, lastPresentationModeByAgent, allHiddenModels],
  );
  // Deliberate family surface switches (presentation button, or picker rows
  // that carry a different presentation mode) must prove an exact mapping onto
  // the target relation before the mode commits: `undefined` means family
  // semantics are not involved and the ordinary path applies, `null` means the
  // mapping is unprovable and the surface AND config are retained behind a
  // visible failure, and a patch commits mode + config together. Event-path
  // only — hydration and restore never consult this.
  const familyTransitionFailureToast = () =>
    toast.danger(i18n._(msg`Can't use this model selection on that surface`));
  function resolveSurfaceTransition(
    targetAgent: AgentStatus,
    targetMode: ThreadPresentationMode,
  ): Partial<ThreadConfig> | null | undefined {
    if (!selectedAgentForConfig) return undefined;
    return resolveFamilyPresentationTransition(
      selectedAgentForConfig.capabilities,
      agentWithCapabilities(targetAgent, targetMode).capabilities,
      {
        model,
        effort,
        fast,
        ...(thinking ? { thinking: true } : {}),
        ...(contextSize ? { contextSize } : {}),
      },
    );
  }
  // Commit a proven transition: the full draft config resolves against the
  // TARGET surface's capabilities (the patch's exact UID plus carriers), then
  // mode and state land together so no correction effect reinterprets them.
  // Reduce one deliberate edit's complete result through the shared selection
  // mutation for its actual (or target) owner. `resolved` may carry a restored
  // stamp; only the event decides the returned binding.
  function mutateDraftSelection(
    resolved: ProviderDraftConfig,
    ownerKind: AgentStatus["kind"],
    ownerMode: ThreadPresentationMode,
    event: SelectionMutationEvent,
  ): ProviderDraftConfig {
    const { selectionBinding: _resolvedRecord, ...next } = resolved;
    return applyThreadConfigMutation({
      previous: draftConfig,
      next,
      owner: { agentKind: ownerKind, presentationMode: ownerMode },
      event,
    });
  }
  // A surface or owner change outside a proven transition retargets: the old
  // intent is dropped and controls are kept.
  function retargetPresentation(next: ThreadPresentationMode) {
    setPresentationMode(next);
    setDraftConfig(({ selectionBinding: _droppedRecord, ...current }) => current);
  }
  // Commit a proven transition: the full draft config resolves against the
  // TARGET surface's capabilities (the patch's exact UID plus carriers), then
  // mode and state land together so no correction effect reinterprets them. A
  // resolved target member is a fresh member event on the target relation and
  // owner; anything else is a retarget.
  function applyFamilySurfaceTransition(
    targetAgent: AgentStatus,
    targetMode: ThreadPresentationMode,
    transitionPatch: Partial<ThreadConfig>,
  ) {
    const targetAgentForConfig = agentWithCapabilities(targetAgent, targetMode);
    const resolved = resolveProviderDraftConfig(targetAgentForConfig, {
      ...draftConfig,
      ...(transitionPatch.model !== undefined ? { model: transitionPatch.model } : {}),
      ...(transitionPatch.effort !== undefined ? { effort: transitionPatch.effort } : {}),
      ...(transitionPatch.fast !== undefined ? { fast: transitionPatch.fast } : {}),
    });
    const relation = modelFamilyForModel(targetAgentForConfig.capabilities, resolved.model);
    setPresentationMode(targetMode);
    if (targetAgent.kind !== selectedAgent?.kind) {
      setAgentKind(targetAgent.kind);
    }
    commitDraftConfig(
      targetAgent.kind,
      mutateDraftSelection(
        resolved,
        targetAgent.kind,
        targetMode,
        relation ? { type: "family-member-edit", relation } : { type: "owner-retarget" },
      ),
    );
  }
  const latestConfigPatchRef = useRef<
    (patch: Partial<ThreadConfig>, origin?: ComposerSelectionOrigin) => void
  >(() => undefined);
  const latestProviderModelChangeRef = useRef<
    (next: {
      agentKind: string;
      model: string;
      presentationMode?: ThreadPresentationMode;
      selectionIntent?: ProviderModelSelectionIntent;
    }) => void
  >(() => undefined);
  const onConfigPatch = (patch: Partial<ThreadConfig>, origin?: ComposerSelectionOrigin) => {
    if ("browserMcp" in patch) {
      // Per-draft mention flag — not part of ProviderDraftConfig, so it bypasses
      // the resolver/persistence below. Set by an `@browser` mention, cleared by
      // removing its composer chip.
      setBrowserMcpMention(patch.browserMcp === true);
      return;
    }
    if ("crossagentMcp" in patch) {
      // Per-draft mention flag — same bypass as browserMcp above.
      setCrossagentMcpMention(patch.crossagentMcp === true);
      return;
    }
    if ("chromeMcp" in patch) {
      // Per-draft mention flag — same bypass as browserMcp above.
      setChromeMcpMention(patch.chromeMcp === true);
      return;
    }
    if ("computerUse" in patch) {
      // Per-draft mention flag — same bypass as browserMcp above.
      setComputerUseMention(patch.computerUse === true);
      return;
    }
    if (!selectedAgentForConfig) return;
    hasLocalConfigEditRef.current = true;
    if ("contextSize" in patch) {
      hasLocalContextEditRef.current = true;
    }
    // A family member's own carrier presence is exact; ordinary models keep
    // resolving from their displayed effort/Fast/thinking values.
    const current = modelFamilyForModel(selectedAgentForConfig.capabilities, model)
      ? draftConfig
      : { ...draftConfig, effort, fast, thinking };
    const resolved = resolveProviderDraftConfig(selectedAgentForConfig, { ...current, ...patch });
    // The same event classification as the thread composer: the producing
    // leaf's origin decides whether a member edit may mint, carrier touches
    // revoke their axes, and unrelated edits retain still-matching intent.
    const next = mutateDraftSelection(
      resolved,
      selectedAgentForConfig.kind,
      presentationMode,
      composerSelectionEvent(patch, origin, selectedAgentForConfig.capabilities),
    );
    // A retained family-row no-op writes nothing.
    if (Object.keys(patch).length === 0 && isThreadConfigEqual(next, draftConfig)) return;

    // Keep local state and persisted config in one transaction so menu
    // selection animations do not receive a second delayed state update.
    if (effectiveAgentKind) {
      commitDraftConfig(effectiveAgentKind, next);
    } else {
      setDraftConfig(next);
    }
  };
  latestConfigPatchRef.current = onConfigPatch;

  latestProviderModelChangeRef.current = ({
    agentKind: nextKind,
    model: nextModel,
    presentationMode: nextPresentationMode,
    selectionIntent,
  }) => {
    if (!selectedAgent || !selectedAgentForConfig) return;
    hasLocalConfigEditRef.current = true;
    const targetPresentationMode = props.chatOnly
      ? "gui"
      : (nextPresentationMode ?? presentationMode);
    if (nextKind !== selectedAgent.kind) {
      const targetAgent = installedAgents.find((agent) => agent.kind === nextKind);
      if (!targetAgent) return;
      const targetAgentForConfig = agentWithCapabilities(targetAgent, targetPresentationMode);

      // An explicit cross-provider row is honored atomically at the TARGET
      // surface: the clicked model and the row's intent resolve there on their
      // own — never through the source family mapping. A plain clicked row has
      // no family semantics (a source-family transition would either fail on a
      // family-less target or select the mapped source tuple instead of the
      // clicked row), and a family row must adopt the target's declared
      // default, not retain the source selection. The source family mapping
      // only governs same-provider surface switches below.
      const targetSaved = isHomeScope ? undefined : providerConfigsRef.current[nextKind];
      const targetBase = { ...targetSaved };
      delete targetBase.effort;
      delete targetBase.fast;
      let resolved: ProviderDraftConfig;
      let targetRelation: ReturnType<typeof modelFamilyForModel>;
      // A pick onto a family member of the target provider resolves through
      // the atomic selection edit — honoring the event's row intent — instead
      // of replaying per-model preferences onto the family's axes.
      if (modelFamilyForModel(targetAgentForConfig.capabilities, nextModel)) {
        // A new provider's family row adopts its default. Native model IDs may
        // be shared across profiles, so the source UID must not turn this into
        // a retain-current event in the target provider's family.
        const patch = resolveModelSelectionEdit(
          targetAgentForConfig.capabilities,
          {
            ...targetBase,
            model: "",
          },
          selectionIntent === "family"
            ? { kind: "family", model: nextModel }
            : { kind: "model", model: nextModel },
        );
        if (patch === null) {
          familyTransitionFailureToast();
          return;
        }
        targetRelation =
          selectionIntent === "family"
            ? modelFamilyForModel(targetAgentForConfig.capabilities, patch.model ?? nextModel)
            : undefined;
        resolved = resolveProviderDraftConfig(targetAgentForConfig, {
          ...targetBase,
          model: patch.model ?? nextModel,
          ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
          ...(patch.fast !== undefined ? { fast: patch.fast } : {}),
        });
      } else {
        const targetPreference = resolveProviderModelPreference(
          nextKind as AgentStatus["kind"],
          nextModel,
          providerConfigsRef.current,
          providerModelPreferencesRef.current,
        );
        resolved = resolveProviderDraftConfig(targetAgentForConfig, {
          ...targetBase,
          model: nextModel,
          ...(targetPreference?.effort !== undefined ? { effort: targetPreference.effort } : {}),
          ...(targetPreference?.fast !== undefined ? { fast: targetPreference.fast } : {}),
        });
      }
      // The target config is valid: commit the surface and preserve the source
      // provider's draft snapshot together with the target selection.
      if (targetPresentationMode !== presentationMode) {
        setPresentationMode(targetPresentationMode);
      }
      if (effectiveAgentKind) {
        persistProviderConfig(effectiveAgentKind, draftConfig);
      }
      // Only a deliberate target family row establishes fresh target intent;
      // any other cross-provider pick drops the source record.
      setAgentKind(nextKind as AgentStatus["kind"]);
      commitDraftConfig(
        nextKind as AgentStatus["kind"],
        mutateDraftSelection(
          resolved,
          nextKind as AgentStatus["kind"],
          targetPresentationMode,
          targetRelation
            ? { type: "family-member-edit", relation: targetRelation }
            : { type: "owner-retarget" },
        ),
      );
    } else {
      const picked = normalizeProviderModelConfig(
        selectedAgentForConfig.kind,
        { model: nextModel },
        selectedAgentForConfig.capabilities.models,
      );
      const targetModel = picked.model ?? nextModel;
      // A picker row that carries a different presentation mode is a deliberate
      // surface switch: resolve the family mapping before the mode commits.
      if (targetPresentationMode !== presentationMode) {
        const transition = resolveSurfaceTransition(selectedAgent, targetPresentationMode);
        if (transition !== undefined) {
          if (transition === null) {
            familyTransitionFailureToast();
            return;
          }
          applyFamilySurfaceTransition(selectedAgent, targetPresentationMode, transition);
          return;
        }
        retargetPresentation(targetPresentationMode);
      }
      // A pick into or out of a family relation resolves through the shared
      // edit helper at this event boundary: a projected family row keeps the
      // `family` intent ({} retains the exact current member), every exact row
      // — a favorite or recent of the representative included — selects its
      // exact member, and `null` is a visible rejection. No preference replay:
      // encoded axes live in the UID and config-bound carriers stay as
      // requested.
      if (
        (selectedAgentForConfig.capabilities.modelFamilies?.length ?? 0) > 0 &&
        (modelFamilyForModel(selectedAgentForConfig.capabilities, targetModel) ||
          modelFamilyForModel(selectedAgentForConfig.capabilities, model))
      ) {
        const patch = resolveModelSelectionEdit(
          selectedAgentForConfig.capabilities,
          draftConfig,
          selectionIntent === "family"
            ? { kind: "family", model: targetModel }
            : { kind: "model", model: targetModel },
        );
        // An empty family retain still reaches the reduction so a stale record
        // can drop; only a family row may mint.
        if (patch) {
          latestConfigPatchRef.current(
            patch,
            selectionIntent === "family" ? { kind: "family-resolved" } : { kind: "raw-pick" },
          );
        }
        return;
      }
      const modelPreference = resolveProviderModelPreference(
        effectiveAgentKind as AgentStatus["kind"],
        targetModel,
        providerConfigsRef.current,
        providerModelPreferencesRef.current,
      );
      latestConfigPatchRef.current(
        patchConfigForModelChange(
          selectedAgentForConfig.capabilities,
          targetModel,
          {
            ...(modelPreference?.effort !== undefined ? { effort: modelPreference.effort } : {}),
            ...(contextSize ? { contextSize } : {}),
            ...(modelPreference?.fast !== undefined
              ? { fast: modelPreference.fast }
              : picked.fast !== undefined
                ? { fast: picked.fast }
                : {}),
          },
          effectiveAgentKind ?? selectedAgent.kind,
        ),
      );
    }
  };

  const baseDraftControls = useMemo(() => {
    if (!selectedAgent || !selectedAgentForConfig) return [];
    const filteredCaps = selectedAgentFilteredCapabilities ?? selectedAgentForConfig.capabilities;
    return buildModelPickerControls({
      providers: providerModelProviders,
      selectedAgentKind: selectedAgent.kind,
      model,
      effort,
      ...(contextSize ? { contextSize } : {}),
      fast,
      thinking,
      capabilities: filteredCaps,
      presentationMode,
      machineKey: machineKeyForLocation(project.location),
      onProviderModelChange: (next) => latestProviderModelChangeRef.current(next),
      onConfigPatch: (patch, origin) => latestConfigPatchRef.current(patch, origin),
    });
  }, [
    selectedAgent,
    selectedAgentForConfig,
    selectedAgentFilteredCapabilities,
    providerModelProviders,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    presentationMode,
    project.location,
  ]);

  const draftControls = useMemo(() => {
    if (!selectedAgent || !selectedAgentForConfig) return [];
    const filteredCaps = selectedAgentFilteredCapabilities ?? selectedAgentForConfig.capabilities;
    return appendProviderComposerControls(baseDraftControls, {
      agentKind: selectedAgent.kind,
      capabilities: filteredCaps,
      config: {
        model,
        effort,
        ...(contextSize ? { contextSize } : {}),
        ...(fast ? { fast } : {}),
        ...(thinking ? { thinking } : {}),
        mode,
        approvalPolicy,
        approvalsReviewer,
        sandboxMode,
      },
      presentationMode,
      isDisabled: false,
      onConfigChange: (patch, origin) => latestConfigPatchRef.current(patch, origin),
    });
  }, [
    baseDraftControls,
    selectedAgent,
    selectedAgentForConfig,
    selectedAgentFilteredCapabilities,
    model,
    effort,
    contextSize,
    fast,
    thinking,
    mode,
    approvalPolicy,
    approvalsReviewer,
    sandboxMode,
    presentationMode,
  ]);

  // Stable centering for the full (non-compact) draft view: center once, then
  // pin the input's top edge so the composer no longer jumps when it grows.
  // Declared before the early returns below to keep hook order consistent.
  const anchorContainerRef = useRef<HTMLDivElement>(null);
  const anchorBlockRef = useRef<HTMLDivElement>(null);
  const anchorSpacerRef = useRef<HTMLDivElement>(null);
  useStableComposerAnchor({
    // Agent detection can render the draft view before the composer DOM exists.
    // Only arm the anchor once the selected-agent branch can actually mount it.
    enabled: !props.compact && !props.quickComposer && !!selectedAgent,
    containerRef: anchorContainerRef,
    blockRef: anchorBlockRef,
    spacerRef: anchorSpacerRef,
  });

  if (remoteConnection === "connecting" && !hostUpdateRestarting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <PixelLoader size="md" />
        <p className="text-sm text-muted">
          <Trans>Connecting…</Trans>
        </p>
      </div>
    );
  }
  if (!hostUpdateRestarting && remoteConnection !== "local" && remoteConnection !== "online") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Trans>Connection error</Trans>
        </h1>
        <p className="text-muted">
          {remoteConnectionMessage ?? (
            <Trans>This project's remote server is offline. Reconnect it to start a thread.</Trans>
          )}
        </p>
      </div>
    );
  }

  if (!selectedAgent) {
    if (props.isDetectingAgents) {
      // First-launch fancy reveal: tiles fade in as `agent-detected` events
      // arrive. Subsequent reloads (cache present, but the user opted out of
      // every agent or none are installed) fall back to the lightweight
      // pixel loader.
      if (showAgentDiscovery) {
        return <AgentDiscoveryScreen location={project.location} />;
      }
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <PixelLoader size="md" />
          <p className="text-sm text-muted">
            <Trans>Detecting agents…</Trans>
          </p>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          <Trans>No supported agents detected</Trans>
        </h1>
        <p className="text-muted">
          <Trans>
            Install {formatAgentList(props.agentStatuses.map((s) => s.label))} to create a thread.
          </Trans>
        </p>
      </div>
    );
  }

  const alignClass =
    props.paneAlign === "right" ? "ml-auto" : props.paneAlign === "left" ? "mr-auto" : "mx-auto";
  const paddingClass = "px-2";
  const compactComposer = props.compact || props.quickComposer;
  // The quick-composer surface renders width-hugging chrome-free, so it opts out
  // of the full-height sizing, max-widths, and padding the standard/compact views use.
  const rootSizeClass = props.quickComposer ? "w-full" : "h-full min-h-0";
  const bodySizeClass = props.quickComposer ? "w-full" : "h-full min-h-0 w-full max-w-[1040px]";
  const bodyPaddingClass = props.quickComposer
    ? ""
    : `${paddingClass} px-3 pb-2 ${props.compact ? "" : "pt-2"}`;
  const blockMaxWidthClass = props.quickComposer ? "" : "max-w-[720px]";

  const handlePresentationChange = (next: ThreadPresentationMode) => {
    // A deliberate switch while inside a family relation must prove an exact
    // mapping onto the target relation BEFORE the mode commits: without one,
    // the surface and config are retained behind a visible failure — never a
    // silent carrier reinterpretation or an adaptive fallback.
    const commitTransition = (targetAgent: AgentStatus) => {
      const transition = resolveSurfaceTransition(targetAgent, next);
      if (transition === undefined) return false;
      if (transition === null) {
        familyTransitionFailureToast();
        return true;
      }
      applyFamilySurfaceTransition(targetAgent, next, transition);
      return true;
    };
    // If the active provider can't serve this surface, swap to another
    // installed provider that can — the provider-switch effect will then
    // reload the per-provider config snapshot.
    if (!supportedPresentationModes.includes(next)) {
      const fallback = installedAgents.find((agent) => {
        const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
        return modes.includes(next);
      });
      if (!fallback) return;
      if (commitTransition(fallback)) return;
      retargetPresentation(next);
      setAgentKind(fallback.kind);
      return;
    }
    if (commitTransition(selectedAgent)) return;
    retargetPresentation(next);
    // Drop config values that the new presentation surface doesn't
    // support (e.g. Codex plan mode is ACP-only).
    const normalizer = effectiveAgentKind ? getConfigNormalizer(effectiveAgentKind) : undefined;
    if (!normalizer) return;
    const patch = normalizer({
      capabilities: capabilitiesForPresentation(selectedAgent.capabilities, next),
      config: {
        model,
        effort,
        ...(contextSize ? { contextSize } : {}),
        ...(fast ? { fast } : {}),
        ...(thinking ? { thinking } : {}),
        mode,
        approvalPolicy,
        approvalsReviewer,
        sandboxMode,
      },
      presentationMode: next,
    });
    if (Object.keys(patch).length > 0) onConfigPatch(patch);
  };

  // Effective launch flag for each composer MCP: a per-draft `@`-mention OR a
  // persistent standing default whose scope the current provider/presentation
  // actually supports. A persistent enable with a "none" scope must NOT set the
  // config flag — otherwise the composer would show a phantom "on" state and the
  // scope-reset effect there would fight it.
  const effectiveMcp = (id: BuiltInMcpServerId, mention: boolean, scope: string) =>
    disabledBuiltInMcpServers[id] !== true &&
    (mention ||
      ((implicitMcpServers.includes(id) || enabledMcpServers[id] === true) && scope !== "none"));
  const selectedMcpScope = resolveMcpScope(selectedAgent.capabilities.mcpScope, presentationMode);
  const effectiveBrowserMcp = effectiveMcp("browser", browserMcpMention, selectedMcpScope);
  const effectiveCrossagentMcp = effectiveMcp(
    "crossagents",
    crossagentMcpMention,
    selectedMcpScope,
  );
  const effectiveChromeMcp = effectiveMcp(
    "chrome",
    chromeMcpMention,
    chromeMcpServer.getScope(selectedAgent.capabilities, presentationMode, project.location),
  );
  const effectiveComputerUse = effectiveMcp(
    COMPUTER_USE_MCP_ID,
    computerUseMention,
    getComputerUseScope(selectedAgent.capabilities, presentationMode, project.location),
  );

  return (
    <div
      ref={props.droppableRef}
      className={`relative flex ${rootSizeClass} flex-col ${props.isDragging ? "opacity-50" : ""}`}
    >
      <ThreadDraftDropIndicators dropIndicator={props.dropIndicator} />
      {props.compact && !props.quickComposer && !props.chatOnly && (
        <ThreadDraftCompactHeader
          alignClass={alignClass}
          dragHandleRef={props.dragHandleRef}
          headerNeedsTrafficLightPad={headerNeedsTrafficLightPad}
          onClose={props.onClose}
          projectId={project.id}
          {...(scopeLabel ? { scopeLabel } : {})}
          {...(props.paneId ? { paneId: props.paneId } : {})}
          showCloseButton={props.showCloseButton}
        />
      )}
      <div
        ref={compactComposer ? undefined : anchorContainerRef}
        data-draft-body=""
        className={`${compactComposer ? alignClass : "mx-auto"} relative flex ${bodySizeClass} flex-col ${bodyPaddingClass}`}
      >
        {props.chatOnly ? (
          <div className="flex min-h-0 flex-1 text-muted opacity-40">
            <ThreadDraftHero compact />
          </div>
        ) : props.quickComposer ? null : props.compact ? (
          <ThreadDraftHero compact={props.compact} />
        ) : (
          // Spacer whose height is driven by useStableComposerAnchor to keep the
          // composer centered initially, then anchored as it grows.
          <div
            ref={anchorSpacerRef}
            aria-hidden
            className="w-full shrink-0"
            data-draft-composer-anchor-spacer=""
          />
        )}

        {/* Composer block: centered initially, then anchored by the input's top edge. */}
        <div
          ref={compactComposer ? undefined : anchorBlockRef}
          className={`${compactComposer ? alignClass : "mx-auto shrink-0"} w-full ${blockMaxWidthClass} ${props.quickComposer ? "quick-composer-control-surface" : ""}`}
        >
          {props.chatOnly ? null : (
            <div data-draft-controls="" className="mb-1 flex items-center justify-between gap-2">
              <ProjectSwitchMenu
                currentProjectId={project.id}
                variant="compact"
                {...(props.paneId ? { paneId: props.paneId } : {})}
                {...(props.onProjectChange ? { onSelectProject: props.onProjectChange } : {})}
              />
              <PresentationModeTabs
                presentationMode={presentationMode}
                supportsTerminal={supportsTerminalMode}
                supportsGui={supportsGuiMode}
                onChange={handlePresentationChange}
              />
            </div>
          )}
          <ThreadDraftComposerArea
            project={project}
            isRemote={project.remoteServerId !== undefined}
            {...(props.paneId ? { paneId: props.paneId } : {})}
            {...(props.restoreWorktreeSelectionToken !== undefined
              ? { restoreWorktreeSelectionToken: props.restoreWorktreeSelectionToken }
              : {})}
            selectedAgent={selectedAgentForConfig ?? selectedAgent}
            controls={draftControls}
            config={{
              ...launchSelectionFields(draftConfig, selectedAgentForConfig?.capabilities),
              ...(mode ? { mode } : {}),
              ...(approvalPolicy ? { approvalPolicy } : {}),
              ...(approvalsReviewer ? { approvalsReviewer } : {}),
              ...(sandboxMode ? { sandboxMode } : {}),
              ...(effectiveBrowserMcp ? { browserMcp: true } : {}),
              ...(effectiveCrossagentMcp ? { crossagentMcp: true } : {}),
              ...(effectiveChromeMcp ? { chromeMcp: true } : {}),
              ...(effectiveComputerUse ? { computerUse: true } : {}),
            }}
            compact={compactComposer}
            {...(props.chatOnly ? { hideWorkspaceControls: true } : {})}
            paneCount={props.paneCount}
            gitBranch={gitBranch}
            worktreeMode={effectiveWorktreeMode}
            supportsModePicker={supportsModePicker}
            presentationMode={presentationMode}
            {...(props.composerPlaceholder ? { placeholder: props.composerPlaceholder } : {})}
            {...(props.submitOnEnter !== undefined ? { submitOnEnter: props.submitOnEnter } : {})}
            {...(props.autoFocusComposer !== undefined
              ? { autoFocus: props.autoFocusComposer }
              : {})}
            {...(props.pickFiles ? { pickFiles: props.pickFiles } : {})}
            {...(props.saveClipboardImage ? { saveClipboardImage: props.saveClipboardImage } : {})}
            onConfigChange={onConfigPatch}
            onWorktreeModeChange={setWorktreeMode}
            onSwitchBranch={handleSwitchBranch}
            onRememberPresentationMode={() => {
              if (!props.chatOnly) setLastPresentationMode(selectedAgent.kind, presentationMode);
            }}
            onStart={onStart}
          />
        </div>
        {/* Absorbs the slack below the anchored composer in the full draft view. */}
        {compactComposer ? null : (
          <div aria-hidden data-draft-slack="" className="min-h-0 w-full flex-1" />
        )}
      </div>
    </div>
  );
}
