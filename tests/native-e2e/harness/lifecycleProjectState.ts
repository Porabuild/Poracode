import {
  PROJECT_NOTES_CONFLICT,
  type ProjectNotes,
  type ProjectNotesSaveResult,
} from "../../../src/shared/contracts/notes.ts";
import {
  projectNotesWriteBodySchema,
  type projectNotesReadResultSchema,
} from "../../../src/shared/remote/contract/routeBodies.ts";
import { LabHttpError } from "./labAuth.ts";
import { FIXTURE_PROJECT_ID } from "./labFixtures.ts";

export function applyProjectActionsFixture(projects: Array<Record<string, unknown>>): void {
  const project = projects.find(({ id }) => id === FIXTURE_PROJECT_ID);
  if (!project) return;
  project.name = "Actions Fixture Project";
  project.scripts = {
    setupScript: "printf 'original setup'",
    cleanupScript: "printf 'cleanup'",
    worktreeCopyPatterns: [".env.example"],
    actions: [
      {
        id: "existing-action",
        name: "Existing fixture action",
        command: "printf 'existing'",
        icon: "hammer",
      },
    ],
  };
}

export function applyDesktopProjectActionsEdit(projects: Array<Record<string, unknown>>): void {
  const project = projects.find(({ id }) => id === FIXTURE_PROJECT_ID);
  if (!project?.scripts) return;
  const scripts = project.scripts as { actions: unknown[] };
  project.scripts = {
    ...scripts,
    setupScript: "printf 'edited setup'",
    actions: [
      ...scripts.actions,
      {
        id: "desktop-action",
        name: "Desktop fixture action",
        command: "printf 'desktop'",
        icon: "terminal",
      },
    ],
  };
}

export function verifyProjectActionsSaved(projects: Array<Record<string, unknown>>): void {
  const project = projects.find(({ id }) => id === FIXTURE_PROJECT_ID);
  const scripts = project?.scripts as
    | {
        setupScript: string;
        cleanupScript: string;
        worktreeCopyPatterns: string[];
        actions: { name: string; command: string }[];
      }
    | undefined;
  if (
    scripts?.setupScript !== "printf 'edited setup'" ||
    scripts.cleanupScript !== "printf 'cleanup'" ||
    !scripts.worktreeCopyPatterns.includes(".env.example") ||
    !scripts.actions.some(({ name }) => name === "Existing fixture action") ||
    !scripts.actions.some(({ name }) => name === "Desktop fixture action") ||
    !scripts.actions.some(
      ({ name, command }) => name === "New fixture action" && command === "printf 'fixture only'",
    )
  ) {
    throw new Error("The project action save lost staged or concurrently edited settings.");
  }
}

export function applyProjectCommand(
  projects: Array<Record<string, unknown>>,
  projectMcpServers: Map<string, unknown[]>,
  command: Record<string, unknown>,
  composerPreferencesEnabled: boolean,
  fixtureTime: string,
): Record<string, unknown> | null {
  const kind = command.kind;
  if (kind === "set-draft-config") {
    if (!composerPreferencesEnabled) return null;
    const index = projects.findIndex((project) => project.id === command.projectId);
    if (index < 0) return { ok: true };
    const project = {
      ...projects[index]!,
      lastDraftConfig: structuredClone(command.lastDraftConfig),
    };
    projects[index] = project;
    return { ok: true, project: structuredClone(project) };
  }
  if (kind === "create" || kind === "clone") return null;
  let project: Record<string, unknown> | undefined;
  if (kind === "add-existing") {
    const existing = projects.find(
      (candidate) =>
        (candidate.location as Record<string, unknown> | undefined)?.path === command.path,
    );
    if (existing)
      return { projects: structuredClone(projects), project: structuredClone(existing) };
    project = {
      id: projects.some((candidate) => candidate.id === "project-fixture-added")
        ? `project-fixture-added-${projects.length}`
        : "project-fixture-added",
      name: command.name ?? "added-fixture",
      location: { kind: "posix", path: command.path },
      createdAt: fixtureTime,
    };
    projects.push(project);
    projectMcpServers.set(String(project.id), []);
  } else {
    const projectId = String(command.projectId);
    const index = projects.findIndex((candidate) => candidate.id === projectId);
    if (index < 0) return { projects: structuredClone(projects) };
    if (kind === "remove") {
      projects.splice(index, 1);
      projectMcpServers.delete(projectId);
    } else {
      const current = projects[index]!;
      if (kind === "relocate") {
        project = { ...current, location: { kind: "posix", path: command.path } };
      } else {
        const patch = command.patch as Record<string, unknown>;
        if (Object.hasOwn(patch, "mcpServers")) {
          projectMcpServers.set(
            projectId,
            Array.isArray(patch.mcpServers) ? structuredClone(patch.mcpServers) : [],
          );
        }
        const { mcpServers: _sensitive, ...safePatch } = patch;
        project = { ...current, ...safePatch };
      }
      projects[index] = project;
    }
  }
  return {
    projects: structuredClone(projects),
    ...(project ? { project: structuredClone(project) } : {}),
  };
}

export class LabProjectNotesStore {
  private readonly notes = new Map<string, ProjectNotes>();
  private readonly protectedNotes = new Set<string>();
  private revision = 0;

  reset(): void {
    this.notes.clear();
    this.protectedNotes.clear();
  }

  read(
    projects: Array<Record<string, unknown>>,
    projectId: string,
  ): ReturnType<typeof projectNotesReadResultSchema.parse> {
    if (!projects.some((project) => project.id === projectId)) {
      throw new LabHttpError("project_not_found", "Project not found.", 404);
    }
    return { notes: structuredClone(this.notes.get(projectId) ?? null), guardedWrites: 1 };
  }

  prepare(text: string, fixtureTime: string): void {
    this.store({
      projectId: FIXTURE_PROJECT_ID,
      doc: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
      todos: [
        { id: "fixture-todo", text: "First fixture task", done: false, createdAt: fixtureTime },
      ],
      updatedAt: fixtureTime,
    });
  }

  write(
    projects: Array<Record<string, unknown>>,
    projectId: string,
    body: Record<string, unknown>,
    fixtureTime: string,
  ): ProjectNotesSaveResult | undefined {
    const { notes: current } = this.read(projects, projectId);
    const notes = projectNotesWriteBodySchema.parse(body);
    if ("replacement" in notes) {
      if (notes.baseRevision !== (current?.revision ?? null)) {
        return { status: "conflict", notes: current };
      }
      const saved = this.store({ projectId, ...notes.replacement, updatedAt: fixtureTime });
      this.protectedNotes.add(projectId);
      return { status: "saved", notes: saved };
    }
    if (this.protectedNotes.has(projectId) && current) {
      if (JSON.stringify([current.doc, current.todos]) === JSON.stringify([notes.doc, notes.todos]))
        return;
      throw new LabHttpError(PROJECT_NOTES_CONFLICT, "Project Notes changed.", 409);
    }
    this.store({ projectId, ...notes });
    return;
  }

  private store(notes: ProjectNotes): ProjectNotes {
    const saved = structuredClone({ ...notes, revision: `fixture-notes-${++this.revision}` });
    this.notes.set(notes.projectId, saved);
    return structuredClone(saved);
  }
}
