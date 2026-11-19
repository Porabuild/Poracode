import { randomUUID } from "node:crypto";
import { z } from "zod";
import { projectActionSchema, type Project } from "@/shared/contracts";
import {
  WORKSPACE_TERMINAL_CONTROL_VERSION,
  WORKSPACE_TERMINAL_READ_LIMIT,
} from "@/shared/contracts/workspaceTerminal";
import type { SupervisorEvent } from "@/shared/ipc";
import { buildProjectActionCommand } from "@/shared/projectActionScript";
import { projectLocationKey } from "@/shared/projectIdentity";
import { createShellPromptGate } from "@/shared/shellPromptReady";
import { normalizeWorktreePathForComparison, resolveProjectLocation } from "@/shared/worktree";
import { runRemoteCommand } from "@/host/remote/server/remoteCommandIdempotency";
import type { SupervisorCall } from "./supervisorCaller";

const scopeSchema = z.strictObject({
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).nullable().optional(),
});
const runIdSchema = z.strictObject({ terminalId: z.string().min(1) });
export const projectActionInputSchema = z.discriminatedUnion("action", [
  scopeSchema.extend({ action: z.literal("list") }),
  scopeSchema.extend({
    action: z.literal("run"),
    actionId: projectActionSchema.shape.id,
    operationKey: z.string().min(8).max(128),
  }),
  runIdSchema.extend({ action: z.enum(["status", "read", "stop"]) }),
]);
type ProjectActionInput = z.infer<typeof projectActionInputSchema>;

const actionRunSchema = z.strictObject({
  terminalId: z.string(),
  projectId: z.string(),
  worktreePath: z.string().nullable(),
  actionId: z.string(),
  name: z.string(),
  status: z.enum(["starting", "running", "stopping", "exited", "stopped", "failed", "lost"]),
  exitCode: z.number().int().nullable(),
});
type ActionRun = z.infer<typeof actionRunSchema>;
type TerminalScope = {
  projectLocation: Project["location"];
  worktreePath?: string;
};
interface Run {
  view: ActionRun;
  scope: TerminalScope;
  gate: ReturnType<typeof createShellPromptGate>;
  ready: PromiseWithResolvers<boolean>;
  quiet?: ReturnType<typeof setTimeout>;
  deadline?: ReturnType<typeof setTimeout>;
  spawned: Promise<void>;
  closing?: Promise<ActionRun>;
}

const ROUTE = "app-controls:project-action";
const MAX_FINISHED_RUNS = 64;
const PROMPT_DEADLINE_MS = 20_000;

function isActive(status: ActionRun["status"]): boolean {
  return status === "starting" || status === "running" || status === "stopping";
}

/** The host owns the runs. A renderer or an MCP connection can come and go. */
export class ProjectActionService {
  private readonly runs = new Map<string, Run>();

  constructor(
    private readonly call: SupervisorCall,
    private readonly getProject: (projectId: string) => Project | null,
  ) {}

  async execute(input: ProjectActionInput): Promise<unknown> {
    if (input.action === "run") {
      return runRemoteCommand({
        route: ROUTE,
        commandId: `${ROUTE}:${input.operationKey}`,
        principalId: "app-controls",
        requestPayload: {
          projectId: input.projectId,
          worktreePath: input.worktreePath ?? null,
          actionId: input.actionId,
        },
        mapCompletedResponse: (cached) => actionRunSchema.parse(cached),
        operation: async (markDispatched) => {
          const project = this.getProject(input.projectId);
          if (!project) throw new Error("Project not found on the owning host.");
          const path = input.worktreePath
            ? await this.registeredWorktree(project, input.worktreePath)
            : null;
          return this.start(project, path, input.actionId, markDispatched);
        },
      });
    }
    if (input.action === "list") {
      const project = this.getProject(input.projectId);
      if (!project) throw new Error("Project not found on the owning host.");
      const path = input.worktreePath
        ? await this.registeredWorktree(project, input.worktreePath)
        : null;
      const actions = project.scripts?.actions ?? [];
      const runs = [...this.runs.values()]
        .map(({ view }) => view)
        .filter((view) => view.projectId === project.id && view.worktreePath === path);
      return {
        projectId: project.id,
        worktreePath: path,
        actions: actions.map(({ id, name }) => ({ id, name })),
        runs,
      };
    }
    const run = this.runs.get(input.terminalId);
    if (!run) throw new Error("Project action run not found on this host.");
    if (input.action === "status") return { ...run.view };
    if (input.action === "stop") return this.stop(run);
    const snapshot = await this.call("readTerminalSnapshot", { threadId: run.view.terminalId });
    const data = snapshot?.data.slice(-WORKSPACE_TERMINAL_READ_LIMIT) ?? "";
    return {
      ...run.view,
      data,
      outputAvailable: snapshot !== null,
      truncated: snapshot ? snapshot.toCursor - data.length > 0 : false,
    };
  }

