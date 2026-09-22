import { randomUUID } from "node:crypto";
import { basename, posix, win32 } from "node:path";
import type {
  CloneRepoSource,
  McpServer,
  Project,
  ProjectDraftConfig,
  ProjectLocation,
} from "@/shared/contracts";
import type { CatalogReorderPlacement } from "@/shared/catalogOrder";
import {
  buildScratchTargetPath,
  deriveLocationFromPath,
  validateProjectName,
} from "@/shared/createProject";
import type {
  RemoteProjectCommand,
  RemoteProjectCommandResponse,
  RemoteProjectCommandResult,
} from "@/shared/remote";
import { msg } from "@/shared/messages";
import { parseProjectIcon } from "@/shared/projectIcon";
import { parseWslUncPath } from "@/shared/wsl";
import type { DbProjectReorderOutcome, CatalogIntentCommittedSignal } from "@/host/db";
import { REDACTED_VALUE, restoreRedactedTransport } from "@/host/mcpSettings";
import { RemoteHttpError } from "./auth";

/**
 * Dependencies for {@link applyRemoteProjectCommand}, injected so the handler
 * stays pure and unit-testable (no DB, no filesystem, no supervisor).
 */
export interface RemoteProjectCommandDeps {
  /** Complete catalog read. Legacy `complete` mode and consumers that need the
   *  authoritative full list call this; the bounded mode never does. */
  getProjects(): Project[];
  getProject(projectId: string): Project | null;
  /**
   * Acquire the shared in-process project-removal guard for the ENTIRE removal
   * span (experiment cleanup awaits, thread-close awaits, and the cascade) and
   * return the idempotent release. While held, experiment intents refuse new
   * same-project mutations, and experiment worktree preparation is refused and
   * drained, so no delayed preparation can outlive the worktree teardown.
   */
  beginProjectRemoval(projectId: string): () => void;
  removeProjectExperiments(project: Project): Promise<void>;
  hasRunningProjectThread(projectId: string): boolean;
  /** Thread ids belonging to a project, closed best-effort before removal. */
  listProjectThreadIds(projectId: string): readonly string[];
  upsertProject(project: Project, sortOrder: number): void;
  updateProject(project: Project): void;
  deleteProject(projectId: string): void;
  /**
   * Narrow relative reorder over the host's complete project order. Only the
   * named projects move; every other row keeps its position. `onCommitted`
   * fires after the atomic write commits and before the notification fan-out.
   */
  reorderProject(
    input: {
      projectId: string;
      targetProjectId: string;
      placement: CatalogReorderPlacement;
    },
    onCommitted?: CatalogIntentCommittedSignal,
  ): DbProjectReorderOutcome;
  /** Single-column nullable workspace write; false when the row is gone. */
  setProjectWorkspace(
    projectId: string,
    workspaceId: string | null,
    onCommitted?: CatalogIntentCommittedSignal,
  ): boolean;
  /** Single-column draft-config write; false when the row is gone. */
  setProjectLastDraftConfig(
    projectId: string,
    lastDraftConfig: ProjectDraftConfig | null,
    onCommitted?: CatalogIntentCommittedSignal,
  ): boolean;
  /** Best-effort PTY/session teardown for a thread; failures are ignored. */
  closeThread(threadId: string): Promise<void>;
  /** Delegates to the supervisor's `cloneRepo` procedure. */
  cloneRepo(input: {
    parentLocation: ProjectLocation;
    name: string;
    source: CloneRepoSource;
  }): Promise<{ path: string }>;
  /** Creates a single directory; throws if it already exists (non-recursive). */
  makeDirectory(path: string): void;
  /** Host platform — derives the platform-specific {@link ProjectLocation}. */
  readonly platform: NodeJS.Platform;
  /** ISO-timestamp source, injected for deterministic ordering in tests. */
  now(): string;
}

