import { CalendarClock, GitPullRequest, Workflow } from "lucide-react";
import { startTransition, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { useCurrentProjectId } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { SidebarShortcutId } from "@/shared/settings";
import { useSettingsShortcutDestinations } from "@/renderer/views/SettingsOverlay/parts/settingsNavigation";

export interface SidebarShortcutEntry {
  id: SidebarShortcutId;
  icon: ReactNode;
  label: string;
  isActive: boolean;
  isVisible: boolean;
  onPress: () => void;
}

/**
 * The configurable sidebar destinations (Settings → General can hide or
 * reorder them). Shared by the expanded footer nav and the collapsed icon
 * rail so both surfaces resolve order, visibility, and active state the same
 * way.
 */
export function useSidebarShortcuts(includeHidden = false): SidebarShortcutEntry[] {
  const { t } = useLingui();
  const currentProjectId = useCurrentProjectId();
  const sidebarHiddenShortcuts = useSharedSettings((s) => s.sidebarHiddenShortcuts);
  const sidebarShortcutOrder = useSharedSettings((s) => s.sidebarShortcutOrder);
  const appView = useAppStore((s) => s.view);
  const openPullRequests = useAppStore((s) => s.openPullRequests);
  const openGitHubActions = useAppStore((s) => s.openGitHubActions);
  const openSchedules = useAppStore((s) => s.openSchedules);
  const githubActionsOpen = usePanelStore((s) => s.githubActionsContext !== null);
  const settingsOpen = usePanelStore((s) => s.settingsOpen || s.mobileUtilityPage === "settings");
  const settingsSection = usePanelStore((s) => s.settingsSection ?? s.activeSettingsSection);
  const settingsDestinations = useSettingsShortcutDestinations();

  const sidebarShortcutsById = new Map<
    SidebarShortcutEntry["id"],
    Omit<SidebarShortcutEntry, "isActive" | "isVisible">
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
  for (const destination of settingsDestinations) {
    const id = `settings:${destination.id}` as const;
    sidebarShortcutsById.set(id, {
      id,
      icon: destination.icon,
      label: destination.label,
      onPress: () => usePanelStore.getState().openSettingsSection(destination.id),
    });
  }

  const order = includeHidden
    ? [...new Set([...sidebarShortcutOrder, ...sidebarShortcutsById.keys()])]
    : sidebarShortcutOrder;
  return order
    .map((id) => sidebarShortcutsById.get(id))
    .filter(
      (shortcut): shortcut is NonNullable<typeof shortcut> =>
        shortcut !== undefined && (includeHidden || !sidebarHiddenShortcuts.includes(shortcut.id)),
    )
    .map((shortcut) => ({
      ...shortcut,
      isVisible:
        sidebarShortcutOrder.includes(shortcut.id) && !sidebarHiddenShortcuts.includes(shortcut.id),
      isActive: shortcut.id.startsWith("settings:")
        ? settingsOpen && shortcut.id === `settings:${settingsSection}`
        : !settingsOpen &&
          (shortcut.id === "githubActions" ? githubActionsOpen : appView.kind === shortcut.id),
    }));
}
