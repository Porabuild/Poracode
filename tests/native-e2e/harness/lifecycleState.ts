import { readFileSync } from "node:fs";
import { protocolFixturePath } from "./paths.ts";
import { FIXTURE_PROJECT_ID } from "./labFixtures.ts";

const FIXTURE_TIME = "2026-08-12T10:03:00.000Z";

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(protocolFixturePath(name), "utf8")) as Record<string, unknown>;
}

export class LabLifecycleState {
  private projects: Array<Record<string, unknown>> = [];
  private thread: Record<string, unknown> = {};
  private runtimeItems: Array<Record<string, unknown>> = [];
  private completedTurns: unknown[] = [];
  private contextUsage: unknown = null;
  private runtimeSummariesByThread: Record<string, unknown> = {};
  private notes: Record<string, unknown> | null = null;
  private pendingSteer: Record<string, unknown> | null = null;
  private goal: Record<string, unknown> | null = null;
  private readonly attachments = new Map<string, Buffer>();
  private readonly pendingFollowUps = new Set<string>();
  private readonly projectMcpServers = new Map<string, unknown[]>();

  constructor() {
    this.reset();
  }

  reset(): void {
    const shell = readFixture("shell-snapshot.json");
    const history = readFixture("thread-history.json");
    this.projects = structuredClone(shell.projects as Array<Record<string, unknown>>);
    this.thread = structuredClone(history.thread as Record<string, unknown>);
    this.runtimeItems = structuredClone(history.runtimeItems as Array<Record<string, unknown>>);
    this.completedTurns = structuredClone(history.completedTurns as unknown[]);
    this.contextUsage = structuredClone(history.contextUsage);
    this.runtimeSummariesByThread = structuredClone(
      shell.runtimeSummariesByThread as Record<string, unknown>,
    );
    this.notes = null;
    this.pendingSteer = null;
    this.goal = null;
    this.attachments.clear();
    this.pendingFollowUps.clear();
    this.projectMcpServers.clear();
    for (const project of this.projects) this.projectMcpServers.set(String(project.id), []);
  }

  shellSnapshot(snapshotSeq: number): Record<string, unknown> {
    return {
      snapshotSeq,
      projects: structuredClone(this.projects),
      threads: [structuredClone(this.thread)],
      runtimeSummariesByThread: structuredClone(this.runtimeSummariesByThread),
      updatedAt: FIXTURE_TIME,
    };
  }

  history(snapshotSeq: number): Record<string, unknown> {
    return {
      snapshotSeq,
      thread: structuredClone(this.thread),
      runtimeItems: structuredClone(this.runtimeItems),
      completedTurns: structuredClone(this.completedTurns),
      contextUsage: structuredClone(this.contextUsage),
      updatedAt: FIXTURE_TIME,
    };
  }

  hasThread(threadId: string): boolean {
    return this.thread.id === threadId;
  }

  historyItems(beforePosition?: number, limit = 100): Record<string, unknown> {
    const end = beforePosition ?? this.runtimeItems.length;
    const start = Math.max(0, end - limit);
    return {
      items: structuredClone(this.runtimeItems.slice(start, end)),
      nextCursor: start > 0 ? start : null,
    };
  }

  projectCommand(command: Record<string, unknown>): Record<string, unknown> | null {
    const kind = command.kind;
    if (kind === "create" || kind === "clone") return null;
    let project: Record<string, unknown> | undefined;
    if (kind === "add-existing") {
      project = {
        id: "project-fixture-added",
        name: command.name ?? "added-fixture",
        location: { kind: "posix", path: command.path },
        createdAt: FIXTURE_TIME,
      };
      this.projects.push(project);
      this.projectMcpServers.set(String(project.id), []);
    } else {
      const projectId = String(command.projectId);
      const index = this.projects.findIndex((candidate) => candidate.id === projectId);
      if (index < 0) return { projects: structuredClone(this.projects) };
      if (kind === "remove") {
        this.projects.splice(index, 1);
        this.projectMcpServers.delete(projectId);
      } else {
        const current = this.projects[index]!;
        if (kind === "relocate") {
          project = { ...current, location: { kind: "posix", path: command.path } };
        } else {
          const patch = command.patch as Record<string, unknown>;
          if (Object.hasOwn(patch, "mcpServers")) {
            this.projectMcpServers.set(
              projectId,
              Array.isArray(patch.mcpServers) ? structuredClone(patch.mcpServers) : [],
            );
          }
          const { mcpServers: _sensitive, ...safePatch } = patch;
          project = { ...current, ...safePatch };
        }
        this.projects[index] = project;
      }
    }
    return {
      projects: structuredClone(this.projects),
      ...(project ? { project: structuredClone(project) } : {}),
    };
  }