/**
 * Post-command state handed to the HTTP route. Legacy kinds return the
 * authoritative full project list (used for the `remote-projects-changed`
 * broadcast and the embedding mirror); bounded catalog kinds deliberately
 * return ONLY the bounded response, so a bounded-only mutation never forces a
 * catalog read.
 */
export type RemoteProjectCommandApplication =
  | {
      readonly kind: "complete";
      readonly projects: readonly Project[];
      readonly response: RemoteProjectCommandResult;
    }
  | {
      readonly kind: "bounded";
      readonly response: RemoteProjectCommandResponse;
    };

/**
 * Per-request execution options for {@link applyRemoteProjectCommand}.
 *
 * `resultMode` is the wire-declared response contract: `complete` (the
 * historical default) materializes the authoritative full project list for the
 * response; `bounded` returns only the acknowledgement plus the affected row
 * (for registration id mapping) and never reads an unrelated project row.
 *
 * `onEffectBoundary` fires at the command's true effect boundary — the first
 * point after which an exception means the command may already have taken
 * effect (create: after the directory exists, before registration; clone:
 * before the clone call; update/relocate/register: immediately before the row
 * write; remove: before the worktree/experiment teardown). A validation
 * refusal or a failed directory creation before that point stays a definite
 * failure. Catalog kinds keep their own post-commit signal through the DB
 * intent hooks.
 */
export interface RemoteProjectCommandOptions {
  readonly resultMode?: "complete" | "bounded";
  readonly onEffectBoundary?: () => void;
}

/** Folder name from an absolute path, used when the client omits a project name. */
function nameFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return basename(trimmed) || trimmed;
}

/**
 * Restore redaction markers in an incoming project MCP list from the stored
 * list (matched by server id). Throws when a marker survives without a stored
 * source — the same contract the MCP settings gateway enforces on upsert.
 */
function restoreProjectMcpServers(incoming: McpServer[], stored: McpServer[]): McpServer[] {
  const restored = incoming.map((server) => {
    const existing = stored.find((candidate) => candidate.id === server.id);
    return existing
      ? { ...server, transport: restoreRedactedTransport(server.transport, existing.transport) }
      : server;
  });
  if (JSON.stringify(restored).includes(REDACTED_VALUE)) {
    throw new RemoteHttpError(
      "mcp_redaction_without_existing_secret",
      "The MCP server change is invalid.",
      400,
    );
  }
  return restored;
}

function assertValidName(name: string): void {
  const error = validateProjectName(name);
  if (error) {
    throw new RemoteHttpError("invalid_project_name", msg("remote.project.invalidName"), 400);
  }
}

/**
 * Reject `..` path segments. `projects:manage` intentionally lets a paired
 * client register/create/clone projects at server paths (it's "add a project
 * from the system"), so an explicit absolute path is allowed — but a traversal
 * segment is never legitimate for a project root and only serves to disguise
 * the real target, so we forbid it. Covers posix `/`, windows `\`, and the `.`
 * directory. The server operator's trust boundary is the scope grant itself.
 */
function assertNoTraversal(path: string): void {
  const segments = path.split(/[\\/]+/);
  if (segments.includes("..")) {
    throw new RemoteHttpError("invalid_project_path", msg("remote.project.invalidPath"), 400);
  }
}

/**
 * Reject icon values that would escape the project folder when rendered. A
 * paired client can set a project's icon, and a `file:` icon resolves against
 * the project root on the desktop that displays it, so traversal or absolute
 * values from a peer are never legitimate.
 */
function assertValidIcon(icon: string): void {
  if (parseProjectIcon(icon) === undefined) {
    throw new RemoteHttpError("invalid_project_path", msg("remote.project.invalidPath"), 400);
  }
}

function assertAbsolutePath(path: string, platform: NodeJS.Platform): void {
  const isAbsolute =
    parseWslUncPath(path) !== null ||
    (platform === "win32" ? win32.isAbsolute(path) : posix.isAbsolute(path));
  if (!isAbsolute) {
    throw new RemoteHttpError("invalid_project_path", msg("remote.project.invalidPath"), 400);
  }
}

