import { useEffect } from "react";
import { Trans } from "@lingui/react/macro";
import { FolderOpen } from "lucide-react";
import type { Project } from "@/shared/contracts";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { EmptyState } from "../components";

/**
 * New-thread screen: the desktop's draft view rendered as-is — project
 * switcher, provider/model menu, CLI/Chat tabs, and the draft composer all
 * behave exactly like the main app.
 */
export function NewThreadView(props: {
  readonly project: Project | null;
  readonly onStart: (project: Project, input: DraftStartInput) => void | Promise<void>;
}) {
  const project = props.project;
  const agentStatuses = useProjectAgentStatuses(project?.location);

  // The desktop populates `useGitStore` from local git watchers; the shell
  // snapshot only ships per-thread git summaries, so on mobile the project's
  // current branch and branch list are never in `useGitStore`. Without them
  // the draft composer's worktree/branch selector (gated on `gitBranch`, fed
  // by `useGitStore.statuses/branches`) stays hidden. Hydrate it over the
  // remote bridge, mirroring `GitView.hydrate`: `getGitStatus` makes the row
  // appear, `gitProjectSnapshot` makes the branch dropdown usable. Keyed on
  // the project (not mount) because this view does not remount on in-place
  // project switches via the embedded ProjectSwitchMenu.
  const projectId = project?.id;
  const projectLocation = project?.location;
  useEffect(() => {
    if (!projectId || !projectLocation) return;
    const store = useGitStore.getState();
    void Promise.all([
      readBridge()
        .getGitStatus({ projectLocation })
        .then((status) => store.setStatus(projectId, status))
        .catch(() => undefined),
      readBridge()
        .gitProjectSnapshot({ projectLocation, includeGhCheck: true })
        .then((snapshot) =>
          store.setProjectSnapshot(projectId, {
            ...(snapshot.status ? { status: snapshot.status } : {}),
            ...(snapshot.branches ? { branches: snapshot.branches } : {}),
            ...(snapshot.worktrees ? { worktrees: snapshot.worktrees } : {}),
            ...(snapshot.ghAvailable !== null ? { ghAvailable: snapshot.ghAvailable } : {}),
          }),
        )
        .catch(() => undefined),
    ]);
  }, [projectId, projectLocation]);

  if (!project) {
    return (
      <section className="m-draft">
        <EmptyState
          icon={<FolderOpen className="size-5" />}
          title={<Trans>No projects available</Trans>}
          hint={<Trans>Open a project in Lightcode on your desktop, then refresh.</Trans>}
        />
      </section>
    );
  }

  return (
    <section className="m-draft">
      <ThreadDraftView
        key={project.id}
        project={project}
        agentStatuses={agentStatuses}
        {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
        onStart={(input) => props.onStart(project, input)}
      />
    </section>
  );
}
