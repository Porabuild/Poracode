import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_WORKSPACE_ICONS,
  DEFAULT_WORKSPACE_NAMES,
  type Workspace,
} from "@/shared/contracts";
import { useAppStore } from "./appStore";
import { useSharedSettings, whenSharedSettingsHydrated } from "./sharedSettingsStore";

const PERSIST_KEY = "poracode-active-workspace";

interface WorkspaceUiState {
  /**
   * Which workspace this window is looking at. Deliberately *not* part of
   * `sharedSettings`, which is a single file shared by every window on the
   * device — switching in one window must not yank the others along with it.
   */
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceUiState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * The workspace actually in effect: the stored id when it still resolves,
 * otherwise the first workspace. A stale id (workspace deleted on another
 * device) must not blank the sidebar.
 */
export function resolveActiveWorkspaceId(
  workspaces: readonly { id: string }[],
  storedId: string | null,
): string | null {
  if (workspaces.length === 0) return null;
  if (storedId && workspaces.some((workspace) => workspace.id === storedId)) return storedId;
  return workspaces[0]!.id;
}

export function useActiveWorkspaceId(): string | null {
  const workspaces = useSharedSettings((state) => state.workspaces);
  const storedId = useWorkspaceStore((state) => state.activeWorkspaceId);
  return resolveActiveWorkspaceId(workspaces, storedId);
}

export function getActiveWorkspaceId(): string | null {
  return resolveActiveWorkspaceId(
    // `?? []` guards partially-stubbed stores in tests; production settings
    // always carry the key via `defaultSharedSettings`.
    useSharedSettings.getState().workspaces ?? [],
    useWorkspaceStore.getState().activeWorkspaceId,
  );
}

/**
 * Seed the default workspaces on first run and file every pre-existing project
 * into the first one, so an install that predates workspaces opens showing
 * exactly what it showed before.
 *
 * Idempotent: does nothing once any workspace exists.
 */
export async function bootstrapWorkspaces(): Promise<void> {
  await whenSharedSettingsHydrated();
  const settings = useSharedSettings.getState();
  const existing = settings.workspaces ?? [];
  if (existing.length > 0) {
    // Already seeded. Still make sure this window points somewhere real.
    const resolved = resolveActiveWorkspaceId(
      existing,
      useWorkspaceStore.getState().activeWorkspaceId,
    );
    if (resolved !== useWorkspaceStore.getState().activeWorkspaceId) {
      useWorkspaceStore.getState().setActiveWorkspaceId(resolved);
    }
    return;
  }

  // Seed in a single write: every `addWorkspace` call would serialize the whole
  // settings object to localStorage and fire its own IPC write.
  const createdAt = new Date().toISOString();
  const seeded: Workspace[] = DEFAULT_WORKSPACE_NAMES.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    createdAt,
    icon: DEFAULT_WORKSPACE_ICONS[index]!,
  }));
  settings.setWorkspaces(seeded);

  const primary = seeded[0]!;
  useAppStore.getState().refileProjects(undefined, primary.id);
  useWorkspaceStore.getState().setActiveWorkspaceId(primary.id);
}
