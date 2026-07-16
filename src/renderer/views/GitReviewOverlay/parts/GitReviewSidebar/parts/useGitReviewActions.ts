import { useEffect } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { GitBranchInfo, GitStatusResult, Project, ProjectLocation } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { buildWorktreeLocation } from "@/shared/worktree";
import { resolveAiLanguageName } from "@/shared/locale";
import { msg, friendlyError, friendlyErrorWithDetail } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { detectOSLocale } from "@/renderer/i18n/locales";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import {
  useGitReviewActionState,
  useGitReviewActionStore,
} from "@/renderer/state/gitReviewActionStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { startPostPushPrStatusRefresh } from "@/renderer/state/gitRefresh";
import { usePullFromSourceDialogStore } from "@/renderer/state/pullFromSourceDialogStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { recordAiAction } from "@/renderer/state/usageRecorder";
import {
  generateCommitMessageWithFallbackDetails,
  getCommitGenCandidates,
  resolveCommitGenConfig,
  type GeneratedCommitMessageWithProvider,
} from "@/renderer/components/providers/commitGen";
import { usePrWriteActions } from "@/renderer/hooks/usePrWriteActions";
import {
  runGitMergeToSource,
  runGitPullFromSource,
  runGitSyncCommand,
  showGitActionError,
  showGitOperationFailure,
  type GitSyncCommand,
} from "@/renderer/actions/gitCommandRunner";

export interface UseGitReviewActionsArgs {
  project: Project;
  gitStatus: GitStatusResult | null | undefined;
  worktreeBranch: string | undefined;
  worktreePath: string | undefined;
  storeKey: string;
  isWorktreeStatus: boolean;
  onRefresh: () => void;
  onMergeAndRemove: (() => void) | undefined;
  effectiveBranch: string | undefined;
  effectivePrKey: string | undefined;
  sourceBranch: string | null;
  branchList: readonly GitBranchInfo[];
}

const TOAST_DETAIL_MAX_LINES = 12;
const TOAST_DETAIL_MAX_CHARS = 800;

function truncateForToast(details: string): string {
  const lines = details.split("\n");
  const sliced = lines.length > TOAST_DETAIL_MAX_LINES;
  let body = (sliced ? lines.slice(0, TOAST_DETAIL_MAX_LINES) : lines).join("\n");
  if (body.length > TOAST_DETAIL_MAX_CHARS) {
    body = body.slice(0, TOAST_DETAIL_MAX_CHARS);
  }
  return sliced || body.length < details.length ? `${body}\n…` : body;
}

