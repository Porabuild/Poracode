import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { openThread } from "@/renderer/actions/threadActions";
import { isRemoteCommandOutcomeUncertainError } from "@/renderer/actions/threadCommandOutcomeActions";
import { submitThreadInput } from "@/renderer/actions/threadRuntimeActions";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { retainAuxiliaryThreadId } from "@/renderer/state/auxiliaryThreadWindows";
import { useGitStore } from "@/renderer/state/gitStore";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { reviewSourceIdentity } from "@/renderer/utils/forgeReviews";
import { commitMatchesHead } from "../detail/header/checkoutGit";
import type { PrDetailScope } from "../detail/prDetailScope";
import {
  buildPrAskFollowUp,
  buildPrAskPrompt,
  truncate,
  type PrAskCheckout,
} from "./buildPrAskPrompt";
import { launchPrAskThread } from "./launchPrAskThread";
import { PrAskLaunchError } from "./prAskLaunchError";
import type { PrAskChatFailure, PrAskChatSession } from "./prAskSession";
import { resolvePrAskAgent } from "./resolvePrAskAgent";

/** How many reviews' chat threads one overlay session remembers. */
export const PR_ASK_REMEMBERED_THREADS = 20;
const TITLE_MAX_CHARS = 100;

type ThreadMap = Readonly<Record<string, string>>;

function remember(map: ThreadMap, key: string, threadId: string): ThreadMap {
  const { [key]: _previous, ...rest } = map;
  return Object.fromEntries(
    Object.entries({ ...rest, [key]: threadId }).slice(-PR_ASK_REMEMBERED_THREADS),
  );
}

/**
 * One chat per review. A review number alone is not unique: the same project can show
 * pull requests of several source hosts or accounts, so the source identity is part of it.
 */
export function prAskChatKey(scope: PrDetailScope): string {
  return `${scope.projectId}#${reviewSourceIdentity(scope.source) ?? "legacy"}#${scope.prNumber}`;
}

/**
 * Whether the agent's working directory is positively the pull request's head. A
 * worktree that merely carries the head branch's name (a fork's same-named branch, a
 * stale checkout) must not be described as the head: only a known worktree whose tip
 * is the head commit counts, and never one of a cross-repository review.
 */
function resolvePrAskCheckout(
  scope: PrDetailScope,
  project: Project,
  git: ReturnType<typeof useGitStore.getState>,
): PrAskCheckout {
  if (!scope.worktreePath) return "none";
  const caseInsensitive = project.location.kind === "windows";
  const wanted = normalizeWorktreePathForComparison(scope.worktreePath, caseInsensitive);
  const worktree = git.worktrees[scope.projectId]?.find(
    (candidate) => normalizeWorktreePathForComparison(candidate.path, caseInsensitive) === wanted,
  );
  const crossRepository = git.prData[scope.prKey]?.isCrossRepository === true;
  return worktree &&
    scope.headSha !== undefined &&
    !crossRepository &&
    commitMatchesHead(worktree.commit, scope.headSha)
    ? "head"
    : "unverified";
}

function forget(map: ThreadMap, key: string): ThreadMap {
  const { [key]: _removed, ...rest } = map;
  return rest;
}

type DeliveryState =
  | { key: string; phase: "starting" }
  | { key: string; phase: "failed"; error: PrAskChatFailure; prompt: string };

/**
 * The side chat of the open review. One real project thread (GUI presentation,
 * host-owned like any other) per review, created the first time the user asks
 * and kept out of the sidebar while the overlay shows it. The renderer only
 * decides which thread is "mine"; the supervisor starts and owns the agent.
 */
