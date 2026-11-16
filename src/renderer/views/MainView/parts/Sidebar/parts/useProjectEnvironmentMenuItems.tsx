import { Combine, Server, Split } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import type { ContextMenuEntry, ContextMenuItem } from "@/renderer/components/common/ContextMenu";
import { readProjectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import {
  combineGroups,
  projectEnvironmentKey,
  separateFromGroup,
} from "@/renderer/state/projectGroups/projectGroups";
import {
  getProjectGroupIndex,
  useProjectGroupIndex,
} from "@/renderer/state/projectGroups/useProjectGroups";

const SEPARATE_PREFIX = "environment-separate:";
const COMBINE_PREFIX = "environment-combine:";

/**
 * "Machines" submenu for a project row: split a machine's copy out of a
 * logical project that was grouped by mistake, or combine it with the same
 * project on another machine that wasn't recognized automatically. Combining
 * links the copies, so shared settings are written to both from then on.
 * Device-local presentation only; no host is written.
 *
 * It runs for every sidebar project row; the shared group index keeps that
 * subscription O(1) per row. Actions re-read the current index, so a menu
 * opened before a regroup never acts on stale membership.
 */
export function useProjectEnvironmentMenuItems(project: Project): {
  entry: ContextMenuEntry | null;
  onAction: (key: string) => boolean;
} {
  const { t } = useLingui();
  const index = useProjectGroupIndex();
  const group = index.groupByProjectId.get(project.id);
  if (!group || isHomeProject(project)) return { entry: null, onAction: () => false };

  const separateItems: ContextMenuItem[] =
    group.members.length > 1
      ? group.members.map((member) => {
          const machine = readProjectEnvironmentLabel(member);
          return {
            id: `${SEPARATE_PREFIX}${member.id}`,
            label: t`Show ${machine} as its own project`,
            icon: <Split className="size-3.5" />,
          };
        })
      : [];
  const environments = new Set(group.members.map(projectEnvironmentKey));
  const combineItems: ContextMenuItem[] = index.groups
    .filter(
      (candidate) =>
        candidate.id !== group.id &&
        !isHomeProject(candidate.anchor) &&
        candidate.members.every((member) => !environments.has(projectEnvironmentKey(member))),
    )
    .map((candidate) => {
      const name = candidate.anchor.name;
      const machines = candidate.members.map(readProjectEnvironmentLabel).join(", ");
      return {
        id: `${COMBINE_PREFIX}${candidate.id}`,
        label: t`Combine with ${name} (${machines})`,
        icon: <Combine className="size-3.5" />,
      };
    });
  if (separateItems.length === 0 && combineItems.length === 0) {
    return { entry: null, onAction: () => false };
  }

  const onAction = (key: string): boolean => {
    const store = useProjectGroupStore.getState();
    if (key.startsWith(SEPARATE_PREFIX)) {
      store.setOverrides(separateFromGroup(store, key.slice(SEPARATE_PREFIX.length)));
      return true;
    }
    if (key.startsWith(COMBINE_PREFIX)) {
      const current = getProjectGroupIndex();
      const target = current.groupByProjectId.get(project.id);
      const other = current.groupByProjectId.get(key.slice(COMBINE_PREFIX.length));
      const next = target && other ? combineGroups(store, target, other) : null;
      if (next) store.setOverrides(next);
      return true;
    }
    return false;
  };

  return {
    entry: {
      type: "submenu",
      id: "environments",
      label: t`Machines`,
      icon: <Server className="size-3.5" />,
      items: [...separateItems, ...combineItems],
    },
    onAction,
  };
}