function assertValidProjectPath(path: string, platform: NodeJS.Platform): void {
  assertNoTraversal(path);
  assertAbsolutePath(path, platform);
}

/**
 * Safe git remote transports. `git clone` treats an unrecognized `foo::bar`
 * prefix as a *remote helper* (`git-remote-foo`), and the built-in `ext::`
 * helper runs an arbitrary shell command — so an unvalidated clone URL is
 * remote code execution. A leading `-` is argument injection (the URL is
 * consumed as a `git clone` flag). We allow only the ordinary network
 * transports plus scp-style `user@host:path`, and reject everything else.
 */
const SAFE_CLONE_URL_SCHEMES = new Set(["https", "http", "ssh", "git", "ftps", "ftp"]);
// scp-style shorthand: `[user@]host:path` (host has no `/` before the colon and
// the whole thing is not a `scheme://...` or `helper::...` URL).
const SCP_LIKE_URL = /^[^/\\:]+@[^/\\:]+:.+$/;

function assertSafeCloneUrl(rawUrl: string): void {
  const url = rawUrl.trim();
  const reject = (): never => {
    throw new RemoteHttpError("invalid_clone_url", msg("remote.project.invalidCloneUrl"), 400);
  };
  if (!url) {
    reject();
  }
  // Argument injection: git would parse a leading-dash URL as a flag.
  if (url.startsWith("-")) {
    reject();
  }
  // Remote-helper transports (`ext::`, `fd::`, any `<helper>::…`) run external
  // programs; `ext::` in particular executes an arbitrary shell command.
  // Reject the whole `<helper>::` family, including a bare leading `::`.
  if (/^[a-z0-9+.-]*::/i.test(url)) {
    reject();
  }
  // A `scheme://…` URL: the scheme must be an allowlisted network transport.
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
  if (schemeMatch) {
    const scheme = (schemeMatch[1] ?? "").toLowerCase();
    if (scheme === "file") {
      reject();
    }
    if (!SAFE_CLONE_URL_SCHEMES.has(scheme)) {
      reject();
    }
    return;
  }
  // A `scheme:` prefix without `//` (e.g. `file:/path`) — reject any that
  // isn't scp-style shorthand.
  const bareSchemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (bareSchemeMatch && !SCP_LIKE_URL.test(url)) {
    reject();
  }
  // Otherwise it must be scp-style `user@host:path`.
  if (!SCP_LIKE_URL.test(url)) {
    reject();
  }
}

function makeProject(location: ProjectLocation, name: string, createdAt: string): Project {
  return { id: randomUUID(), name, location, createdAt };
}

/**
 * Applies a remote project command against the DB (and, for clone, the
 * supervisor). New projects sort to the top via a descending-timestamp
 * `sortOrder`, mirroring how the server orders freshly-created threads. Returns
 * the full updated project list so the caller can answer the client and
 * broadcast a `remote-projects-changed` event without a second read.
 */
