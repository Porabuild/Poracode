import type { PromptSegment, Thread } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import {
  bucketCount,
  bucketDurationMs,
  type ProductAnalyticsProperties,
} from "@/shared/analytics/posthogPrivacy";
import { useAppStore } from "@/renderer/state/appStore";
import {
  captureProductEvent,
  configureProductAnalytics,
  flushProductAnalytics,
} from "./productAnalytics";
import { createProductViewTracker, type TrackedProductView } from "./productViewTracker";
import { subscribeProductSurfaceVisibility } from "./useProductViewTracking";
import {
  promptProductProperties,
  threadProductProperties,
  type ThreadProductInput,
} from "./threadAnalyticsProperties";

export { threadProductProperties } from "./threadAnalyticsProperties";

const FLUSH_INTERVAL_MS = 10_000;

type AppView = ReturnType<typeof useAppStore.getState>["view"];

function viewProperties(view: AppView): ProductAnalyticsProperties {
  return {
    view_kind: view.kind,
    pane_count: view.kind === "thread" ? view.panes.length : 0,
  };
}

export function appViewDefinition(view: AppView): TrackedProductView {
  const properties = viewProperties(view);
  const fingerprint =
    view.kind === "thread"
      ? view.panes.toSorted().join(",")
      : view.kind === "draft"
        ? view.projectId
        : view.kind === "experiment"
          ? `${view.projectId}:${view.experimentId}`
          : view.kind;
  return {
    // The fingerprint is local tracker state only. Entity IDs are never added
    // to event properties or sent to PostHog.
    key: `app:${view.kind}:${fingerprint}`,
    seenEvent: "app.view_seen",
    durationEvent: "app.view_duration",
    properties,
  };
}

function appSummaryProperties(): ProductAnalyticsProperties {
  const state = useAppStore.getState();
  const worktreeCount = new Set(state.threads.flatMap((thread) => thread.worktreePath ?? [])).size;
  return {
    project_count: state.projects.length,
    thread_count: state.threads.length,
    worktree_count_bucket: bucketCount(worktreeCount),
  };
}

export function captureAppStarted(): void {
  captureProductEvent("app.started", appSummaryProperties());
}

export function captureThreadStarted(thread: ThreadProductInput): void {
  captureProductEvent("thread.started", {
    ...threadProductProperties(thread),
    launch_kind: thread.sessionRef ? "resumed" : "new",
  });
}

export function captureThreadPromptSubmitted(
  thread: ThreadProductInput,
  prompt: string,
  segments?: readonly PromptSegment[],
  source: "command_palette" | "follow_up" | "initial" | "pending_steer" | "remote" = "follow_up",
): void {
  captureProductEvent("thread.input_submitted", {
    ...threadProductProperties(thread, segments, {
      resolveCapabilities: source !== "remote",
    }),
    ...promptProductProperties(prompt, segments, source),
    source,
  });
}

function outcomeForStatus(status: Thread["status"]): string {
  if (status === "error") return "error";
  if (status === "needs_approval") return "needs_approval";
  if (status === "needs_reply") return "needs_reply";
  if (status === "idle" || status === "finished") return "completed";
  return status;
}

function installStoreSubscriptions(): () => void {
  const disposers: Array<() => void> = [];
  const appViewTracker = createProductViewTracker({
    capture: captureProductEvent,
    // Wrap window's timer methods — called detached from `window` they throw
    // "Illegal invocation" in the browser (Node's timers don't, so tests miss it).
    clearTimeout: (timer) => clearTimeout(timer),
    now: Date.now,
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  });
  const syncAppView = () => {
    appViewTracker.setView(appViewDefinition(useAppStore.getState().view));
  };
  syncAppView();
  disposers.push(subscribeProductSurfaceVisibility("app", appViewTracker.setVisible));

  disposers.push(
    useAppStore.subscribe((state, prevState) => {
      if (state.view !== prevState.view) {
        syncAppView();
      }

      const previousThreads = new Map(prevState.threads.map((thread) => [thread.id, thread]));
      for (const thread of state.threads) {
        const previous = previousThreads.get(thread.id);
        if (previous && isThreadTurnActive(previous.status) && !isThreadTurnActive(thread.status)) {
          const startedAt = previous.activeTurnStartedAt
            ? new Date(previous.activeTurnStartedAt).getTime()
            : NaN;
          const durationMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 0;
          captureProductEvent("thread.turn_completed", {
            ...threadProductProperties(thread),
            attention: thread.attention,
            duration_bucket: bucketDurationMs(durationMs),
            duration_ms: durationMs,
            outcome: outcomeForStatus(thread.status),
            status: thread.status,
          });
        }
      }
    }),
  );

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void flushProductAnalytics();
    }
  };
  const handlePageHide = () => {
    appViewTracker.finish();
    void flushProductAnalytics();
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);

  return () => {
    appViewTracker.finish();
    for (const dispose of disposers) dispose();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
  };
}

export function installProductAnalytics(): () => void {
  if (!configureProductAnalytics()) return () => {};
  const unsubscribe = installStoreSubscriptions();
  const intervalId = window.setInterval(() => {
    void flushProductAnalytics();
  }, FLUSH_INTERVAL_MS);
  return () => {
    unsubscribe();
    window.clearInterval(intervalId);
    void flushProductAnalytics();
  };
}
