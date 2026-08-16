import { useEffect, useLayoutEffect, useRef } from "react";
import {
  usePanelStore,
  type GitHubActionsContext,
  type MobileUtilityPage,
} from "@/renderer/state/panelStore";

const HISTORY_KEY = "__poracodeMobilePage";

const MOBILE_PAGES = new Set<MobileUtilityPage>([
  "profile",
  "usage",
  "projects",
  "browser",
  "ports",
  "notes",
  "workspace",
  "pullRequests",
  "schedules",
  "githubActions",
  "projectSettings",
  "settings",
]);

interface MobileHistoryEntry {
  readonly page: MobileUtilityPage;
  readonly settingsSection?: string;
  readonly githubActionsContext?: GitHubActionsContext;
  readonly projectSettingsId?: string;
}

function readHistoryObject(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return state !== null && typeof state === "object" ? (state as Record<string, unknown>) : {};
}

function readHistoryEntry(): MobileHistoryEntry | null {
  const candidate = readHistoryObject()[HISTORY_KEY];
  if (candidate === null || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.page !== "string" || !MOBILE_PAGES.has(record.page as MobileUtilityPage)) {
    return null;
  }

  const page = record.page as MobileUtilityPage;
  const settingsSection =
    typeof record.settingsSection === "string" ? record.settingsSection : undefined;
  const githubCandidate = record.githubActionsContext;
  const githubActionsContext =
    githubCandidate !== null && typeof githubCandidate === "object"
      ? (githubCandidate as GitHubActionsContext)
      : undefined;
  const projectSettingsId =
    typeof record.projectSettingsId === "string" ? record.projectSettingsId : undefined;

  if (page === "projectSettings" && projectSettingsId === undefined) return null;

  return {
    page,
    ...(settingsSection !== undefined ? { settingsSection } : {}),
    ...(githubActionsContext !== undefined ? { githubActionsContext } : {}),
    ...(projectSettingsId !== undefined ? { projectSettingsId } : {}),
  };
}

/**
 * Traverse away from the current compact page without clearing it first.
 * Clearing the store before calling Back briefly renders Home and can lose the
 * page-to-page return target (for example Usage -> Settings -> Usage).
 */
export function navigateBackMobilePage(): boolean {
  if (readHistoryEntry() === null) return false;
  window.history.back();
  return true;
}

function applyHistoryEntry(entry: MobileHistoryEntry | null): void {
  const state = usePanelStore.getState();
  usePanelStore.setState({
    mobileUtilityPage: entry?.page ?? null,
    settingsOpen: false,
    settingsSection: entry?.page === "settings" ? (entry.settingsSection ?? null) : null,
    githubActionsContext:
      entry?.page === "githubActions"
        ? (entry.githubActionsContext ?? state.githubActionsContext)
        : null,
    projectSettingsId: entry?.page === "projectSettings" ? (entry.projectSettingsId ?? null) : null,
  });
}

function buildHistoryEntry(
  page: MobileUtilityPage,
  settingsSection: string | null,
  githubActionsContext: GitHubActionsContext | null,
  projectSettingsId: string | null,
): MobileHistoryEntry {
  return {
    page,
    ...(page === "settings" && settingsSection !== null ? { settingsSection } : {}),
    ...(page === "githubActions" && githubActionsContext !== null ? { githubActionsContext } : {}),
    ...(page === "projectSettings" && projectSettingsId !== null ? { projectSettingsId } : {}),
  };
}

/**
 * Gives compact PWA pages native-feeling Back/Forward and reload semantics
 * without adding a URL router to the shared Electron renderer.
 */
export function useMobilePageHistory(compactLayout: boolean): void {
  const page = usePanelStore((state) => state.mobileUtilityPage);
  const settingsSection = usePanelStore((state) => state.settingsSection);
  const githubActionsContext = usePanelStore((state) => state.githubActionsContext);
  const projectSettingsId = usePanelStore((state) => state.projectSettingsId);
  const applyingHistoryRef = useRef(false);
  const previousPageRef = useRef<MobileUtilityPage | null>(page);

  useLayoutEffect(() => {
    if (!compactLayout) return;
    const entry = readHistoryEntry();
    if (entry === null) return;
    applyingHistoryRef.current = true;
    previousPageRef.current = entry.page;
    applyHistoryEntry(entry);
  }, [compactLayout]);

  useEffect(() => {
    if (!compactLayout) return;
    const onPopState = () => {
      const entry = readHistoryEntry();
      applyingHistoryRef.current = true;
      previousPageRef.current = entry?.page ?? null;
      applyHistoryEntry(entry);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [compactLayout]);

  useEffect(() => {
    if (!compactLayout) {
      if (page !== null) usePanelStore.setState({ mobileUtilityPage: null });
      return;
    }

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      previousPageRef.current = page;
      return;
    }

    const previousPage = previousPageRef.current;
    if (page === previousPage) return;
    previousPageRef.current = page;

    if (page !== null) {
      window.history.pushState(
        {
          ...readHistoryObject(),
          [HISTORY_KEY]: buildHistoryEntry(
            page,
            settingsSection,
            githubActionsContext,
            projectSettingsId,
          ),
        },
        "",
      );
      return;
    }

    if (previousPage !== null && readHistoryEntry() !== null) {
      window.history.back();
    }
  }, [compactLayout, githubActionsContext, page, projectSettingsId, settingsSection]);
}
