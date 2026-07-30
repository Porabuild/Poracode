import { useEffect, useRef, useState } from "react";
import { Popover, toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Workflow } from "lucide-react";
import type { PrAutomationMode, PrWatch, PrWatchInput } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { resolvePrAutomationAgent } from "@/renderer/actions/prAutomationActions";
import { PrAutomationSlider } from "@/renderer/components/git/PrAutomationSlider";
import { i18n } from "@/renderer/i18n/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

function automationMode(watch: PrWatch | null | undefined): PrAutomationMode {
  if (watch?.autoMerge) return "merge";
  return watch?.watchEnabled ? "fix" : "off";
}

export function PrWatchControls(props: {
  projectId: string;
  prNumber: number;
  headBranch: string;
  worktreePath?: string | undefined;
  onRefreshPr?: (() => void | Promise<void>) | undefined;
  initialWatch?: PrWatch | null | undefined;
  onInitialWatchUsed?: (() => void) | undefined;
}) {
  const { initialWatch, onInitialWatchUsed } = props;
  const { t } = useLingui();
  const project = useAppStore((state) =>
    state.projects.find((candidate) => candidate.id === props.projectId),
  );
  const windowsAgents = useAgentStatusesStore((state) => state.agentStatuses);
  const wslAgents = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const [watch, setWatch] = useState<PrWatch | null | undefined>(initialWatch);
  const [busy, setBusy] = useState(false);
  const watchPresentRef = useRef(false);
  const refreshPrRef = useRef(props.onRefreshPr);
  const mode = automationMode(watch);
  const enabled = mode !== "off";

  useEffect(() => {
    refreshPrRef.current = props.onRefreshPr;
  }, [props.onRefreshPr]);

  useEffect(() => {
    if (initialWatch !== undefined) onInitialWatchUsed?.();
  }, [initialWatch, onInitialWatchUsed]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let result = await readBridge().getPrWatch({
          projectId: props.projectId,
          prNumber: props.prNumber,
        });
        if ((result?.watchEnabled || result?.autoMerge) && project) {
          const automation = resolvePrAutomationAgent(
            project,
            windowsAgents,
            wslAgents,
            useSharedSettings.getState(),
          );
          if (
            automation &&
            (!result.watchEnabled ||
              result.agentKind !== automation.agentKind ||
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

  async function update(nextMode: PrAutomationMode): Promise<boolean> {
    if (busy || !project) return false;
    setBusy(true);
    try {
      if (nextMode === "off") {
        await readBridge().deletePrWatch({
          projectId: props.projectId,
          prNumber: props.prNumber,
        });
        watchPresentRef.current = false;
        setWatch(null);
        return true;
      }

      const automation =
        watch?.agentKind && watch.config
          ? { agentKind: watch.agentKind, config: watch.config }
          : resolvePrAutomationAgent(
              project,
              windowsAgents,
              wslAgents,
              useSharedSettings.getState(),
            );
      if (!automation) {
        toast.warning(i18n._(msg`Connect an agent before watching PRs.`));
        return false;
      }

      const input: PrWatchInput = {
        projectId: props.projectId,
        prNumber: props.prNumber,
        headBranch: props.headBranch,
        ...(props.worktreePath ? { worktreePath: props.worktreePath } : {}),
        watchEnabled: true,
        autoMerge: nextMode === "merge",
        agentKind: automation.agentKind,
        config: automation.config,
      };
      const updated = await readBridge().upsertPrWatch(input);
      watchPresentRef.current = true;
      setWatch(updated);
      return true;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
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
      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog className="p-3">
          <Popover.Heading className="text-xs font-medium text-foreground">
            <Trans>PR automation</Trans>
          </Popover.Heading>
          <div className="mt-3 space-y-2">
            <PrAutomationSlider
              ariaLabel={t`PR automation`}
              className="mx-auto w-[200px] px-2"
              isDisabled={busy || watch === undefined}
              value={mode}
              onChange={update}
            />
            <p className="text-[11px] leading-tight text-muted">
              <Trans>
                Auto Fix waits for checks and repairs merge blockers. Auto Merge uses your selected
                merge method when ready.
              </Trans>
            </p>
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
