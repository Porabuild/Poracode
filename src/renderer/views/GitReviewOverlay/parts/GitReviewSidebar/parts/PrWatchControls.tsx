import { useEffect, useRef, useState } from "react";
import { Popover, toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { GitMerge, Workflow, Wrench } from "lucide-react";
import type { PrAutomationMode, PrWatch, PrWatchInput, ForgeRepository } from "@/shared/contracts";
import { reviewScopeFromSource } from "@/shared/forgeRemote";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { resolvePrAutomationAgent } from "@/renderer/actions/prAutomationActions";
import { PrAutomationSlider } from "@/renderer/components/git/PrAutomationSlider";
import { Button } from "@/renderer/components/common";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";
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
  if (reason === "duplicate-project-watches") {
    return i18n._(
      msg`Duplicate projects had different automation threads. Review those threads, then choose an automation mode to resume.`,
    );
  }
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
  autoMergeAvailable?: boolean;
  autoFixAvailable?: boolean;
  source?: ForgeRepository;
  worktreePath?: string | undefined;
  onRefreshPr?: (() => void | Promise<void>) | undefined;
  initialWatch?: PrWatch | null | undefined;
  onInitialWatchUsed?: (() => void) | undefined;
  /** Replaces the trigger's default tight sizing (the compact header wants a touch target). */
  triggerClassName?: string;
  /** Controlled bottom-sheet presentation without a trigger (opened from a menu item). */
  sheet?: { open: boolean; onOpenChange: (open: boolean) => void };
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
  const scopeWarning = watch?.reviewScopeUnsupported
    ? t`This review watch uses an unsupported source-scope version. Update the app before changing it.`
    : watch && !watch.reviewScope
      ? t`This saved review watch has no source scope. Review the pull request and enable automation again.`
      : null;
  const blocked =
    Boolean(scopeWarning) ||
    (watch?.blockedReason != null && !watch.lastError && !watch.activeThreadId);
  const TriggerIcon = mode === "merge" ? GitMerge : mode === "fix" ? Wrench : Workflow;
  const triggerLabel = blocked
    ? mode === "merge"
      ? t`PR automation paused: Auto Merge`
      : mode === "fix"
        ? t`PR automation paused: Auto Fix`
        : t`PR automation paused`
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
    if (watch?.reviewScopeUnsupported && nextMode !== "off") return false;
    if (nextMode !== "off" && props.autoFixAvailable === false) return false;
    if (nextMode === "merge" && props.autoMergeAvailable === false) return false;
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
      const reviewScope = reviewScopeFromSource(props.source);
      const updated = reviewScope
        ? await readBridge().upsertForgePrWatch({ ...input, reviewScope })
        : await readBridge().upsertPrWatch(input);
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

  const body = (
    <div className="space-y-2">
      <PrAutomationSlider
        ariaLabel={t`PR automation`}
        className="mx-auto w-[200px] px-2"
        isDisabled={
          busy || watch === undefined || (props.autoFixAvailable === false && mode === "off")
        }
        value={mode}
        {...(props.autoMergeAvailable !== undefined
          ? { autoMergeAvailable: props.autoMergeAvailable }
          : {})}
        onChange={update}
      />
      <p className="text-[11px] leading-tight text-muted">
        {props.autoFixAvailable === false ? (
          <Trans>Automation requires a branch in this repository.</Trans>
        ) : props.autoMergeAvailable === false ? (
          <Trans>
            Auto Fix repairs merge blockers. Auto Merge is unavailable on this source host.
          </Trans>
        ) : (
          <Trans>
            Auto Fix waits for checks and repairs merge blockers. Auto Merge uses your selected
            merge method when ready.
          </Trans>
        )}
      </p>
      {scopeWarning ? (
        <p role="status" className="text-[11px] text-warning">
          {scopeWarning}
        </p>
      ) : watch?.activeThreadId ? (
        <p className="text-[11px] text-accent">
          <Trans>An agent is fixing this PR.</Trans>
        </p>
      ) : watch?.lastError ? (
        <p className="text-[11px] text-danger">{friendlyError(watch.lastError)}</p>
      ) : watch?.blockedReason ? (
        <p role="status" className="text-[11px] text-warning">
          {blockedMessage(watch.blockedReason)}
        </p>
      ) : null}
      {scopeWarning && !watch?.reviewScopeUnsupported && enabled && props.source?.account && (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy || props.autoFixAvailable === false}
          onPress={() => void update(mode)}
        >
          <Trans>Enable automation again</Trans>
        </Button>
      )}
    </div>
  );

  // The compact page opens this from its header menu as a bottom sheet; it has no trigger of its own.
  if (props.sheet) {
    return (
      <ResponsiveMenuSurface
        isOpen={props.sheet.open}
        onOpenChange={props.sheet.onOpenChange}
        label={t`PR automation`}
        trigger={null}
      >
        <div className="px-3 pb-3">{body}</div>
      </ResponsiveMenuSurface>
    );
  }

  return (
    <Popover>
      <Popover.Trigger className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className={`flex items-center justify-center transition-colors hover:bg-[var(--row-hover)] hover:text-foreground ${
            props.triggerClassName ?? "rounded p-0.5"
          } ${blocked ? "text-warning" : enabled ? "text-foreground" : "text-muted"}`}
        >
          <TriggerIcon className="size-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog className="p-3">
          <Popover.Heading className="text-xs font-medium text-foreground">
            <Trans>PR automation</Trans>
          </Popover.Heading>
          <div className="mt-3">{body}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
