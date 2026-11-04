import type { Project, Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { getManagedParentAuthorityState } from "@/renderer/state/remoteServers/managedLoopbackOwner";
import {
  visibleCatalogProjects,
  confirmProjectRemoval,
  pendingProjectRemovalRows,
} from "@/renderer/state/projectRemovalIntents";
import { finalizeProjectRemoval } from "../projectRemovalPresentation";
import { applyProjectStateSnapshot } from "@/renderer/state/projectStateSync";
import { reuseRemoteRows } from "@/renderer/state/remoteServers/rowReuse";
import { closePanesForHostArchivedRows, mergeHostThreadRow } from "../hostThreadRowMerge";
import { removeConfirmedHostThread } from "../hostThreadRowRemoval";
import { orderHostRows } from "../hostCatalogRowOrder";
import { retainPendingThreadConfigs } from "../pendingThreadConfig";
import { projectPendingCatalogEdit, forgetPendingCatalogEdit } from "../pendingCatalogEdits";

/**
 * Root catalog rows are the desktop's OWN entities: unprojected ids, no
 * `remoteServerId`. They live in the same app-store arrays as local rows, so
 * every merge here preserves non-root rows untouched and replaces only the
 * root ids the page carried. Membership is never a delete: removal happens
 * exclusively through the controller's confirmation-gated deletion pass.
 */

export function isManagedRootRow(entity: {
  readonly remoteServerId?: string | undefined;
}): boolean {
  return entity.remoteServerId === undefined;
}

/**
 * The renderer's synthetic Home project row is a UI entry, not a host
 * membership fact: on a fresh install the host DB has no Home row yet, so the
 * catalog's confirmation-gated deletion pass would remove the user's Home
 * entry. Home is therefore excluded from the root catalog's runtime list (and
 * from removal) until the host persists its canonical Home row through the
 * existing helper. The host row, once present, is still applied normally.
 */
export function isRendererSyntheticHomeProject(project: Project): boolean {
  return isHomeProjectId(project.id);
}

/**
 * Host rows are durable truth, so a page keeps the host's status/attention
 * (boot normalization is host-owned). Only structural defaults are filled in,
 * matching what the store expects of any resident row.
 */
export function normalizeRootCatalogThread(thread: Thread): Thread {
  const normalized: Thread = {
    ...thread,
    done: thread.done ?? false,
  };
  if (normalized.archived && !normalized.archivedAt) {
    normalized.archivedAt = normalized.updatedAt;
  }
  if (normalized.done && !normalized.doneAt) {
    normalized.doneAt = normalized.updatedAt;
  }
  return normalized;
}

export function normalizeRootCatalogProject(project: Project): Project {
  return project;
}

/**
 * The current root thread rows, memoized by the app-store array so the
 * controller's per-page merge does not rebuild a 10k-row filter on every
 * continuation and the commit fast path can compare array identity.
 */
let cachedThreadsSource: readonly Thread[] | null = null;
let cachedRootThreads: Thread[] = [];

export function readRootCatalogThreads(): Thread[] {
  const threads = useAppStore.getState().threads;
  if (cachedThreadsSource !== threads) {
    cachedThreadsSource = threads;
    cachedRootThreads = threads.filter(isManagedRootRow);
  }
  return cachedRootThreads;
}

let cachedProjectsSource: readonly Project[] | null = null;
let cachedRootProjects: Project[] = [];

export function readRootCatalogProjects(): Project[] {
  const projects = useAppStore.getState().projects;
  if (cachedProjectsSource !== projects) {
    cachedProjectsSource = projects;
    cachedRootProjects = projects.filter(
      (project) => isManagedRootRow(project) && !isRendererSyntheticHomeProject(project),
    );
  }
  return cachedRootProjects;
}

/**
 * Merge one page/continuation into the app store. `preserveThreadIds` names
 * rows a live event newer than the page already updated: the existing row
 * object (with its newer status/attention) wins over the page copy. A page
 * row is host-durable state, so when it omits the volatile
 * `sessionConfigOptions` inventory the resident one is re-attached instead of
 * erased — same owner/session only, per `carryVolatileSessionConfigOptions`.
 */
export function applyRootCatalogThreadRows(
  rows: readonly Thread[],
  preserveThreadIds: ReadonlySet<string>,
): void {
  if (rows.length === 0) return;
  const archivedNow = new Set<string>();
  useAppStore.setState((state) => {
    const incomingById = new Map<string, Thread>();
    for (const row of rows) {
      if (preserveThreadIds.has(row.id)) continue;
      incomingById.set(
        row.id,
        projectPendingCatalogEdit("thread", normalizeRootCatalogThread(row)),
      );
    }
    let changed = false;
    const existingIds = new Set<string>();
    const next = state.threads.map((existing) => {
      if (!isManagedRootRow(existing)) return existing;
      existingIds.add(existing.id);
      const incoming = incomingById.get(existing.id);
      if (!incoming) return existing;
      incomingById.delete(existing.id);
      if (incoming === existing) return existing;
      // Host housekeeping archives rows without a forwarded user command: the
      // documented startup policy closes the archived thread's visible pane.
      if (!existing.archived && incoming.archived) archivedNow.add(existing.id);
      changed = true;
      return mergeHostThreadRow(
        existing,
        incoming,
        state.pendingThreadConfigByThreadId[existing.id],
      );
    });
    for (const row of rows) {
      const incoming = incomingById.get(row.id);
      if (!incoming || existingIds.has(row.id)) continue;
      incomingById.delete(row.id);
      changed = true;
      next.push(incoming);
    }
    if (!changed) return state;
    return {
      threads: next,
      pendingThreadConfigByThreadId: retainPendingThreadConfigs(
        state.pendingThreadConfigByThreadId,
        next,
      ),
    };
  });
  syncRootRuntimeConfigs(rows, preserveThreadIds);
  closePanesForHostArchivedRows(archivedNow);
}

export function applyRootCatalogProjectRows(rows: readonly Project[]): void {
  if (rows.length === 0) return;
  rows = visibleCatalogProjects(rows);
  useAppStore.setState((state) => {
    const incomingById = new Map(
      rows.map((row) => [
        row.id,
        projectPendingCatalogEdit("project", normalizeRootCatalogProject(row)),
      ]),
    );
    let changed = false;
    const existingIds = new Set<string>();
    const next = state.projects.map((existing) => {
      if (!isManagedRootRow(existing)) return existing;
      existingIds.add(existing.id);
      const incoming = incomingById.get(existing.id);
      if (!incoming) return existing;
      incomingById.delete(existing.id);
      if (incoming === existing) return existing;
      // Catalog rows never carry `mcpServers` (private settings ride the
      // project-settings endpoint), so a catalog-only refresh must re-attach
      // the row's already-loaded projection — the mirrored-rows rule in
      // `syncRemoteAppRows`. Without the carry, every pass would erase it.
      changed = true;
      return existing.mcpServers === undefined
        ? incoming
        : { ...incoming, mcpServers: existing.mcpServers };
    });
    for (const row of rows) {
      const incoming = incomingById.get(row.id);
      if (!incoming || existingIds.has(row.id)) continue;
      changed = true;
      next.push(incoming);
    }
    if (!changed) return state;
    return { projects: next };
  });
}

/**
 * Confirmation-gated host-origin removal: never a user command. An
 * authoritative removal also evicts the removed threads' durable notices and
 * any remaining local surface (an open pane, a pending create+launch intent).
 */
export function removeRootCatalogThreads(threadIds: readonly string[]): void {
  if (threadIds.length === 0) return;
  const parent = getManagedParentAuthorityState();
  const visualHostId = parent.status === "ready" ? parent.authority.ref.hostDesktopId : undefined;
  for (const threadId of threadIds) {
    const row = useAppStore.getState().threads.find((thread) => thread.id === threadId);
    if (row && !isManagedRootRow(row)) continue;
    removeConfirmedHostThread({ viewThreadId: threadId, hostThreadId: threadId, visualHostId });
  }
}

export function removeRootCatalogProjects(projectIds: readonly string[]): void {
  if (projectIds.length === 0) return;
  // Never a user command, and never the renderer's synthetic Home entry: the
  // host does not own it until its canonical row is persisted (host
  // prerequisite), so a membership answer saying "absent" is expected.
  const removed = new Set(projectIds.filter((projectId) => !isHomeProjectId(projectId)));
  for (const project of pendingProjectRemovalRows()) {
    if (isManagedRootRow(project) && removed.has(project.id)) finalizeProjectRemoval(project.id);
  }
  for (const projectId of removed) confirmProjectRemoval(projectId);
  for (const projectId of removed) forgetPendingCatalogEdit("project", projectId);
  if (removed.size === 0) return;
  const currentProjects = useAppStore.getState().projects;
  const projects = currentProjects.filter(
    (project) => !isManagedRootRow(project) || !removed.has(project.id),
  );
  if (projects.length === currentProjects.length) return;
  // A repaired duplicate may have been removed by the host's migration or a
  // completed membership walk. Move live drafts, panes and experiments to the
  // surviving project before the stale row leaves the renderer projection.
  applyProjectStateSnapshot(projects);
}

/**
 * `lastRuntimeConfigByThreadId` derives from resident rows; a page install can
 * replace rows. Record their confirmed config, never the carried local intent.
 */
function syncRootRuntimeConfigs(
  rows: readonly Thread[],
  preserveThreadIds: ReadonlySet<string>,
): void {
  useAppStore.setState((state) => {
    let changed = false;
    const next = { ...state.lastRuntimeConfigByThreadId };
    for (const thread of rows) {
      if (preserveThreadIds.has(thread.id)) continue;
      if (next[thread.id] === thread.config) continue;
      next[thread.id] = thread.config;
      changed = true;
    }
    if (!changed) return state;
    return { lastRuntimeConfigByThreadId: next };
  });
}

/**
 * Reorder resident root rows to the incoming authoritative id order (a manual
 * page). Root ids not named by the page follow in their previous relative
 * order; non-root rows keep their slots.
 */
export function applyRootCatalogOrder(orderedIds: readonly string[]): void {
  useAppStore.setState((state) => {
    const threads = orderHostRows(state.threads, isManagedRootRow, orderedIds);
    return threads === state.threads ? state : { threads: [...threads] };
  });
}

/**
 * Reorder resident root projects to the incoming authoritative id order (a
 * manual page). Root ids not named by the page follow in their previous
 * relative order; non-root rows keep their slots.
 */
export function applyRootCatalogProjectOrder(orderedIds: readonly string[]): void {
  useAppStore.setState((state) => {
    const projects = orderHostRows(state.projects, isManagedRootRow, orderedIds);
    return projects === state.projects ? state : { projects: [...projects] };
  });
}

/** Pure helper for tests: keep the incoming row when content is unchanged. */
export function reuseRootCatalogRows(
  current: readonly Thread[],
  incoming: readonly Thread[],
): Thread[] {
  return reuseRemoteRows([...current], [...incoming]);
}

/** Test seam: forget memoized root row views. */
export function __resetRootCatalogRowsForTest(): void {
  cachedThreadsSource = null;
  cachedRootThreads = [];
  cachedProjectsSource = null;
  cachedRootProjects = [];
}