export function useGitReviewActions(args: UseGitReviewActionsArgs) {
  const { t } = useLingui();
  const {
    project,
    gitStatus,
    worktreeBranch,
    worktreePath,
    storeKey,
    isWorktreeStatus,
    onRefresh,
    onMergeAndRemove,
    effectiveBranch,
    effectivePrKey,
    sourceBranch,
  } = args;

  // Apply an in-place tweak to the cached status. Used by post-action
  // optimistic updates so the UI flips immediately instead of waiting on a
  // `git status` round-trip — particularly slow on WSL (~500ms–1s per
  // wsl.exe spawn).
  function applyStatusOptimistic(updater: (current: GitStatusResult) => GitStatusResult): void {
    const store = useGitStore.getState();
    const current = isWorktreeStatus ? store.worktreeStatuses[storeKey] : store.statuses[storeKey];
    if (!current) return;
    const next = updater(current);
    if (isWorktreeStatus) store.setWorktreeStatus(storeKey, next);
    else store.setStatus(storeKey, next);
  }

  const isWsl = project.location.kind === "wsl";
  const commitGenProvider = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenProvider : s.commitGenProvider,
  );
  const commitGenModel = useSharedSettings((s) => (isWsl ? s.wslCommitGenModel : s.commitGenModel));
  const commitGenEffort = useSharedSettings((s) =>
    isWsl ? s.wslCommitGenEffort : s.commitGenEffort,
  );
  const commitGenFast = useSharedSettings((s) => (isWsl ? s.wslCommitGenFast : s.commitGenFast));
  // Commit messages and PR summaries are "git text": they follow the dedicated
  // gitTextLanguage setting (default English), independent of the UI language.
  const gitTextLanguageSetting = useSharedSettings((s) => s.gitTextLanguage);
  const appLocale = useSharedSettings((s) => s.locale);
  const gitTextLanguage = resolveAiLanguageName(
    gitTextLanguageSetting,
    appLocale,
    detectOSLocale(),
  );

  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );

  // The git review panel is keyed by `${projectId}:${worktreePath}` and fully
  // remounts when the user switches projects, so any useState here would reset
  // on switch — dropping draft text, the generation spinner, and any in-flight
  // operation's pending state while the work keeps running in the supervisor.
  // Holding it all in a store keyed by the same `storeKey` makes it survive the
  // remount: spinners reappear, async results land against the right panel even
  // if it unmounted mid-flight, and drafts are preserved. See
  // gitReviewActionStore.
  const {
    commitMessage,
    mergeMessageTemplate,
    commitGen,
    prTitle,
    prBody,
    prGen,
    prTargetBranch,
    isGenerating,
    isGeneratingPr,
    isCommitting,
    isSyncing,
    isMerging,
    isPullingFromSource,
    isAbortingMerge,
    isFinishingMerge,
    isCreatingPr,
    pullStashCommit,
  } = useGitReviewActionState(storeKey);
  const patch = useGitReviewActionStore((s) => s.patch);
  const setCommitMessage = (value: string) => patch(storeKey, { commitMessage: value });
  const setPrTitle = (value: string) => patch(storeKey, { prTitle: value });
  const setPrBody = (value: string) => patch(storeKey, { prBody: value });
  const setPrTargetBranch = (value: string | null) => patch(storeKey, { prTargetBranch: value });
  const setIsGenerating = (value: boolean) => patch(storeKey, { isGenerating: value });
  const setIsGeneratingPr = (value: boolean) => patch(storeKey, { isGeneratingPr: value });
  const setIsCommitting = (value: boolean) => patch(storeKey, { isCommitting: value });
  const setIsSyncing = (value: boolean) => patch(storeKey, { isSyncing: value });
  const setIsMerging = (value: boolean) => patch(storeKey, { isMerging: value });
  const setIsPullingFromSource = (value: boolean) =>
    patch(storeKey, { isPullingFromSource: value });
  const setIsAbortingMerge = (value: boolean) => patch(storeKey, { isAbortingMerge: value });
  const setIsFinishingMerge = (value: boolean) => patch(storeKey, { isFinishingMerge: value });
  const setIsCreatingPr = (value: boolean) => patch(storeKey, { isCreatingPr: value });
  function handlePullStashResult(result: {
    stashReapplied?: boolean;
    reapplyConflicting?: boolean;
    stashPreserved?: boolean;
  }): void {
    patch(storeKey, { pullStashCommit: null });
    if (result.stashReapplied) toast.success(msg("git.pull.stashReapplied"));
    else if (result.reapplyConflicting) toast.warning(msg("git.pull.reapplyConflicts"));
    else if (result.stashPreserved) toast.warning(msg("git.pull.stashPreserved"));
  }
  const mergeMessage = gitStatus ? gitStatus.mergeMessage || null : undefined;

  useEffect(() => {
    if (mergeMessage === undefined || mergeMessage === mergeMessageTemplate) return;

    patch(storeKey, {
      mergeMessageTemplate: mergeMessage,
      ...(mergeMessage && (!commitMessage || commitMessage === mergeMessageTemplate)
        ? { commitMessage: mergeMessage, commitGen: null }
        : {}),
    });
  }, [commitMessage, mergeMessage, mergeMessageTemplate, patch, storeKey]);

  const writeActions = usePrWriteActions({
    projectLocation: project.location,
    localSyncLocation: getWorktreeLocation(),
    prKey: effectivePrKey,
    branch: effectiveBranch,
    projectId: project.id,
    onRefresh,
  });
  const prLoading = isCreatingPr || writeActions.prLoading;

  const hasRemote = gitStatus?.hasRemote ?? false;
  const hasTracking = Boolean(gitStatus?.tracking);
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  const needsPush = hasTracking ? ahead > 0 && behind === 0 : hasRemote;
  const canGenerateMessage =
    getCommitGenCandidates(projectAgentStatuses, commitGenProvider).length > 0;

  function getWorktreeLocation(): ProjectLocation {
    if (!worktreePath) return project.location;
    return buildWorktreeLocation(project.location, worktreePath);
  }

  function refreshPrAfterPush(): void {
    if (!effectivePrKey || !effectiveBranch) return;
    startPostPushPrStatusRefresh({
      projectId: project.id,
      projectLocation: project.location,
      prKey: effectivePrKey,
      branch: effectiveBranch,
    });
  }

  async function generateMessage(): Promise<GeneratedCommitMessageWithProvider> {
    return generateCommitMessageWithFallbackDetails({
      projectLocation: project.location,
      agentStatuses: projectAgentStatuses,
      provider: commitGenProvider,
      model: commitGenModel,
      effort: commitGenEffort,
      fast: commitGenFast,
      ...(gitTextLanguage ? { language: gitTextLanguage } : {}),
      invoke: (payload) => readBridge().generateCommitMessage(payload),
    });
  }

  // Returns true when the commit (and optional push) fully succeeded, so
  // callers that chain further work — e.g. the combined "Commit & Create PR"
  // action — only proceed when there's actually something pushed to open a PR
  // against.
  async function handleCommit(addAll: boolean, pushAfter = false): Promise<boolean> {
    setIsCommitting(true);
    try {
      let message = commitMessage.trim();
      let autoGeneratedMessage = false;
      let commitGenResult: GeneratedCommitMessageWithProvider | undefined;
      if (!message && canGenerateMessage) {
        setIsGenerating(true);
        try {
          const generated = await generateMessage();
          message = generated.message;
          autoGeneratedMessage = true;
          commitGenResult = generated;
          setCommitMessage(message);
        } finally {
          setIsGenerating(false);
        }
      }
      if (!message) throw new Error("Commit message is required");
      const commitResult = await readBridge().gitCommit({
        projectLocation: project.location,
        message,
        addAll,
        ...(gitStatus?.mergeInProgress && pullStashCommit
          ? { reapplyStashCommit: pullStashCommit }
          : {}),
      });
      if (gitStatus?.mergeInProgress && pullStashCommit) {
        handlePullStashResult(commitResult);
      }
      captureProductEvent("git.commit_created", {
        add_all: addAll,
        auto_generated_message: autoGeneratedMessage,
        has_remote: hasRemote,
        has_tracking: hasTracking,
        has_worktree: Boolean(worktreePath),
        push_after: pushAfter,
      });
      // Attribute the commit to AI when it used a generated message — generated
      // inline just now (empty field) or earlier via the explicit Generate
      // button (commitGen, matched against the committed text).
      if (autoGeneratedMessage && commitGenResult) {
        recordAiAction("commit", commitGenResult.provider, commitGenResult.model);
      } else if (commitGen && commitGen.text.trim() === message) {
        recordAiAction("commit", commitGen.provider, commitGen.model);
      }
      patch(storeKey, { commitMessage: "", commitGen: null });
      // The new commit makes us one ahead and the staged set is now part of
      // the commit. Reflect that in the store immediately so the push button
      // appears without waiting for a `git status` round-trip.
      applyStatusOptimistic((s) => ({ ...s, ahead: s.ahead + 1, staged: [] }));

      if (pushAfter && hasRemote) {
        setIsSyncing(true);
        try {
          await runGitSyncCommand({
            command: "push",
            projectLocation: project.location,
            setUpstream: !hasTracking,
          });
          refreshPrAfterPush();
          applyStatusOptimistic((s) => ({ ...s, ahead: 0 }));
          // GitHub takes a beat to register the new commits — refreshing
          // immediately fetches a stale PR snapshot. Delay so the post-push
          // refresh picks up fresh state.
          setTimeout(() => onRefresh(), 1500);
        } finally {
          setIsSyncing(false);
        }
        return true;
      }

      onRefresh();
      // `git fetch` only updates `behind`, which doesn't gate the push UI.
      // Run it in the background so the user isn't blocked on a wsl.exe
      // network call (1–2s on WSL).
      readBridge()
        .gitFetch({ projectLocation: project.location, remote: "origin", prune: false })
        .catch(() => undefined)
        .finally(() => onRefresh());
      return true;
    } catch (err) {
      console.error("[git] commit failed", err);
      const { summary, details } = friendlyErrorWithDetail(err);
      if (details) {
        toast.danger(summary, {
          description: truncateForToast(details),
          actionProps: {
            children: t`Copy details`,
            onPress: () => void navigator.clipboard.writeText(details),
          },
          timeout: 0,
        });
      } else {
        toast.danger(summary);
      }
      return false;
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleGenerateMessage(): Promise<void> {
    // A generation may still be running from before a panel remount — don't
    // start a second one; the first one's result will land in the store.
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const generated = await generateMessage();
      // Keep the draft's provider/model with the text, so a later commit using
      // this generated message is still attributed to AI even though
      // handleCommit's inline-generate branch is skipped (field is non-empty).
      patch(storeKey, {
        commitMessage: generated.message,
        commitGen: {
          text: generated.message,
          provider: generated.provider,
          model: generated.model,
        },
      });
      captureProductEvent("git.commit_message_generated", {
        effort: commitGenEffort || "default",
        has_worktree: Boolean(worktreePath),
        provider: generated.provider,
      });
    } catch (err) {
      console.error("[git] generate message failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSyncOrPush(): Promise<void> {
    setIsSyncing(true);
    try {
      if (needsPush) {
        captureProductEvent("git.sync_action", {
          action: "push",
          has_remote: hasRemote,
          has_tracking: hasTracking,
          has_worktree: Boolean(worktreePath),
        });
        await runGitSyncCommand({
          command: "push",
          projectLocation: project.location,
          setUpstream: !hasTracking,
        });
        refreshPrAfterPush();
        // Optimistic: a successful push clears `ahead`. The refresh below
        // confirms it a moment later.
        applyStatusOptimistic((s) => ({ ...s, ahead: 0 }));
        // GitHub takes a beat to register the new commits — refreshing
        // immediately fetches a stale PR snapshot (mergeable/checks not
        // yet updated). Delay so the post-push refresh picks up fresh state.
        setTimeout(() => onRefresh(), 1500);
      } else {
        captureProductEvent("git.sync_action", {
          action: "sync",
          has_remote: hasRemote,
          has_tracking: hasTracking,
          has_worktree: Boolean(worktreePath),
        });
        await runGitSyncCommand({ command: "sync", projectLocation: project.location });
        onRefresh();
      }
    } catch (err) {
      showGitActionError(err, { logPrefix: "[git] sync/push failed" });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSyncAction(key: GitSyncCommand): Promise<void> {
    setIsSyncing(true);
    try {
      captureProductEvent("git.sync_action", {
        action: key,
        has_remote: hasRemote,
        has_tracking: hasTracking,
        has_worktree: Boolean(worktreePath),
      });
      await runGitSyncCommand({
        command: key,
        projectLocation: project.location,
        ...(key === "push" ? { setUpstream: !hasTracking } : {}),
      });
      if (key === "push") {
        refreshPrAfterPush();
        applyStatusOptimistic((s) => ({ ...s, ahead: 0 }));
        setTimeout(() => onRefresh(), 1500);
        return;
      }
      onRefresh();
    } catch (err) {
      showGitActionError(err, { logPrefix: "[git] sync action failed" });
    } finally {
      setIsSyncing(false);
    }
  }

  async function performMerge(): Promise<boolean> {
    if (!sourceBranch || !worktreeBranch || !worktreePath) return false;
    setIsMerging(true);
    try {
      const result = await runGitMergeToSource({
        projectLocation: project.location,
        worktreeLocation: getWorktreeLocation(),
        worktreeBranch,
        sourceBranch,
      });
      if (!result.merged) {
        const detail = result.conflictFiles?.length
          ? `\nConflicts:\n${result.conflictFiles.join("\n")}`
          : "";
        toast.danger((result.error ?? msg("git.merge.failed")) + detail);
        return false;
      }
      return true;
    } catch (err) {
      showGitActionError(err, { logPrefix: "[git] merge failed" });
      return false;
    } finally {
      setIsMerging(false);
    }
  }

  async function handleMergeOnly(): Promise<void> {
    if (await performMerge()) onRefresh();
  }

  async function handleMergeAndRemove(): Promise<void> {
    if (await performMerge()) onMergeAndRemove?.();
  }

  async function handlePullFromSource(): Promise<void> {
    if (!sourceBranch) return;
    setIsPullingFromSource(true);
    try {
      const result = await runGitPullFromSource({
        worktreeLocation: getWorktreeLocation(),
        sourceBranch,
        preserveLocalChanges: false,
      });
      if (result.needsStash && worktreePath) {
        usePullFromSourceDialogStore.getState().setDialog({
          projectId: project.id,
          worktreePath,
          sourceBranch,
          onComplete: onRefresh,
        });
        return;
      }
      if (result.conflicting) {
        onRefresh();
        return;
      }
      if (!result.merged) {
        showGitOperationFailure(result);
        return;
      }
      onRefresh();
    } catch (err) {
      showGitActionError(err, { logPrefix: "[git] pull from source failed" });
    } finally {
      setIsPullingFromSource(false);
    }
  }

  async function handleAbortMerge(): Promise<void> {
    setIsAbortingMerge(true);
    try {
      const result = await readBridge().gitAbortMerge({
        worktreeLocation: getWorktreeLocation(),
        ...(pullStashCommit ? { reapplyStashCommit: pullStashCommit } : {}),
      });
      handlePullStashResult(result);
      onRefresh();
    } catch (err) {
      console.error("[git] abort merge failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setIsAbortingMerge(false);
    }
  }

  async function handleFinishMerge(): Promise<void> {
    setIsFinishingMerge(true);
    try {
      const result = await readBridge().gitFinishMerge({
        worktreeLocation: getWorktreeLocation(),
        ...(pullStashCommit ? { reapplyStashCommit: pullStashCommit } : {}),
      });
      if (!result.success) {
        toast.danger(result.error ?? msg("git.merge.finishFailed"));
        return;
      }
      handlePullStashResult(result);
      onRefresh();
    } catch (err) {
      console.error("[git] finish merge failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setIsFinishingMerge(false);
    }
  }

  // Generate a PR summary by trying each given commit-gen candidate in turn.
  // Returns null when the candidate list is empty or (for the "auto" provider)
  // every candidate failed. Throws when a fixed provider fails, so the caller
  // can surface the error. Does not touch the generating flag — the caller owns
  // it, since this is shared by the explicit "Generate" button and the
  // auto-create flow. Candidates are passed in so the caller computes them once.
  async function generatePrSummaryResult(
    candidates: ReturnType<typeof getCommitGenCandidates>,
    headBranch: string,
    baseBranch: string,
  ): Promise<{ title: string; description: string; provider: string; model: string } | null> {
    for (const candidate of candidates) {
      const resolved = resolveCommitGenConfig(candidate, commitGenModel, commitGenEffort);
      try {
        const result = await readBridge().generatePrSummary({
          projectLocation: project.location,
          agentKind: candidate.kind,
          branch: headBranch,
          baseBranch,
          ...(resolved.model ? { model: resolved.model } : {}),
          ...(resolved.effort ? { effort: resolved.effort } : {}),
          ...(gitTextLanguage ? { language: gitTextLanguage } : {}),
        });
        captureProductEvent("git.pr_summary_generated", {
          effort: resolved.effort || "default",
          has_worktree: Boolean(worktreePath),
          provider: candidate.kind,
        });
        return { ...result, provider: candidate.kind, model: resolved.model || "default" };
      } catch (err) {
        // With a fixed provider there's nothing to fall back to — let the
        // caller decide how to surface it. With "auto", try the next candidate.
        if (commitGenProvider !== "auto") throw err;
      }
    }
    return null;
  }

  async function handleCreatePr(isDraft: boolean): Promise<void> {
    const targetBranch = prTargetBranch || sourceBranch;
    if (!effectiveBranch || !targetBranch) return;
    setIsCreatingPr(true);
    try {
      let title = prTitle.trim();
      let body = prBody.trim();
      let autoGenerated = false;
      let summaryProvider: string | undefined;
      let summaryModel: string | undefined;
      // No title entered: auto-generate the summary first, mirroring the
      // empty-commit-message flow in handleCommit. This powers both the
      // "auto" create-PR mode and pressing Create in the dialog with a blank
      // title.
      if (!title && canGenerateMessage && !isGeneratingPr) {
        const candidates = getCommitGenCandidates(projectAgentStatuses, commitGenProvider);
        setIsGeneratingPr(true);
        try {
          const summary = await generatePrSummaryResult(candidates, effectiveBranch, targetBranch);
          if (summary) {
            title = summary.title.trim();
            body = summary.description.trim();
            autoGenerated = true;
            summaryProvider = summary.provider;
            summaryModel = summary.model;
            setPrTitle(title);
            setPrBody(body);
          }
        } finally {
          setIsGeneratingPr(false);
        }
      }
      const pr = await readBridge().ghCreatePr({
        projectLocation: project.location,
        branch: effectiveBranch,
        baseBranch: targetBranch,
        title: title || effectiveBranch,
        body,
        isDraft,
      });
      captureProductEvent("git.pr_created", {
        auto_generated: autoGenerated,
        has_worktree: Boolean(worktreePath),
        is_draft: isDraft,
      });
      // Attribute the PR to AI when its summary was generated — inline just now
      // (empty title) or earlier via the explicit Generate button (prGen,
      // matched against the submitted title).
      if (autoGenerated && summaryProvider) {
        recordAiAction("pr", summaryProvider, summaryModel || "default");
      } else if (prGen && title && prGen.text.trim() === title) {
        // `title` is guarded non-empty: the PR falls back to the branch name
        // when blank, so an (unlikely) empty generated title must not match.
        recordAiAction("pr", prGen.provider, prGen.model);
      }
      if (effectivePrKey) {
        useGitStore.getState().setPrData(effectivePrKey, pr);
      }
      patch(storeKey, { prTitle: "", prBody: "", prGen: null });
    } catch (err) {
      console.error("[git] create PR failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setIsCreatingPr(false);
    }
  }

  // One-click "Commit & Create PR": commit + push, then — only if that
  // succeeded — auto-create the PR. The PR step always auto-generates (never
  // opens the dialog), so this stays a single uninterrupted action regardless
  // of the prCreateMode setting.
  async function handleCommitAndCreatePr(addAll: boolean): Promise<void> {
    const committed = await handleCommit(addAll, true);
    if (!committed) return;
    await handleCreatePr(false);
  }

  async function handleGeneratePrSummary(): Promise<void> {
    const targetBranch = prTargetBranch || sourceBranch;
    if (!effectiveBranch || !targetBranch) return;

    const candidates = getCommitGenCandidates(projectAgentStatuses, commitGenProvider);
    if (candidates.length === 0) {
      toast.danger(t`No agent available to generate PR summary`);
      return;
    }

    // Don't start a second PR-summary generation if one is still in flight
    // from before a panel remount — its result will land in the store.
    if (isGeneratingPr) return;
    setIsGeneratingPr(true);
    try {
      const result = await generatePrSummaryResult(candidates, effectiveBranch, targetBranch);
      if (result) {
        // Keep the summary's provider/model with the draft, so creating the PR
        // later attributes it to AI even though handleCreatePr's inline-generate
        // branch is skipped (title is non-empty).
        patch(storeKey, {
          prTitle: result.title,
          prBody: result.description,
          prGen: { text: result.title, provider: result.provider, model: result.model },
        });
      }
    } catch (err) {
      console.error("[git] generate PR summary failed", err);
      toast.danger(friendlyError(err));
    } finally {
      setIsGeneratingPr(false);
    }
  }

  return {
    commitMessage,
    setCommitMessage,
    isCommitting,
    isGenerating,
    isSyncing,
    isMerging,
    isPullingFromSource,
    isAbortingMerge,
    isFinishingMerge,
    pullStashCommit,
    prTitle,
    setPrTitle,
    prBody,
    setPrBody,
    prTargetBranch,
    setPrTargetBranch,
    prLoading,
    prPendingAction: writeActions.pendingAction,
    isGeneratingPr,
    handleCommit,
    handleGenerateMessage,
    handleSyncOrPush,
    handleSyncAction,
    handleMergeOnly,
    handleMergeAndRemove,
    handlePullFromSource,
    handleAbortMerge,
    handleFinishMerge,
    handleCreatePr,
    handleCommitAndCreatePr,
    handleMergePr: writeActions.handleMergePr,
    handleClosePr: writeActions.handleClosePr,
    handleMarkPrReady: writeActions.handleMarkPrReady,
    handleUpdatePrBranch: writeActions.handleUpdatePrBranch,
    handleRefreshPr: writeActions.handleRefreshPr,
    isRefreshingPr: writeActions.isRefreshing,
    handleGeneratePrSummary,
  };
}
