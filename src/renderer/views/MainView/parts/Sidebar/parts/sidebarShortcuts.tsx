import { CalendarClock, GitPullRequest, Workflow } from "lucide-react";
import { startTransition, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { useCurrentProjectId } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export interface SidebarShortcutEntry {
  id: "pullRequests" | "githubActions" | "schedules";
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onPress: () => void;
}

/**
 * The configurable sidebar destinations (Settings → General can hide or
 * reorder them). Shared by the expanded footer nav and the collapsed icon
 * rail so both surfaces resolve order, visibility, and active state the same
 * way.
 */
export function useSidebarShortcuts(): SidebarShortcutEntry[] {
  const { t } = useLingui();
  const currentProjectId = useCurrentProjectId();
  const sidebarHiddenShortcuts = useSharedSettings((s) => s.sidebarHiddenShortcuts);
  const sidebarShortcutOrder = useSharedSettings((s) => s.sidebarShortcutOrder);
  const appView = useAppStore((s) => s.view);
  const openPullRequests = useAppStore((s) => s.openPullRequests);
  const openGitHubActions = useAppStore((s) => s.openGitHubActions);
  const openSchedules = useAppStore((s) => s.openSchedules);
  const githubActionsOpen = usePanelStore((s) => s.githubActionsContext !== null);

  const sidebarShortcutsById = new Map<
    SidebarShortcutEntry["id"],
    Omit<SidebarShortcutEntry, "isActive">
  >([
    [
      "pullRequests",
      {
        id: "pullRequests",
        icon: <GitPullRequest className="size-4" />,
        label: t`Pull requests`,
        onPress: () => startTransition(() => openPullRequests()),
      },
    ],
    [
      "githubActions",
      {
        id: "githubActions",
        icon: <Workflow className="size-4" />,
        label: t`GitHub Actions`,
        onPress: () => startTransition(() => openGitHubActions(currentProjectId)),
      },
    ],
    [
      "schedules",
      {
        id: "schedules",
        icon: <CalendarClock className="size-4" />,
        label: t`Schedules`,
        onPress: () => startTransition(() => openSchedules()),
      },
    ],
  ]);

  return sidebarShortcutOrder
    .map((id) => sidebarShortcutsById.get(id))
    .filter(
      (shortcut): shortcut is NonNullable<typeof shortcut> =>
        shortcut !== undefined && !sidebarHiddenShortcuts.includes(shortcut.id),
    )
    .map((shortcut) => ({
      ...shortcut,
      isActive: shortcut.id === "githubActions" ? githubActionsOpen : appView.kind === shortcut.id,
    }));
}
