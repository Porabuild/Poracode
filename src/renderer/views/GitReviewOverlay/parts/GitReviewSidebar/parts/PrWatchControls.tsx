import { useEffect, useRef, useState } from "react";
import { Popover, toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Workflow } from "lucide-react";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import type { PrWatch, PrWatchInput, Project, ScheduledTaskConfig } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { ToggleSwitch } from "@/renderer/components/common";
import {
  getConflictResolverCandidates,
  readConflictResolverSettingsForProject,
  resolveConflictResolverLaunchConfig,
} from "@/renderer/components/providers/conflictResolver";
import {
  agentWithCapabilities,
  resolveFastValue,
} from "@/renderer/components/thread/threadDraftViewHelpers";
import { i18n } from "@/renderer/i18n/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

interface AutomationAgent {
  agentKind: string;
  config: ScheduledTaskConfig;
}

export function PrWatchControls(props: {
  projectId: string;
  prNumber: number;
  headBranch: string;
  worktreePath?: string | undefined;
  onRefreshPr?: (() => void | Promise<void>) | undefined;
}) {
  const { t } = useLingui();
  const project = useAppStore((state) =>
    state.projects.find((candidate) => candidate.id === props.projectId),
  );
  const windowsAgents = useAgentStatusesStore((state) => state.agentStatuses);
  const wslAgents = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const [watch, setWatch] = useState<PrWatch | null>(null);
  const [busy, setBusy] = useState(false);
  const watchPresentRef = useRef(false);
  const refreshPrRef = useRef(props.onRefreshPr);
  const enabled = Boolean(watch?.watchEnabled || watch?.autoMerge);

  useEffect(() => {
    refreshPrRef.current = props.onRefreshPr;
  }, [props.onRefreshPr]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let result = await readBridge().getPrWatch({
          projectId: props.projectId,
          prNumber: props.prNumber,
        });
        if (result?.watchEnabled && project) {
          const automation = resolveAutomationAgent(
            project,
            windowsAgents,
            wslAgents,
            useSharedSettings.getState(),
          );
          if (
            automation &&
            (result.agentKind !== automation.agentKind ||
              result.config?.model !== automation.config.model ||
              (result.config?.effort ?? "") !== (automation.config.effort ?? "") ||
              Boolean(result.config?.fast) !== Boolean(automation.config.fast))
          ) {
            result = await readBridge().upsertPrWatch({
              projectId: result.projectId,
              prNumber: result.prNumber,
              headBranch: result.headBranch,
              ...(result.worktreePath ? { worktreePath: result.worktreePath } : {}),
              watchEnabled: true,
              autoMerge: result.autoMerge,
              agentKind: automation.agentKind,
              config: automation.config,
            });
          }
        }
        if (cancelled) return;
        const shouldRefreshPr = result !== null || watchPresentRef.current;
        watchPresentRef.current = result !== null;
        setWatch(result);
        if (shouldRefreshPr) void refreshPrRef.current?.();
      } catch {
        // Keep the last visible watch state when the bridge is temporarily unavailable.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project, props.prNumber, props.projectId, windowsAgents, wslAgents]);

  async function update(watchEnabled: boolean, autoMerge: boolean): Promise<void> {
    if (busy || !project) return;
    setBusy(true);
    try {
      if (!watchEnabled && !autoMerge) {
        await readBridge().deletePrWatch({
          projectId: props.projectId,
          prNumber: props.prNumber,
        });
        watchPresentRef.current = false;
        setWatch(null);
        return;
      }

      const automation =
        watchEnabled && (!watch?.agentKind || !watch.config)
          ? resolveAutomationAgent(project, windowsAgents, wslAgents, useSharedSettings.getState())
          : watch?.agentKind && watch.config
            ? { agentKind: watch.agentKind, config: watch.config }
            : undefined;
      if (watchEnabled && !automation) {
        toast.warning(i18n._(msg`Connect an agent before watching PRs.`));
        return;
      }

      const input: PrWatchInput = {
        projectId: props.projectId,
        prNumber: props.prNumber,
        headBranch: props.headBranch,
        ...(props.worktreePath ? { worktreePath: props.worktreePath } : {}),
        watchEnabled,
        autoMerge,
        ...(automation ? { agentKind: automation.agentKind, config: automation.config } : {}),
      };
      const updated = await readBridge().upsertPrWatch(input);
      watchPresentRef.current = true;
      setWatch(updated);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover>
      <Popover.Trigger className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={t`PR automation`}
          title={t`PR automation`}
          className={`flex items-center justify-center rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${
            enabled ? "text-foreground" : "text-muted"
          }`}
        >
          <Workflow className="size-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-72">
        <Popover.Dialog className="p-3">
          <Popover.Heading className="text-xs font-medium text-foreground">
            <Trans>PR automation</Trans>
          </Popover.Heading>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  <Trans>Watch PR</Trans>
                </p>
                <p className="text-[11px] leading-tight text-muted">
                  <Trans>Fix new comments and failed checks, then push updates.</Trans>
                </p>
              </div>
              <ToggleSwitch
                size="sm"
                aria-label={t`Watch PR`}
                isDisabled={busy}
                isSelected={watch?.watchEnabled ?? false}
                onChange={(selected) => void update(selected, watch?.autoMerge ?? false)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  <Trans>Auto-merge</Trans>
                </p>
                <p className="text-[11px] leading-tight text-muted">
                  <Trans>Squash merge when checks and required reviews pass.</Trans>
                </p>
              </div>
              <ToggleSwitch
                size="sm"
                aria-label={t`Auto-merge`}
                isDisabled={busy}
                isSelected={watch?.autoMerge ?? false}
                onChange={(selected) => void update(watch?.watchEnabled ?? false, selected)}
              />
            </div>
            {watch?.activeThreadId ? (
              <p className="text-[11px] text-accent">
                <Trans>An agent is fixing this PR.</Trans>
              </p>
            ) : watch?.lastError ? (
              <p className="text-[11px] text-danger">{watch.lastError}</p>
            ) : null}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function resolveAutomationAgent(
  project: Project,
  windowsAgents: ReturnType<typeof useAgentStatusesStore.getState>["agentStatuses"],
  wslAgents: ReturnType<typeof useAgentStatusesStore.getState>["wslAgentStatuses"],
  settings: ReturnType<typeof useSharedSettings.getState>,
): AutomationAgent | undefined {
  const conflictSettings = readConflictResolverSettingsForProject(project.location.kind, settings);
  const agents = getProjectAgentStatuses(project.location, windowsAgents, wslAgents)
    .filter((agent) => {
      const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
      return agent.installed && agent.authState !== "missing" && modes.includes("gui");
    })
    .map((agent) => agentWithCapabilities(agent, "gui"))
    .filter((agent) => agent.capabilities.models.length > 0);
  const selected = getConflictResolverCandidates(agents, conflictSettings.provider)[0];
  if (!selected) return undefined;
  const { model, effort } = resolveConflictResolverLaunchConfig(
    conflictSettings.provider,
    selected,
    conflictSettings.model,
    conflictSettings.effort,
  );
  if (!model) return undefined;
  const fast = resolveFastValue(selected, model, conflictSettings.fast);
  return {
    agentKind: selected.kind,
    config: {
      model,
      ...(effort ? { effort } : {}),
      ...(fast ? { fast: true } : {}),
    },
  };
}