export function usePrAskChatSession(scope: PrDetailScope | null): PrAskChatSession {
  const { t } = useLingui();
  const key = scope ? prAskChatKey(scope) : null;
  const project = useProject(scope?.projectId);
  const environment = useDraftEnvironment(project);
  const disabledAgents = useSharedSettings((state) => state.disabledAgents);
  const providerConfigs = useSharedSettings((state) => state.providerConfigs);
  const providerModelPreferences = useSharedSettings((state) => state.providerModelPreferences);
  const selection = project
    ? resolvePrAskAgent({
        agents: environment.agentStatuses,
        disabledAgents,
        lastDraftConfig: project.lastDraftConfig,
        providerConfigs,
        providerModelPreferences,
      })
    : undefined;
  const serverStatus = useRemoteServersStore((state) =>
    project?.remoteServerId ? state.runtime[project.remoteServerId]?.status : undefined,
  );
  // A mirrored project on an unreachable server cannot launch; creating its row would leave a failed thread behind.
  const reachable =
    project !== undefined && !isRemoteProjectStatusUnreachable(project, serverStatus);
  const available = scope !== null && project !== undefined && selection !== undefined && reachable;

  const [threads, setThreads] = useState<ThreadMap>({});
  const [drafts, setDrafts] = useState<ThreadMap>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Readonly<Record<string, DeliveryState>>>({});
  const delivery = key ? deliveries[key] : undefined;
  /** Sets or clears the delivery of one review; deliveries of other reviews are untouched. */
  function setDelivery(forKey: string, next: DeliveryState | undefined) {
    setDeliveries((current) => {
      const { [forKey]: _previous, ...rest } = current;
      return next ? { ...rest, [forKey]: next } : rest;
    });
  }
  // Async deliveries read the review and agent as of the moment they run.
  const latest = useRef({ scope, project, selection, threads, key });
  useLayoutEffect(() => {
    latest.current = { scope, project, selection, threads, key };
  });
  const launchedKeys = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());

  const thread = useThread(key ? threads[key] : undefined);
  const threadId = thread?.id;
  // Keep the thread out of the sidebar while this review is on screen; leaving
  // the review or the overlay releases it and it stays an ordinary thread.
  //
  // LIMITATION (deliberate): this hiding is renderer-local. `retainAuxiliaryThreadId`
  // only feeds this window's sidebar filter, and the remembered review -> thread map
  // above is React state. The host has no field that marks a thread as auxiliary
  // without a source thread: the side chat's ownership ledger
  // (`bindSideChatThread`, `side-chat-ownership.json`) is Electron-main IPC state
  // bound to a source thread, and `Thread.parentThreadId` needs a real parent and
  // groups the row under it. A new host-owned marker would be a persisted-field and
  // protocol change (versioning.md), so none is added here. Consequently, other
  // clients on the same host (mobile, PWA, another window) and this window after a
  // reload list the PR chat as an ordinary project thread titled "PR #N: ...", and
  // after a reload the next question starts a new thread instead of reusing it.
  useEffect(() => {
    if (!threadId) return;
    return retainAuxiliaryThreadId(threadId);
  }, [threadId]);

  /**
   * Sends a follow-up, or creates and launches the review's thread with its opening
   * message. Resolves `true` only after the host accepts the message. A failed first
   * launch keeps a retry prompt, but returns `false` so the composer keeps the text.
   */
  async function deliver(input: {
    question: string;
    context?: string;
    retryPrompt?: string;
  }): Promise<boolean> {
    const { scope: s, project: p, selection: agent, key: k, threads: known } = latest.current;
    if (!s || !p || !agent || !k) return false;
    const existingId = known[k];
    const row = existingId
      ? useAppStore.getState().threads.find((candidate) => candidate.id === existingId)
      : undefined;
    if (existingId && !row) {
      // The user deleted the chat thread; the next ask starts a fresh one.
      launchedKeys.current.delete(k);
      setThreads((map) => forget(map, k));
    }
    if (row && launchedKeys.current.has(k)) {
      if (row.status === "working" || row.status === "launching") {
        toast.warning(t`The agent is still answering. Ask again when it finishes.`);
        return false;
      }
      // `submitThreadInput` returns quietly when it cannot resolve the thread or its
      // project, so confirm they exist instead of reporting a send that never happened.
      const state = useAppStore.getState();
      if (
        !state.threads.some((candidate) => candidate.id === row.id) ||
        !state.projects.some((candidate) => candidate.id === row.projectId)
      ) {
        toast.danger(t`Your message was not sent: the chat thread is no longer available.`);
        return false;
      }
      setDelivery(k, { key: k, phase: "starting" });
      try {
        await submitThreadInput(row.id, buildPrAskFollowUp(input.question, input.context));
        setDelivery(k, undefined);
        return true;
      } catch (error) {
        setDelivery(k, undefined);
        // An uncertain outcome was already announced and the message is painted in
        // the thread; the composer must not offer to send it a second time.
        if (isRemoteCommandOutcomeUncertainError(error)) return true;
        toast.danger(friendlyError(error));
        return false;
      }
    }
    const git = useGitStore.getState();
    const details = git.prDetails[s.cacheKey];
    const rowData = git.prData[s.prKey];
    const reviewTitle = details?.title ?? rowData?.title;
    const prNumber = s.prNumber;
    const prompt =
      input.retryPrompt ??
      buildPrAskPrompt({
        repository: s.source?.repository,
        url: rowData?.url,
        prNumber,
        headSha: s.headSha,
        baseBranch: details?.baseBranch ?? rowData?.baseBranch,
        title: reviewTitle,
        description: details?.body,
        files: git.prFiles[s.cacheKey],
        checkout: resolvePrAskCheckout(s, p, git),
        question: input.question,
        context: input.context,
      });
    const threadTitle = reviewTitle ? t`PR #${prNumber}: ${reviewTitle}` : t`PR #${prNumber}`;
    setDelivery(k, { key: k, phase: "starting" });
    let release: (() => void) | undefined;
    try {
      await launchPrAskThread({
        project: p,
        selection: agent,
        title: truncate(threadTitle, TITLE_MAX_CHARS).text,
        prompt,
        worktreePath: s.worktreePath,
        existingThreadId: row?.id,
        reserve: (id) => {
          release?.();
          // Renderer-local hiding only; see the limitation noted at the effect above.
          release = retainAuxiliaryThreadId(id);
          setThreads((map) => remember(map, k, id));
        },
      });
      launchedKeys.current.add(k);
      setDelivery(k, undefined);
      return true;
    } catch (error) {
      setDelivery(k, {
        key: k,
        phase: "failed",
        error: {
          message: error instanceof PrAskLaunchError ? error.message : friendlyError(error),
          uncertain: error instanceof PrAskLaunchError && error.uncertain,
        },
        prompt,
      });
      return false;
    } finally {
      release?.();
    }
  }

  function run(input: {
    question: string;
    context?: string;
    retryPrompt?: string;
  }): Promise<boolean> {
    // One delivery per review at a time; another review's question is independent.
    const forKey = latest.current.key;
    if (!forKey || inFlight.current.has(forKey)) return Promise.resolve(false);
    inFlight.current.add(forKey);
    return deliver(input).finally(() => {
      inFlight.current.delete(forKey);
    });
  }

  function send(prompt: string, context?: string): Promise<boolean> {
    if (!available || !prompt.trim()) return Promise.resolve(false);
    setOpenKey(latest.current.key);
    return run({ question: prompt, ...(context ? { context } : {}) });
  }

  return {
    open: key !== null && openKey === key,
    setOpen: (open) => {
      setOpenKey(open ? latest.current.key : null);
    },
    ask: (prompt, context) => {
      void send(prompt, context);
    },
    send,
    available,
    threadId,
    starting: delivery?.phase === "starting" && delivery.key === key,
    busy: thread?.status === "working" || thread?.status === "launching",
    draft: key ? (drafts[key] ?? "") : "",
    setDraft: (value) => {
      if (!key) return;
      setDrafts((map) => (value ? remember(map, key, value) : forget(map, key)));
    },
    error: delivery?.phase === "failed" && delivery.key === key ? delivery.error : undefined,
    retry: () => {
      if (!available || delivery?.phase !== "failed" || delivery.key !== key) return;
      void run({ question: "", retryPrompt: delivery.prompt });
    },
    openAsThread: () => {
      if (!threadId || !scope) return;
      openThread(threadId, { focusComposer: true });
      scope.onClose();
    },
  };
}
