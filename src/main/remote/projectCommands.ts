import { randomUUID } from "node:crypto";
import { basename, posix, win32 } from "node:path";
import type { CloneRepoSource, Project, ProjectLocation } from "@/shared/contracts";
import {
  buildScratchTargetPath,
  deriveLocationFromPath,
  validateProjectName,
} from "@/shared/createProject";
import type { RemoteProjectCommand, RemoteProjectCommandResult } from "@/shared/remote";
import { msg } from "@/shared/messages";
import { parseProjectIcon } from "@/shared/projectIcon";
import { parseWslUncPath } from "@/shared/wsl";
import { RemoteHttpError } from "./auth";

/**
 * Dependencies for {@link applyRemoteProjectCommand}, injected so the handler
 * stays pure and unit-testable (no DB, no filesystem, no supervisor).
 */
export interface RemoteProjectCommandDeps {
  getProjects(): Project[];
  removeProjectExperiments(project: Project): Promise<void>;
  hasRunningProjectThread(projectId: string): boolean;
  /** Thread ids belonging to a project, closed best-effort before removal. */
  listProjectThreadIds(projectId: string): readonly string[];
  upsertProject(project: Project, sortOrder: number): void;
  updateProject(project: Project): void;
  deleteProject(projectId: string): void;
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

/** Folder name from an absolute path, used when the client omits a project name. */
function nameFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return basename(trimmed) || trimmed;
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
): Promise<RemoteProjectCommandResult> {
  switch (command.kind) {
    case "add-existing": {
      assertValidProjectPath(command.path, deps.platform);
      const name = command.name?.trim() || nameFromPath(command.path);
      assertValidName(name);
      const location = deriveLocationFromPath(command.path, deps.platform);
      return register(deps, location, name);
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
        throw new RemoteHttpError(
          "project_directory_failed",
          msg("remote.project.directoryFailed"),
          400,
        );
      }
      const location = deriveLocationFromPath(targetPath, deps.platform);
      return register(deps, location, command.name);
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
      const { path } = await deps.cloneRepo({
        parentLocation,
        name: command.name,
        source: command.source,
      });
      const location = deriveLocationFromPath(path, deps.platform);
      return register(deps, location, command.name);
    }
    case "update": {
      const projects = deps.getProjects();
      const project = projects.find((candidate) => candidate.id === command.projectId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      if (command.patch.name !== undefined) assertValidName(command.patch.name);
      if (typeof command.patch.icon === "string") assertValidIcon(command.patch.icon);
      let updated: Project = {
        ...project,
        ...Object.fromEntries(Object.entries(command.patch).filter(([, value]) => value !== null)),
      };
      for (const key of [
        "icon",
        "scripts",
        "searchSettings",
        "worktreeLocation",
        "mcpServers",
      ] as const) {
        if (command.patch[key] !== null) continue;
        const { [key]: _, ...rest } = updated;
        updated = rest;
      }
      deps.updateProject(updated);
      return {
        projects: projects.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        project: updated,
      };
    }
    case "relocate": {
      assertValidProjectPath(command.path, deps.platform);
      const projects = deps.getProjects();
      const project = projects.find((candidate) => candidate.id === command.projectId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      if (deps.hasRunningProjectThread(project.id)) {
        throw new RemoteHttpError(
          "project_has_running_threads",
          msg("remote.project.runningThreads"),
          409,
        );
      }
      const updated = {
        ...project,
        location: deriveLocationFromPath(command.path, deps.platform),
      };
      deps.updateProject(updated);
      return {
        projects: projects.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
        project: updated,
      };
    }
    case "remove": {
      const project = deps.getProjects().find((candidate) => candidate.id === command.projectId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      await deps.removeProjectExperiments(project);
      // Tear down running sessions before the cascade drops their rows.
      for (const threadId of deps.listProjectThreadIds(command.projectId)) {
        await deps.closeThread(threadId).catch(() => undefined);
      }
      deps.deleteProject(command.projectId);
      return { projects: deps.getProjects() };
    }
  }
}

function register(
  deps: RemoteProjectCommandDeps,
  location: ProjectLocation,
  name: string,
): RemoteProjectCommandResult {
  const project = makeProject(location, name, deps.now());
  // Descending timestamp → new projects sort to the top (sortOrder is ASC).
  deps.upsertProject(project, -Date.parse(project.createdAt));
  return { projects: deps.getProjects(), project };
}
