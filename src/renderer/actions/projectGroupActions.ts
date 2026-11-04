import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type {
  Project,
  ProjectAction,
  ProjectScripts,
  ProjectSearchSettings,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { isRemoteProjectUnreachable } from "@/renderer/state/remoteServers/reachability";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import { syncedMembers } from "@/renderer/state/projectGroups/projectGroups";
import { readProjectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import {
  renameProject,
  setProjectPluginOverride,
  updateProjectIcon,
  updateProjectScripts,
  updateProjectSearchSettings,
  updateProjectWorktreeBaseBranch,
} from "./projectActions";

/**
 * Rows that share settings with `projectId`, always including it. Shared
 * project settings are values that describe the project rather than the
 * machine it is checked out on. A change is written to every environment's
 * row that is proven to be the same project (same known origin repository, or
 * linked by the user) through that row's own owner, so each host stays the
 * authority for its row and nothing is cached on the client to replay later.
 * Rows grouped only by name are never written. Rows on a machine this client
 * can't reach right now are left as they are and named in a notice; the
 * settings page then shows them as differing.
 */
export function sharedSettingsRows(projectId: string): readonly Project[] {
  const group = getProjectGroupIndex().groupByProjectId.get(projectId);
  if (group) return syncedMembers(group, projectId);
  const project = useAppStore.getState().projects.find((row) => row.id === projectId);
  return project ? [project] : [];
}

/** One notice per burst: typing in a shared field writes on every keystroke. */
const SKIPPED_NOTICE_WINDOW_MS = 5000;
let lastSkippedNotice: { names: string; at: number } | null = null;

function notifySkipped(names: string): void {
  const now = Date.now();
  if (lastSkippedNotice?.names === names && now - lastSkippedNotice.at < SKIPPED_NOTICE_WINDOW_MS) {
    lastSkippedNotice = { names, at: now };
    return;
  }
  lastSkippedNotice = { names, at: now };
  toast.warning(i18n._(msg`Not saved on ${names} — it's offline. Apply again once it's back.`));
}

/**
 * Apply `write` to the row for `projectId` and every other reachable
 * environment of the same project. Returns the rows that were skipped.
 */
export function applyToProjectEnvironments(
  projectId: string,
  write: (row: Project) => void,
): Project[] {
  const skipped: Project[] = [];
  for (const row of sharedSettingsRows(projectId)) {
    if (row.id !== projectId && isRemoteProjectUnreachable(row)) {
      skipped.push(row);
      continue;
    }
    write(row);
  }
  if (skipped.length > 0) {
    const names = [...new Set(skipped.map(readProjectEnvironmentLabel))].join(", ");
    notifySkipped(names);
  }
  return skipped;
}

/**
 * Rename every linked environment. A paired machine's project keeps its own
 * name on that host; the new name is this client's display name for it, as
 * for any single remote project.
 */
export function renameProjectEverywhere(projectId: string, name: string): void {
  applyToProjectEnvironments(projectId, (row) => {
    if (row.name !== name) renameProject(row.id, name);
  });
}

/**
 * Glyph icons are shared. A `file:` icon points into one checkout, so it stays
 * on the environment it was picked on.
 */
export function updateProjectIconEverywhere(projectId: string, icon: string | undefined): void {
  if (icon?.startsWith("file:")) {
    updateProjectIcon(projectId, icon);
    return;
  }
  applyToProjectEnvironments(projectId, (row) => {
    if (row.icon !== icon) updateProjectIcon(row.id, icon);
  });
}

function writeScriptsField(
  projectId: string,
  patch: (scripts: ProjectScripts) => ProjectScripts,
): void {
  applyToProjectEnvironments(projectId, (row) => {
    // Each row keeps its own setup and cleanup scripts; only the shared field moves.
    const current = row.scripts ?? { actions: [] };
    updateProjectScripts(row.id, patch(current));
  });
}

/** One edit to the shared action list, applied to each row's own list. */
export type ProjectActionChange =
  | { kind: "add"; action: ProjectAction }
  | { kind: "remove"; actionId: string }
  | { kind: "update"; actionId: string; patch: Partial<Omit<ProjectAction, "id">> };

function applyActionChange(
  actions: readonly ProjectAction[],
  change: ProjectActionChange,
): ProjectAction[] {
  if (change.kind === "add") {
    return actions.some((action) => action.id === change.action.id)
      ? actions.map((action) => (action.id === change.action.id ? change.action : action))
      : [...actions, change.action];
  }
  if (change.kind === "remove") return actions.filter((action) => action.id !== change.actionId);
  return actions.map((action) =>
    action.id === change.actionId ? { ...action, ...change.patch } : action,
  );
}

/**
 * Apply one action edit to every linked environment. Each row keeps actions
 * that only it has; an update to an action another row lacks leaves that row
 * alone, and the settings page shows the lists as differing.
 */
export function changeProjectActionsEverywhere(
  projectId: string,
  change: ProjectActionChange,
): void {
  writeScriptsField(projectId, (scripts) => ({
    ...scripts,
    actions: applyActionChange(scripts.actions ?? [], change),
  }));
}

/** Replace the action list on every linked environment ("Use this value everywhere"). */
export function setProjectActionsEverywhere(projectId: string, actions: ProjectAction[]): void {
  writeScriptsField(projectId, (scripts) => ({ ...scripts, actions }));
}

export function setWorktreeCopyPatternsEverywhere(
  projectId: string,
  patterns: string[] | undefined,
): void {
  writeScriptsField(projectId, (scripts) => {
    const { worktreeCopyPatterns: _, ...rest } = scripts;
    return patterns ? { ...rest, worktreeCopyPatterns: patterns } : rest;
  });
}

export function updateProjectSearchSettingsEverywhere(
  projectId: string,
  searchSettings: ProjectSearchSettings | undefined,
): void {
  applyToProjectEnvironments(projectId, (row) =>
    updateProjectSearchSettings(row.id, searchSettings),
  );
}

export function setProjectPluginOverrideEverywhere(
  projectId: string,
  pluginName: string,
  enabled: boolean | null,
): void {
  applyToProjectEnvironments(projectId, (row) =>
    setProjectPluginOverride(row.id, pluginName, enabled),
  );
}

export function updateProjectWorktreeBaseBranchEverywhere(
  projectId: string,
  baseBranch: string | undefined,
): void {
  applyToProjectEnvironments(projectId, (row) =>
    updateProjectWorktreeBaseBranch(row.id, baseBranch),
  );
}

/** Copy a whole plugin override map to every environment (used to reconcile a difference). */
export function setProjectPluginOverridesEverywhere(
  projectId: string,
  overrides: Readonly<Record<string, boolean>>,
): void {
  applyToProjectEnvironments(projectId, (row) => {
    const names = new Set([...Object.keys(row.pluginOverrides ?? {}), ...Object.keys(overrides)]);
    for (const name of names) {
      setProjectPluginOverride(
        row.id,
        name,
        Object.hasOwn(overrides, name) ? overrides[name]! : null,
      );
    }
  });
}