export async function applyRemoteProjectCommand(
  command: RemoteProjectCommand,
  deps: RemoteProjectCommandDeps,
  options: RemoteProjectCommandOptions = {},
): Promise<RemoteProjectCommandApplication> {
  const bounded = options.resultMode === "bounded";
  switch (command.kind) {
    case "add-existing": {
      assertValidProjectPath(command.path, deps.platform);
      const name = command.name?.trim() || nameFromPath(command.path);
      assertValidName(name);
      const location = deriveLocationFromPath(command.path, deps.platform);
      return register(deps, location, name, options);
    }
    case "create": {
      assertValidProjectPath(command.parentPath, deps.platform);
      assertValidName(command.name);
      const parentLocation = deriveLocationFromPath(command.parentPath, deps.platform);
      const targetPath = buildScratchTargetPath(
        command.parentPath,
        command.name,
        parentLocation.kind,
      );
      try {
        deps.makeDirectory(targetPath);
      } catch {
        // The directory was not created: this is a definite pre-effect refusal.
        throw new RemoteHttpError(
          "project_directory_failed",
          msg("remote.project.directoryFailed"),
          400,
        );
      }
      // The directory exists now, so from here on a failure may leave a real
      // effect behind (an unregistered directory) and must not be classified
      // as a definite failure.
      options.onEffectBoundary?.();
      const location = deriveLocationFromPath(targetPath, deps.platform);
      return register(deps, location, command.name, options);
    }
    case "clone": {
      assertValidProjectPath(command.parentPath, deps.platform);
      assertValidName(command.name);
      // A free-form clone URL reaches `git clone` directly; validate the
      // transport before we hand it to the supervisor (github sources clone
      // via `gh` from a `nameWithOwner` and carry no free URL).
      if (command.source.kind === "url") {
        assertSafeCloneUrl(command.source.url);
      }
      const parentLocation = deriveLocationFromPath(command.parentPath, deps.platform);
      // A failed clone can leave a partial checkout, so the boundary is BEFORE
      // the clone call: the effect is not blindly replayable.
      options.onEffectBoundary?.();
      const { path } = await deps.cloneRepo({
        parentLocation,
        name: command.name,
        source: command.source,
      });
      const location = deriveLocationFromPath(path, deps.platform);
      return register(deps, location, command.name, options);
    }
    case "update": {
      if (bounded) {
        // The bounded mode never reads an unrelated project row: the response
        // needs only this row, read by primary key.
        const project = deps.getProject(command.projectId);
        if (!project) {
          throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
        }
        const updated = applyProjectPatch(project, command.patch);
        options.onEffectBoundary?.();
        deps.updateProject(updated);
        return boundedResult({ ok: true, project: updated });
      }
      const projects = deps.getProjects();
      const project = projects.find((candidate) => candidate.id === command.projectId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      const updated = applyProjectPatch(project, command.patch);
      options.onEffectBoundary?.();
      deps.updateProject(updated);
      return completeResult({
        projects: projects.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        project: updated,
      });
    }
    case "relocate": {
      assertValidProjectPath(command.path, deps.platform);
      const assertRelocatable = (project: Project): void => {
        if (deps.hasRunningProjectThread(project.id)) {
          throw new RemoteHttpError(
            "project_has_running_threads",
            msg("remote.project.runningThreads"),
            409,
          );
        }
      };
      const relocate = (project: Project): Project => ({
        ...project,
        location: deriveLocationFromPath(command.path, deps.platform),
      });
      if (bounded) {
        const project = deps.getProject(command.projectId);
        if (!project) {
          throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
        }
        assertRelocatable(project);
        const updated = relocate(project);
        options.onEffectBoundary?.();
        deps.updateProject(updated);
        return boundedResult({ ok: true, project: updated });
      }
      const projects = deps.getProjects();
      const project = projects.find((candidate) => candidate.id === command.projectId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      assertRelocatable(project);
      const updated = relocate(project);
      options.onEffectBoundary?.();
      deps.updateProject(updated);
      return completeResult({
        projects: projects.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        project: updated,
      });
    }
    case "remove": {
      const project = bounded
        ? deps.getProject(command.projectId)
        : deps.getProjects().find((candidate) => candidate.id === command.projectId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      // The experiment/worktree teardown can partially land, so the effect
      // boundary precedes it; the row cascade follows and is never replayed
      // blindly. The shared removal guard spans the teardown, every close
      // await, and the final cascade, so a same-project experiment committed
      // concurrently can neither survive the record phase nor slip a delayed
      // worktree preparation past the teardown.
      options.onEffectBoundary?.();
      const release = deps.beginProjectRemoval(command.projectId);
      try {
        await deps.removeProjectExperiments(project);
        // Tear down running sessions before the cascade drops their rows.
        for (const threadId of deps.listProjectThreadIds(command.projectId)) {
          await deps.closeThread(threadId).catch(() => undefined);
        }
        deps.deleteProject(command.projectId);
      } finally {
        release();
      }
      if (bounded) return boundedResult({ ok: true });
      return completeResult({ projects: deps.getProjects() });
    }
    // ── Narrow catalog mutations (bounded responses, no catalog read) ────
    case "reorder": {
      const outcome = deps.reorderProject({
        projectId: command.projectId,
        targetProjectId: command.targetProjectId,
        placement: command.placement,
      });
      // A no-op is a successful command with zero row writes: a target that is
      // missing from the host's order is a stale-projection refusal instead.
      if (outcome.status === "project_missing" || outcome.status === "target_missing") {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      return { kind: "bounded", response: { ok: true } };
    }
    case "set-workspace": {
      if (!deps.setProjectWorkspace(command.projectId, command.workspaceId)) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      return boundedProjectApplication(deps, command.projectId);
    }
    case "set-draft-config": {
      if (!deps.setProjectLastDraftConfig(command.projectId, command.lastDraftConfig)) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      return boundedProjectApplication(deps, command.projectId);
    }
  }
}

/** Complete legacy result: the full list doubles as the wire response. */
function completeResult(result: RemoteProjectCommandResult): RemoteProjectCommandApplication {
  return { kind: "complete", projects: result.projects, response: result };
}

/** Bounded result: only the acknowledgement plus the affected row. */
function boundedResult(response: RemoteProjectCommandResponse): RemoteProjectCommandApplication {
  return { kind: "bounded", response };
}

/**
 * Validates and merges one `update` patch onto the stored row. Shared by both
 * result modes so legacy callers and bounded callers apply the identical
 * patch semantics (name/icon validation, explicit-null removal, and the
 * masked-MCP-marker round trip).
 */
function applyProjectPatch(
  project: Project,
  patch: Extract<RemoteProjectCommand, { kind: "update" }>["patch"],
): Project {
  if (patch.name !== undefined) assertValidName(patch.name);
  if (typeof patch.icon === "string") assertValidIcon(patch.icon);
  let updated: Project = {
    ...project,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null)),
  };
  // `GET /api/projects/{id}/settings` masks MCP credential values, so a
  // client echoing that read back inside a whole-list patch carries the
  // «redacted» markers. Restore each marker from the stored server (same
  // round-trip as the MCP settings gateway) and refuse markers that have
  // no stored source — a new server cannot be defined by a masked value.
  if (Array.isArray(patch.mcpServers)) {
    updated = {
      ...updated,
      mcpServers: restoreProjectMcpServers(patch.mcpServers, project.mcpServers ?? []),
    };
  }
  for (const key of [
    "icon",
    "scripts",
    "searchSettings",
    "worktreeLocation",
    "mcpServers",
    "ghAccount",
  ] as const) {
    if (patch[key] !== null) continue;
    const { [key]: _, ...rest } = updated;
    updated = rest;
  }
  return updated;
}

/**
 * Bounded catalog-mutation result: only the acknowledgement plus the affected
 * row (read by primary key) — never the catalog. The route's change
 * publication decides separately whether the full list is needed at all.
 */
function boundedProjectApplication(
  deps: RemoteProjectCommandDeps,
  projectId: string,
): RemoteProjectCommandApplication {
  const project = deps.getProject(projectId);
  return {
    kind: "bounded",
    response: { ok: true, ...(project ? { project } : {}) },
  };
}

function register(
  deps: RemoteProjectCommandDeps,
  location: ProjectLocation,
  name: string,
  options: RemoteProjectCommandOptions = {},
): RemoteProjectCommandApplication {
  const project = makeProject(location, name, deps.now());
  // The row write is the first effect of a plain registration; for `create`
  // the directory already exists and called this boundary first.
  options.onEffectBoundary?.();
  // Descending timestamp → new projects sort to the top (sortOrder is ASC).
  deps.upsertProject(project, -Date.parse(project.createdAt));
  // Bounded callers get the registration id mapping from this one row — never
  // the catalog; the affected project is already in hand.
  if (options.resultMode === "bounded") return boundedResult({ ok: true, project });
  return completeResult({ projects: deps.getProjects(), project });
}
