import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { useAppStore } from "@/renderer/state/appStore";
import { selectDraftProject } from "../navHelpers";
import { useRemote } from "../remoteContext";
import type { MobileSetupKind } from "../setupEmptyState";
import { NewThreadView } from "./NewThreadView";

/**
 * The complete new-thread flow (project pick + draft composer + start), shared
 * by the /new route and the home screen's expanding composer sheet. On a
 * successful start the caller receives the new thread id to route to.
 */
export function NewThreadFlow(props: {
  readonly onStarted: (threadId: string) => void;
  readonly onSetupAction?: (kind: MobileSetupKind) => void;
}) {
  const remote = useRemote();
  const { t } = useLingui();
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [draftNonce, setDraftNonce] = useState(0);

  // The draft composer embeds the desktop ProjectSwitchMenu, which switches
  // projects through the shared store's `openDraft`; mirror that choice here.
  const storeView = useAppStore((state) => state.view);
  useEffect(() => {
    if (storeView.kind === "draft") setDraftProjectId(storeView.projectId);
  }, [storeView]);

  const draftProject = selectDraftProject(remote.projects, {
    draftProjectId,
    selectedThreadProjectId: remote.selectedThread?.projectId,
  });

  function startFromDraft(project: Project, input: DraftStartInput) {
    return remote
      .startThread(project, input)
      .then((threadId) => {
        if (threadId) props.onStarted(threadId);
      })
      .catch((error: unknown) => {
        toast.danger(error instanceof Error ? error.message : t`Unable to start the thread.`);
        // Remount the draft view so its internal pending state resets.
        setDraftNonce((nonce) => nonce + 1);
      });
  }

  return (
    <NewThreadView
      key={String(draftNonce)}
      project={draftProject}
      setupKind={remote.connection === "online" ? "project" : "desktop"}
      {...(props.onSetupAction ? { onSetupAction: props.onSetupAction } : {})}
      onStart={startFromDraft}
    />
  );
}