  projectSettings(projectId: string): Record<string, unknown> | null {
    if (!this.projects.some((project) => project.id === projectId)) return null;
    return { mcpServers: structuredClone(this.projectMcpServers.get(projectId) ?? []) };
  }

  readNotes(projectId: string): Record<string, unknown> {
    return { notes: projectId === FIXTURE_PROJECT_ID ? structuredClone(this.notes) : null };
  }

  writeNotes(projectId: string, notes: Record<string, unknown>): void {
    this.notes = { projectId, ...structuredClone(notes) };
  }

  start(body: Record<string, unknown>): Record<string, unknown> {
    this.thread = {
      ...this.thread,
      id: body.threadId,
      agentKind: body.agentKind,
      config: body.config,
      presentationMode: body.presentationMode ?? "gui",
      status: "working",
      attention: "working",
      updatedAt: FIXTURE_TIME,
    };
    return { threadId: body.threadId };
  }

  send(body: Record<string, unknown>): void {
    const id = String(body.userMessageItemId ?? `item-user-${this.runtimeItems.length + 1}`);
    this.runtimeItems.push({
      id,
      type: "user_message",
      state: "completed",
      payload: { prompt: body.prompt, ...(body.segments ? { segments: body.segments } : {}) },
      streams: {},
    });
    this.thread = { ...this.thread, status: "working", attention: "working" };
  }

  interrupt(): void {
    this.thread = { ...this.thread, status: "idle", attention: "none" };
  }

  close(): void {
    this.thread = { ...this.thread, status: "idle", attention: "none" };
  }

  command(body: Record<string, unknown>): void {
    switch (body.kind) {
      case "rename":
        this.thread = { ...this.thread, title: body.title };
        break;
      case "set-done":
        this.thread = { ...this.thread, done: body.done };
        break;
      case "set-starred":
        this.thread = { ...this.thread, starred: body.starred };
        break;
      case "archive":
        this.thread = { ...this.thread, archived: true };
        break;
      case "unarchive":
        this.thread = { ...this.thread, archived: false };
        break;
    }
  }

  setGoal(body: Record<string, unknown>): void {
    this.goal = body.action === "clear" ? null : structuredClone(body);
  }

  setSteer(body: Record<string, unknown>): void {
    this.pendingSteer = structuredClone(body);
  }

  clearSteer(): void {
    this.pendingSteer = null;
  }

  truncate(itemId: string): void {
    const index = this.runtimeItems.findIndex((item) => item.id === itemId);
    if (index >= 0) this.runtimeItems = this.runtimeItems.slice(0, index + 1);
  }

  saveAttachment(threadId: string, name: string, data: Buffer): string {
    const path = `/attachments/${encodeURIComponent(threadId)}/${encodeURIComponent(name)}`;
    this.attachments.set(path, data);
    return path;
  }

  recordMutation(routeId: string): void {
    this.pendingFollowUps.add(routeId);
  }

  takeFollowUps(evidenceRouteId: string): string[] {
    const eligible = new Set(
      evidenceRouteId === "shell-snapshot"
        ? ["project-command", "thread-start-existing"]
        : evidenceRouteId === "project-notes-read"
          ? ["project-notes-write"]
          : evidenceRouteId === "thread-history" || evidenceRouteId === "thread-history-items"
            ? [
                "attachment-upload",
                "thread-runtime-truncate",
                "thread-command",
                "thread-send",
                "thread-interrupt",
                "thread-goal",
                "thread-close",
                "thread-steer-set",
                "thread-steer-clear",
              ]
            : [],
    );
    const matched = [...this.pendingFollowUps].filter((routeId) => eligible.has(routeId));
    for (const routeId of matched) this.pendingFollowUps.delete(routeId);
    return matched;
  }
}
