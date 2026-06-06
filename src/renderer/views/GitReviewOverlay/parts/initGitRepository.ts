import { toast } from "@heroui/react";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";

/**
 * Run `git init` at the review's effective location, then refresh state.
 * Shared by GitReviewOverlay and GitReviewPanel, which drive the same flow
 * from their own `refreshing`/`refreshKey` state.
 */
export async function initGitRepository(params: {
  project: Project;
  effectiveLocation: ProjectLocation;
  statusKey: string | undefined;
  setRefreshing: (value: boolean) => void;
  bumpRefreshKey: () => void;
}): Promise<void> {
  const { project, effectiveLocation, statusKey, setRefreshing, bumpRefreshKey } = params;
  setRefreshing(true);
  try {
    await readBridge().gitInit({ projectLocation: effectiveLocation });
    if (statusKey && effectiveLocation !== project.location) {
      const status = await readBridge().getGitStatus({ projectLocation: effectiveLocation });
      useGitStore.getState().setWorktreeStatus(statusKey, status);
      return;
    }
    await refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  } catch (error) {
    console.error("[git] init failed", error);
    toast.danger(friendlyError(error));
  } finally {
    setRefreshing(false);
    bumpRefreshKey();
  }
}

export async function addGitRemote(params: {
  project: Project;
  effectiveLocation: ProjectLocation;
  statusKey: string | undefined;
  remote: string;
  url: string;
  setRefreshing: (value: boolean) => void;
  bumpRefreshKey: () => void;
}): Promise<boolean> {
  const { project, effectiveLocation, statusKey, remote, url, setRefreshing, bumpRefreshKey } =
    params;
  setRefreshing(true);
  try {
    await readBridge().gitAddRemote({ projectLocation: effectiveLocation, remote, url });
    if (statusKey && effectiveLocation !== project.location) {
      const status = await readBridge().getGitStatus({ projectLocation: effectiveLocation });
      useGitStore.getState().setWorktreeStatus(statusKey, status);
      return true;
    }
    await refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    return true;
  } catch (error) {
    console.error("[git] add remote failed", error);
    toast.danger(friendlyError(error));
    return false;
  } finally {
    setRefreshing(false);
    bumpRefreshKey();
  }
}
