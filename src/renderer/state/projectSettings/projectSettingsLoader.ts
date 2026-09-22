import { msg } from "@lingui/core/macro";
import type { McpServer, Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import type { RemoteProjectSettings } from "@/shared/remote/protocol";
import { i18n } from "@/renderer/i18n/i18n";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
  type ManagedLoopbackActivationSnapshot,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import {
  isManagedRootDesktopRuntime,
  managedRootOfflineError,
} from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { isManagedRootRow } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/**
 * Authoritative project MCP-settings access.
 *
 * The bulk catalog shapes intentionally omit `mcpServers` (`remoteProjectSchema`
 * keeps sensitive settings behind the private `project-settings` endpoint), so
 * a paired mirror row or a managed-root row starts with its settings "not
 * loaded": `project.mcpServers === undefined` must never be read as
 * "configured empty". This module is the ONE place that resolves a project's
 * settings owner (paired mirror → paired client, managed-root row → the
 * managed loopback client, everything else is already local-authoritative),
 * fetches through the existing endpoint, and applies the redacted projection
 * under a fence.
 *
 * Each resident project has one settings entry. Its object identity fences
 * removal/re-creation, while its captured owner fences reconnects. Response
 * ordering belongs to that entry, never to unrelated projects. Public catalog
 * refreshes may replace row objects without retiring their settings entry.
 */

type SettingsOwner =
  | { readonly kind: "local" }
  | {
      readonly kind: "remote";
      readonly desktopId: string;
      readonly remoteId: string;
      /** `currentRemoteServerGeneration` at request time; fences reconnects. */
      readonly generation: number;
    }
  | {
      readonly kind: "root";
      readonly remoteId: string;
      readonly activation: ManagedLoopbackActivationSnapshot | null;
    };

interface SettingsEntry {
  readonly owner: SettingsOwner;
  loaded: boolean;
  nextReadSeq: number;
  lastAppliedReadSeq: number;
  pending: Promise<void> | undefined;
}

// One entry per resident project, replaced (not accumulated) on owner changes.
const entries = new Map<string, SettingsEntry>();
let observingOwners = false;

function ensureOwnerObservers(): void {
  if (observingOwners) return;
  observingOwners = true;
  subscribeManagedLoopbackActivation(() => {
    for (const [id, entry] of entries) {
      if (entry.owner.kind === "root") entries.delete(id);
    }
  });
  useAppStore.subscribe((state, previous) => {
    if (state.projects === previous.projects || entries.size === 0) return;
    const projects = new Map(state.projects.map((project) => [project.id, project]));
    for (const [id, entry] of entries) {
      const project = projects.get(id);
      if (!project || !sameOwner(entry.owner, resolveSettingsOwner(project))) entries.delete(id);
    }
  });
}

function resolveSettingsOwner(project: Project): SettingsOwner {
  // The Home row has no MCP settings surface of its own; keeping it out of the
  // fetch paths also keeps its synthetic pre-host row away from the endpoint.
  if (isHomeProject(project)) return { kind: "local" };
  const owner = remoteOwner(project);
  if (owner) {
    return {
      kind: "remote",
      desktopId: owner.desktopId,
      remoteId: owner.remoteId,
      generation: currentRemoteServerGeneration(owner.desktopId),
    };
  }
  if (isManagedRootRow(project) && isManagedRootDesktopRuntime()) {
    return { kind: "root", remoteId: project.id, activation: readManagedLoopbackActivation() };
  }
  return { kind: "local" };
}

function sameOwner(left: SettingsOwner, right: SettingsOwner): boolean {
  if (left.kind === "remote" && right.kind === "remote") {
    return (
      left.desktopId === right.desktopId &&
      left.remoteId === right.remoteId &&
      left.generation === right.generation
    );
  }
  if (left.kind === "root" && right.kind === "root") {
    return left.remoteId === right.remoteId && left.activation === right.activation;
  }
  return left.kind === "local" && right.kind === "local";
}

function entryFor(project: Project, owner: SettingsOwner): SettingsEntry {
  ensureOwnerObservers();
  const existing = entries.get(project.id);
  if (existing && sameOwner(existing.owner, owner)) return existing;
  const entry: SettingsEntry = {
    owner,
    loaded: false,
    nextReadSeq: 0,
    lastAppliedReadSeq: -1,
    pending: undefined,
  };
  entries.set(project.id, entry);
  return entry;
}

function currentEntryRow(projectId: string, entry: SettingsEntry): Project | undefined {
  if (entries.get(projectId) !== entry) return undefined;
  if (entry.owner.kind === "root" && !entry.owner.activation) return undefined;
  const row = useAppStore.getState().projects.find((project) => project.id === projectId);
  return row && sameOwner(entry.owner, resolveSettingsOwner(row)) ? row : undefined;
}

function fetchOwnerSettings(owner: SettingsOwner): Promise<RemoteProjectSettings> {
  if (owner.kind === "remote") {
    return useRemoteServersStore
      .getState()
      .withClient(owner.desktopId, (client) => client.projectSettings(owner.remoteId));
  }
  // Always a rejected promise, never a synchronous throw: fire-and-forget
  // callers hang `.catch` off the returned promise, which a throw here would
  // escape entirely.
  if (owner.kind !== "root" || !owner.activation) return Promise.reject(managedRootOfflineError());
  return owner.activation.client.projectSettings(owner.remoteId);
}

function applySettings(
  projectId: string,
  entry: SettingsEntry,
  mcpServers: readonly McpServer[],
): boolean {
  const row = currentEntryRow(projectId, entry);
  if (!row) return false;
  if (mcpServers.length > 0 || row.mcpServers !== undefined) {
    useAppStore.getState().updateProjectMcpServers(projectId, [...mcpServers]);
  }
  // A synchronous store subscriber may itself retire the row/owner.
  if (!currentEntryRow(projectId, entry)) return false;
  entry.loaded = true;
  return true;
}

/**
 * True once the row's private settings are known from the authoritative
 * endpoint (or need no fetch at all). A row with `mcpServers === undefined`
 * that is NOT loaded yet is "unknown", never "empty".
 */
export function isProjectMcpServersLoaded(project: Project): boolean {
  const owner = resolveSettingsOwner(project);
  if (owner.kind === "local") return true;
  if (owner.kind === "root" && !owner.activation) return false;
  const entry = entries.get(project.id);
  return (
    entry?.loaded === true &&
    sameOwner(owner, entry.owner) &&
    currentEntryRow(project.id, entry) !== undefined
  );
}

/**
 * One endpoint read, applied under the request-time fence. Returns false when
 * the response fenced out (nothing changed, marker unset); returns true when
 * the read is satisfied — applied, or superseded by a newer read that already
 * painted (an earlier read must never paint over a later one's result).
 */
async function readAndApply(projectId: string, entry: SettingsEntry): Promise<boolean> {
  const readSeq = entry.nextReadSeq++;
  const settings = await fetchOwnerSettings(entry.owner);
  if (!currentEntryRow(projectId, entry)) return false;
  if (readSeq < entry.lastAppliedReadSeq) return entry.loaded;
  if (!applySettings(projectId, entry, settings.mcpServers ?? [])) return false;
  entry.lastAppliedReadSeq = readSeq;
  return true;
}

/**
 * Read the project's private settings through the authoritative endpoint once,
 * coalescing concurrent needs per owner. Resolves as a no-op when the fetched
 * response fenced out (the next need re-reads); rejects when the endpoint is
 * unreachable or refuses, leaving the row and the loaded marker untouched.
 *
 * This is the DISPLAY cache path: once loaded, it trusts its marker. Commit
 * paths (import, add, move) must use `loadAuthoritativeProjectMcpServers`,
 * which re-reads the endpoint every time — trusting this cache there would let
 * an absolute-list write clobber another client's change made after the first
 * load.
 */
export function ensureProjectMcpServersLoaded(projectId: string): Promise<void> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) return Promise.reject(refusalError());
  const owner = resolveSettingsOwner(project);
  if (owner.kind === "local") return Promise.resolve();
  const entry = entryFor(project, owner);
  if (entry.loaded) return Promise.resolve();
  if (entry.pending) return entry.pending;
  const load = readAndApply(projectId, entry)
    .then(() => undefined)
    .finally(() => {
      if (entry.pending === load) entry.pending = undefined;
    });
  entry.pending = load;
  return load;
}

/**
 * The row's settings after a FRESH authoritative read — never the coalesced
 * display cache: a commit path must see the configuration as it is right now,
 * or it writes an absolute list over another client's post-load change.
 * Rejects instead of guessing: a caller that cannot verify the current
 * configuration must not commit an absolute server list over it.
 */
export async function loadAuthoritativeProjectMcpServers(projectId: string): Promise<McpServer[]> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) throw refusalError();
  const owner = resolveSettingsOwner(project);
  if (owner.kind === "local") return project.mcpServers ?? [];
  const entry = entryFor(project, owner);
  if (!(await readAndApply(projectId, entry))) throw refusalError();
  const row = currentEntryRow(projectId, entry);
  if (!row) throw refusalError();
  return row.mcpServers ?? [];
}

function refusalError(): Error {
  return new Error(
    i18n._(msg`Couldn't load this project's MCP server settings, so the change was not saved.`),
  );
}

/** Test seam: retire all entries, including any in-flight reads. */
export function __resetProjectSettingsLoaderForTest(): void {
  entries.clear();
}
