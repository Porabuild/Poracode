import type { Project, Thread } from "@/shared/contracts";
import type { AppView } from "@/shared/contracts/appView";
import { isHomeProjectId } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { clearThreadHistoryNotice } from "@/renderer/state/remote/historyNoticeStore";
import { reuseRemoteRows } from "@/renderer/state/remoteServers/rowReuse";
import { removePaneFromView } from "@/renderer/state/slices/helpers";
import { dropPendingManagedRootLaunch } from "./rootCatalogStore";

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
 * object (with its newer status/attention) wins over the page copy.
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
      incomingById.set(row.id, normalizeRootCatalogThread(row));
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
      return incoming;
    });
    for (const row of rows) {
      const incoming = incomingById.get(row.id);
      if (!incoming || existingIds.has(row.id)) continue;
      incomingById.delete(row.id);
      changed = true;
      next.push(incoming);
    }
    if (!changed) return state;
    return { threads: next };
  });
  syncRootRuntimeConfigs();
  if (archivedNow.size > 0) closePanesForArchivedRootRows(archivedNow);
}

/**
 * Client projection effect for a host-archived root row: drop its visible
 * pane (the documented auto-archive behavior), never a durable write.
 */
function closePanesForArchivedRootRows(threadIds: ReadonlySet<string>): void {
  useAppStore.setState((state) => {
    if (state.view.kind !== "thread") return state;
    let nextView: AppView = state.view;
    for (const threadId of threadIds) {
      if (nextView.kind === "thread" && nextView.panes.includes(threadId)) {
        nextView = removePaneFromView(nextView, threadId);
      }
    }
    return nextView === state.view ? state : { view: nextView };
  });
}

export function applyRootCatalogProjectRows(rows: readonly Project[]): void {
  if (rows.length === 0) return;
  useAppStore.setState((state) => {
    const incomingById = new Map(rows.map((row) => [row.id, normalizeRootCatalogProject(row)]));
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
  const removed = new Set(threadIds);
  useAppStore.setState((state) => {
    const threads = state.threads.filter(
      (thread) => !isManagedRootRow(thread) || !removed.has(thread.id),
    );
    if (threads.length === state.threads.length) return state;
    return { threads };
  });
  const view = useAppStore.getState().view;
  for (const threadId of removed) {
    dropPendingManagedRootLaunch(threadId);
    clearThreadHistoryNotice(threadId);
    if (view.kind === "thread" && view.panes.includes(threadId)) {
      useAppStore.getState().closePane(threadId);
    }
  }
}

export function removeRootCatalogProjects(projectIds: readonly string[]): void {
  if (projectIds.length === 0) return;
  // Never a user command, and never the renderer's synthetic Home entry: the
  // host does not own it until its canonical row is persisted (host
  // prerequisite), so a membership answer saying "absent" is expected.
  const removed = new Set(projectIds.filter((projectId) => !isHomeProjectId(projectId)));
  if (removed.size === 0) return;
  useAppStore.setState((state) => {
    const projects = state.projects.filter(
      (project) => !isManagedRootRow(project) || !removed.has(project.id),
    );
    if (projects.length === state.projects.length) return state;
    return { projects };
  });
}

/**
 * `lastRuntimeConfigByThreadId` derives from resident rows; a page install can
 * add rows, so the derived map is rebuilt only when a root row was added.
 */
function syncRootRuntimeConfigs(): void {
  useAppStore.setState((state) => {
    let changed = false;
    const next = { ...state.lastRuntimeConfigByThreadId };
    for (const thread of state.threads) {
      if (!isManagedRootRow(thread)) continue;
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
  if (orderedIds.length === 0) return;
  useAppStore.setState((state) => {
    const rootRows = state.threads.filter(isManagedRootRow);
    if (rootRows.length < 2) return state;
    const byId = new Map(rootRows.map((row) => [row.id, row]));
    const named = new Set<string>();
    const nextRoot: Thread[] = [];
    for (const id of orderedIds) {
      const row = byId.get(id);
      if (!row || named.has(id)) continue;
      named.add(id);
      nextRoot.push(row);
    }
    for (const row of rootRows) {
      if (!named.has(row.id)) nextRoot.push(row);
    }
    let changed = false;
    let cursor = 0;
    const next = state.threads.map((row) => {
      if (!isManagedRootRow(row)) return row;
      const replacement = nextRoot[cursor++]!;
      if (replacement !== row) changed = true;
      return replacement;
    });
    if (!changed) return state;
    return { threads: next };
  });
}

/**
 * Reorder resident root projects to the incoming authoritative id order (a
 * manual page). Root ids not named by the page follow in their previous
 * relative order; non-root rows keep their slots.
 */
export function applyRootCatalogProjectOrder(orderedIds: readonly string[]): void {
  if (orderedIds.length === 0) return;
  useAppStore.setState((state) => {
    const rootRows = state.projects.filter(isManagedRootRow);
    if (rootRows.length < 2) return state;
    const byId = new Map(rootRows.map((row) => [row.id, row]));
    const named = new Set<string>();
    const nextRoot: Project[] = [];
    for (const id of orderedIds) {
      const row = byId.get(id);
      if (!row || named.has(id)) continue;
      named.add(id);
      nextRoot.push(row);
    }
    for (const row of rootRows) {
      if (!named.has(row.id)) nextRoot.push(row);
    }
    let changed = false;
    let cursor = 0;
    const next = state.projects.map((row) => {
      if (!isManagedRootRow(row)) return row;
      const replacement = nextRoot[cursor++]!;
      if (replacement !== row) changed = true;
      return replacement;
    });
    if (!changed) return state;
    return { projects: next };
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
