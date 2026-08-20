import { useEffect, useRef, useState } from "react";
import { Popover, toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { GitMerge, Workflow, Wrench } from "lucide-react";
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

/**
 * Why automation is holding off. The watcher records a reason instead of
 * launching a fix that cannot help, so the state is worth showing rather than
 * leaving the PR looking watched when nothing will happen.
 */
function blockedMessage(reason: NonNullable<PrWatch["blockedReason"]>): string {
  if (reason === "agent-unavailable") {
    return i18n._(
      msg`Automation is paused: the configured helper agent is unavailable. Check the agent connection and helper settings.`,
    );
  }
  return i18n._(
    msg`Automation is paused: this PR's branch could not be checked out. Poracode keeps retrying automatically.`,
  );
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
  const blocked = watch?.blockedReason != null && !watch.lastError && !watch.activeThreadId;
  const TriggerIcon = mode === "merge" ? GitMerge : mode === "fix" ? Wrench : Workflow;
  const triggerLabel = blocked
    ? mode === "merge"
      ? t`PR automation paused: Auto Merge`
      : t`PR automation paused: Auto Fix`
    : mode === "merge"
      ? t`PR automation: Auto Merge`
      : mode === "fix"
        ? t`PR automation: Auto Fix`
        : t`PR automation`;

  useEffect(() => {
    refreshPrRef.current = props.onRefreshPr;
  }, [props.onRefreshPr]);

  useEffect(() => {
    if (initialWatch !== undefined) onInitialWatchUsed?.();
  }, [initialWatch, onInitialWatchUsed]);

  // Read-only: the watch's helper agent is refreshed app-wide by
  // usePrWatchAgentSync, so this popover no longer owns that resolution — it used
  // to, which meant a watch only caught up with the user's current helper while
  // its PR row happened to be on screen.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await readBridge().getPrWatch({
          projectId: props.projectId,
          prNumber: props.prNumber,
        });
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
  }, [props.prNumber, props.projectId]);

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

      // Re-resolve first: reusing the stored agent would carry a stale helper
      // (from whenever the watch was first enabled) straight back into the row.
      // The stored agent is only a fallback so a transient detection gap does
      // not refuse the toggle — usePrWatchAgentSync overwrites it on recovery.
      const automation =
        resolvePrAutomationAgent(project, windowsAgents, wslAgents, useSharedSettings.getState()) ??
        (watch?.agentKind && watch.config
          ? { agentKind: watch.agentKind, config: watch.config }
          : undefined);
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
          aria-label={triggerLabel}
          title={triggerLabel}
          className={`flex items-center justify-center rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${
            blocked ? "text-warning" : enabled ? "text-foreground" : "text-muted"
          }`}
        >
          <TriggerIcon className="size-3.5" />
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
            ) : watch?.blockedReason ? (
              <p role="status" className="text-[11px] text-warning">
                {blockedMessage(watch.blockedReason)}
              </p>
            ) : null}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
