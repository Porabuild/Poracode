import { useEffect } from "react";
import type { AppView, ProjectLocation, Thread, ThreadPresentationMode } from "@/shared/contracts";
import type { PoracodeRuntimeDiagnosticContext } from "@/shared/diagnostics/sentryPrivacy";
import { useAppStore } from "@/renderer/state/appStore";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { setRendererRuntimeDiagnosticContext } from "./sentry";

type RuntimeContextState = {
  view: AppView;
  focusedPaneId: string | null;
  threads: readonly Thread[];
};

export function resolveRendererRuntimeDiagnosticContext(
  state: RuntimeContextState,
  defaultPresentation?: ThreadPresentationMode,
): PoracodeRuntimeDiagnosticContext | null {
  if (state.view.kind !== "thread") return null;
  const activePaneId =
    state.focusedPaneId && state.view.panes.includes(state.focusedPaneId)
      ? state.focusedPaneId
      : state.view.panes[0];
  const thread = state.threads.find((candidate) => candidate.id === activePaneId);
  if (!thread) return null;

  const presentation = thread.presentationMode ?? defaultPresentation ?? "terminal";
  return {
    provider: thread.agentKind,
    presentation,
    runtimeKind: presentation === "terminal" ? "pty" : "structured",
    featureArea: "thread",
  };
}

export function RendererRuntimeDiagnosticContextSync() {
  const view = useAppStore((state) => state.view);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const threads = useAppStore((state) => state.threads);
  const activeThread =
    view.kind === "thread"
      ? threads.find(
          (thread) =>
            thread.id ===
            (focusedPaneId && view.panes.includes(focusedPaneId) ? focusedPaneId : view.panes[0]),
        )
      : undefined;
  const projectLocation = useAppStore((state): ProjectLocation | undefined =>
    activeThread
      ? state.projects.find((project) => project.id === activeThread.projectId)?.location
      : undefined,
  );
  const agentStatuses = useProjectAgentStatuses(projectLocation);
  const defaultPresentation = agentStatuses.find(
    (status) => status.kind === activeThread?.agentKind,
  )?.capabilities.presentationMode;
  const context = resolveRendererRuntimeDiagnosticContext(
    { view, focusedPaneId, threads },
    defaultPresentation,
  );
  const presentation = context?.presentation;
  const provider = context?.provider;
  const runtimeKind = context?.runtimeKind;

  useEffect(() => {
    setRendererRuntimeDiagnosticContext(
      provider && presentation && runtimeKind
        ? { provider, presentation, runtimeKind, featureArea: "thread" }
        : null,
    );
    return () => setRendererRuntimeDiagnosticContext(null);
  }, [presentation, provider, runtimeKind]);

  return null;
}