  observe(event: SupervisorEvent): void {
    if (event.type !== "thread-output" && event.type !== "thread-exited") return;
    const run = this.runs.get(event.threadId);
    if (!run || !isActive(run.view.status)) return;
    if (event.type === "thread-exited") {
      this.finish(
        run,
        run.view.status === "stopping" ? "stopped" : "exited",
        event.exitCode ?? null,
      );
    } else if (run.view.status === "starting") {
      clearTimeout(run.quiet);
      if (run.gate.push(event.data) === "ready") run.ready.resolve(true);
      else run.quiet = setTimeout(() => run.ready.resolve(true), run.gate.delayMs());
    }
  }

  reset(): void {
    for (const run of this.runs.values()) {
      if (isActive(run.view.status)) this.finish(run, "lost", null);
    }
  }

  private async registeredWorktree(project: Project, path: string): Promise<string> {
    const pathKey = (value: string) =>
      normalizeWorktreePathForComparison(value, project.location.kind === "windows");
    const { worktrees } = await this.call("gitListWorktrees", {
      projectLocation: project.location,
    });
    const match = worktrees.find((worktree) => pathKey(worktree.path) === pathKey(path));
    if (!match) throw new Error("Worktree not registered to this project.");
    return match.path;
  }

  private async start(
    project: Project,
    path: string | null,
    actionId: string,
    markDispatched: () => void,
  ): Promise<ActionRun> {
    const current = this.getProject(project.id);
    if (!current || projectLocationKey(current.location) !== projectLocationKey(project.location)) {
      throw new Error("Project location changed. Refresh the project before running the action.");
    }
    const action = current.scripts?.actions?.find((entry) => entry.id === actionId);
    if (!action) throw new Error("Project action not found.");
    const text = buildProjectActionCommand(action.command, current.location.kind);
    if (!text) throw new Error("The project action has no executable commands.");
    const existing = [...this.runs.values()].find(
      ({ view }) =>
        view.projectId === project.id &&
        view.worktreePath === path &&
        view.actionId === actionId &&
        isActive(view.status),
    );
    if (existing) return { ...existing.view };

    const terminalId = `shell:${randomUUID()}`;
    const scope = {
      projectLocation: resolveProjectLocation(current.location, path ?? undefined),
      ...(path ? { worktreePath: path } : {}),
    };
    markDispatched();
    const run: Run = {
      view: {
        terminalId,
        projectId: project.id,
        worktreePath: path,
        actionId,
        name: action.name,
        status: "starting",
        exitCode: null,
      },
      scope,
      gate: createShellPromptGate(),
      ready: Promise.withResolvers<boolean>(),
      spawned: Promise.resolve().then(() =>
        this.call("startShell", {
          shellId: terminalId,
          ...scope,
          ...(current.location.kind === "windows" ? { windowsShellRuntime: "powershell" } : {}),
        }),
      ),
    };
    this.runs.set(terminalId, run);
    try {
      await run.spawned;
      run.deadline = setTimeout(() => run.ready.resolve(false), PROMPT_DEADLINE_MS);
      const ready = await run.ready.promise;
      clearTimeout(run.deadline);
      clearTimeout(run.quiet);
      if (run.view.status !== "starting") return { ...run.view };
      if (!ready) throw new Error("The project action shell did not report a prompt.");
      run.view.status = "running";
      await this.call("controlWorkspaceTerminal", {
        version: WORKSPACE_TERMINAL_CONTROL_VERSION,
        terminalId,
        ...scope,
        command: { action: "write", data: `${text}\r` },
      });
      return { ...run.view };
    } catch (error) {
      if (run.view.status === "starting" || run.view.status === "running") {
        const stopped = await this.stop(run).catch(() => undefined);
        if (stopped?.status === "stopped") this.finish(run, "failed", null);
      }
      throw error;
    }
  }

  private stop(run: Run): Promise<ActionRun> {
    if (!isActive(run.view.status)) return Promise.resolve({ ...run.view });
    if (run.closing) return run.closing;
    run.view.status = "stopping";
    run.ready.resolve(false);
    const closing = (async () => {
      try {
        await run.spawned;
      } catch {
        this.finish(run, "failed", null);
        return { ...run.view };
      }
      if (run.view.status === "stopping") {
        const result = await this.call("controlWorkspaceTerminal", {
          version: WORKSPACE_TERMINAL_CONTROL_VERSION,
          terminalId: run.view.terminalId,
          ...run.scope,
          command: { action: "close" },
        });
        if (result.action === "close" && result.confirmed) this.finish(run, "stopped", null);
      }
      return { ...run.view };
    })().finally(() => {
      delete run.closing;
    });
    run.closing = closing;
    return closing;
  }

  private finish(run: Run, status: ActionRun["status"], exitCode: number | null): void {
    clearTimeout(run.quiet);
    clearTimeout(run.deadline);
    run.ready.resolve(false);
    run.view.status = status;
    run.view.exitCode = exitCode;
    const finished = [...this.runs.values()].filter(({ view }) => !isActive(view.status));
    for (const entry of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_RUNS))) {
      this.runs.delete(entry.view.terminalId);
    }
  }
}
