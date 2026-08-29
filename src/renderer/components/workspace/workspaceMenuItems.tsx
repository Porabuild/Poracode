import { Layers } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ContextMenuEntry } from "@/renderer/components/common/ContextMenu";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { WORKSPACE_UNFILED_KEY, workspaceMenuKey } from "./workspaceMenuKeys";
import { WorkspaceIcon } from "./WorkspaceIcon";

/**
 * The "Move to Workspace" submenu shared by the project header menu and the
 * Home thread menu: one entry per workspace (the current filing disabled) plus
 * the unfiled "All workspaces" choice. Undefined while fewer than two
 * workspaces exist — there is nothing to move between.
 */
export function useWorkspaceMenuItems(
  currentWorkspaceId: string | undefined,
): ContextMenuEntry | undefined {
  const { t } = useLingui();
  const workspaces = useSharedSettings((state) => state.workspaces);
  if (workspaces.length < 2) return undefined;
  return {
    type: "submenu" as const,
    id: "move-to-workspace",
    label: t`Move to Workspace`,
    icon: <Layers className="size-3.5" />,
    items: [
      ...workspaces.map((workspace) => ({
        id: workspaceMenuKey(workspace.id),
        label: workspace.name,
        icon: <WorkspaceIcon icon={workspace.icon} className="size-3.5" />,
        isDisabled: workspace.id === currentWorkspaceId,
      })),
      {
        id: WORKSPACE_UNFILED_KEY,
        label: t`All workspaces`,
        icon: <Layers className="size-3.5" />,
        isDisabled: !currentWorkspaceId,
      },
    ],
  };
}
