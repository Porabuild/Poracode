import { useEffect } from "react";
import type { AppView, ProjectLocation, Thread, ThreadPresentationMode } from "@/shared/contracts";
import type { PoracodeRuntimeDiagnosticContext } from "@/shared/diagnostics/sentryPrivacy";
import { resolveActivePaneId } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { getProjectMap, getThreadMap } from "@/renderer/state/useThread";
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
  const activePaneId = resolveActivePaneId(state.view.panes, state.focusedPaneId);
  const thread = getThreadMap(state.threads).get(activePaneId);
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
  const activePaneId = useAppStore((state) =>
    state.view.kind === "thread"
      ? resolveActivePaneId(state.view.panes, state.focusedPaneId)
      : null,
  );
  const activeThreadAgentKind = useAppStore((state) =>
    activePaneId ? getThreadMap(state.threads).get(activePaneId)?.agentKind : undefined,
  );
  const activeThreadPresentationMode = useAppStore((state) =>
    activePaneId ? getThreadMap(state.threads).get(activePaneId)?.presentationMode : undefined,
  );
  const activeThreadProjectId = useAppStore((state) =>
    activePaneId ? getThreadMap(state.threads).get(activePaneId)?.projectId : undefined,
  );
  const projectLocation = useAppStore((state): ProjectLocation | undefined =>
    activeThreadProjectId
      ? getProjectMap(state.projects).get(activeThreadProjectId)?.location
      : undefined,
  );
  const agentStatuses = useProjectAgentStatuses(projectLocation);
  const defaultPresentation = agentStatuses.find((status) => status.kind === activeThreadAgentKind)
    ?.capabilities.presentationMode;
  const presentation = activeThreadAgentKind
    ? (activeThreadPresentationMode ?? defaultPresentation ?? "terminal")
    : undefined;
  const provider = activeThreadAgentKind;
  const runtimeKind = presentation
    ? presentation === "terminal"
      ? "pty"
      : "structured"
    : undefined;

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
