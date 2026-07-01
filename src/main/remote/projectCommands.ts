import { randomUUID } from "node:crypto";
import { basename, posix, win32 } from "node:path";
import type { CloneRepoSource, Project, ProjectLocation } from "@/shared/contracts";
import {
  buildScratchTargetPath,
  deriveLocationFromPath,
  validateProjectName,
} from "@/shared/createProject";
import type { RemoteProjectCommand, RemoteProjectCommandResult } from "@/shared/remote";
import { parseWslUncPath } from "@/shared/wsl";
import { RemoteHttpError } from "./auth";

/**
 * Dependencies for {@link applyRemoteProjectCommand}, injected so the handler
 * stays pure and unit-testable (no DB, no filesystem, no supervisor).
 */
export interface RemoteProjectCommandDeps {
  getProjects(): Project[];
  /** Thread ids belonging to a project, closed best-effort before removal. */
  listProjectThreadIds(projectId: string): readonly string[];
  upsertProject(project: Project, sortOrder: number): void;
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
    throw new RemoteHttpError("invalid_project_name", error, 400);
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
    throw new RemoteHttpError(
      "invalid_project_path",
      'A project path may not contain ".." segments.',
      400,
    );
  }
}

function assertAbsolutePath(path: string, platform: NodeJS.Platform): void {
  const isAbsolute =
    parseWslUncPath(path) !== null ||
    (platform === "win32" ? win32.isAbsolute(path) : posix.isAbsolute(path));
  if (!isAbsolute) {
    throw new RemoteHttpError("invalid_project_path", "A project path must be absolute.", 400);
  }
}

function assertValidProjectPath(path: string, platform: NodeJS.Platform): void {
  assertNoTraversal(path);
  assertAbsolutePath(path, platform);
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
      } catch (error) {
        throw new RemoteHttpError(
          "project_directory_failed",
          error instanceof Error ? error.message : "Could not create the project folder.",
          400,
        );
      }
      const location = deriveLocationFromPath(targetPath, deps.platform);
      return register(deps, location, command.name);
    }
    case "clone": {
      assertValidProjectPath(command.parentPath, deps.platform);
      assertValidName(command.name);
      const parentLocation = deriveLocationFromPath(command.parentPath, deps.platform);
      const { path } = await deps.cloneRepo({
        parentLocation,
        name: command.name,
        source: command.source,
      });
      const location = deriveLocationFromPath(path, deps.platform);
      return register(deps, location, command.name);
    }
    case "remove": {
      const exists = deps.getProjects().some((project) => project.id === command.projectId);
      if (!exists) {
        throw new RemoteHttpError("project_not_found", "Project not found.", 404);
      }
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
