import { readFileSync } from "node:fs";
import { protocolFixturePath } from "./paths.ts";
import { FIXTURE_PROJECT_ID, FIXTURE_THREAD_ID } from "./labFixtures.ts";
import { initialBackgroundTasks, type BackgroundTaskFixtureTask } from "./backgroundTaskLab.ts";
import { LabHttpError } from "./labAuth.ts";
import { LabComposerToolsState } from "./composerToolsFixtures.ts";
import { LabSideChatState } from "./sideChatFixtures.ts";
import { CREW_FIXTURE } from "./crewFixtures.ts";
import {
  workflowLaunchItems,
  markWorkflowAwaitingReference,
  completeWorkflowLaunchReference,
} from "./workflowFixtures.ts";
import { toolPresentationItems, updateToolPresentationItems } from "./toolPresentationFixtures.ts";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";

import { buildTurnTimingStory } from "./timingFixtures.ts";

const FIXTURE_TIME = "2026-08-12T10:03:00.000Z";

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(protocolFixturePath(name), "utf8")) as Record<string, unknown>;
}

export class LabLifecycleState {
  private projects: Array<Record<string, unknown>> = [];
  private thread: Record<string, unknown> = {};
  private readonly importedThreads = new Map<string, Record<string, unknown>>();
  private readonly importedPrompts = new Map<string, string>();
  private runtimeItems: Array<Record<string, unknown>> = [];
  private completedTurns: unknown[] = [];
  private contextUsage: unknown = null;
  private runtimeSummariesByThread: Record<string, unknown> = {};
  private notes: Record<string, unknown> | null = null;
  private pendingSteer: Record<string, unknown> | null = null;
  private goal: Record<string, unknown> | null = null;
  /** Authoritative live roster; the snapshot carries it so reconnect never
   * resurrects a drained list from a stale event. */
  private backgroundTasks: readonly BackgroundTaskFixtureTask[] = [];
  private readonly attachments = new Map<string, Buffer>();
  private readonly pendingFollowUps = new Set<string>();
  private readonly projectMcpServers = new Map<string, unknown[]>();
  readonly composerTools = new LabComposerToolsState(this.projectMcpServers);
  readonly sideChats = new LabSideChatState();
  composerPreferencesEnabled = false;
  toolPresentationEnabled = false;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.composerPreferencesEnabled = false;
    this.toolPresentationEnabled = false;
    const shell = readFixture("shell-snapshot.json");
    const history = readFixture("thread-history.json");
    this.projects = structuredClone(shell.projects as Array<Record<string, unknown>>);
    this.importedThreads.clear();
    this.sideChats.reset();
    this.importedPrompts.clear();
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
    this.backgroundTasks = initialBackgroundTasks();
    this.attachments.clear();
    this.pendingFollowUps.clear();
    this.projectMcpServers.clear();
    this.composerTools.reset();
    for (const project of this.projects) this.projectMcpServers.set(String(project.id), []);
  }

  shellSnapshot(snapshotSeq: number, snapshotEpoch: string): Record<string, unknown> {
    return {
      snapshotSeq,
      snapshotEpoch,
      projects: structuredClone(this.projects),
      threads: [
        structuredClone(this.thread),
        ...this.sideChats.rows(),
        ...structuredClone([...this.importedThreads.values()]),
      ],
      runtimeSummariesByThread: structuredClone(this.runtimeSummariesByThread),
      updatedAt: FIXTURE_TIME,
    };
  }

  prepareTurnTiming(live = false): void {
    const story = buildTurnTimingStory(live, {
      thread: this.thread,
      runtimeItems: this.runtimeItems,
      completedTurns: this.completedTurns,
    });
    this.thread = story.thread;
    this.runtimeItems = story.runtimeItems;
    this.completedTurns = story.completedTurns;
    this.backgroundTasks = [];
  }

  prepareWorkflow(): void {
    this.runtimeItems = workflowLaunchItems(this.thread, this.runtimeItems);
  }

  prepareWorkflowViewer(stressResults = false): void {
    this.runtimeItems = workflowLaunchItems(this.thread, this.runtimeItems, stressResults);
    this.toolPresentationEnabled = true;
  }

  prepareWorkflowAwaitingReference(): void {
    this.prepareWorkflowViewer();
    markWorkflowAwaitingReference(this.runtimeItems);
  }

  publishWorkflowReference(): Record<string, unknown> {
    return completeWorkflowLaunchReference(this.runtimeItems);
  }

  prepareToolPresentation(): void {
    this.toolPresentationEnabled = true;
    this.thread.status = "finished";
    this.thread.attention = "none";
    delete this.thread.activeTurnStartedAt;
    this.runtimeItems = toolPresentationItems();
  }

  updateToolPresentation(): Record<string, unknown> {
    return updateToolPresentationItems(this.runtimeItems, FIXTURE_THREAD_ID);
  }

  prepareSideChat(): void {
    this.sideChats.enabled = true;
    this.thread = {
      ...this.thread,
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      worktreePath: "/Users/fixture/project/.worktrees/review",
      worktreeBranch: "feature/native-review",
    };
    this.runtimeItems.push({
      id: "side-parent-tool",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "inspect",
        title: "Inspect the source context",
        args: {},
        result: { content: [{ type: "text", text: "Private parent tool result" }] },
      },
      streams: {},
    });
  }

  prepareCrews(): void {
    this.thread = {
      ...this.thread,
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      config: {
        model: "gpt-5",
        effort: "high",
        fast: false,
        contextSize: "128k",
        approvalPolicy: "review",
        sandboxMode: "project",
        crew: {
          version: 1,
          crewId: CREW_FIXTURE.id,
          name: CREW_FIXTURE.name,
          policy: CREW_FIXTURE.policy,
          roles: structuredClone(CREW_FIXTURE.roles),
        },
      },
    };
  }

  appendSideChatParentUpdate(): Record<string, unknown> {
    const item = {
      id: "side-parent-update",
      type: "assistant_message",
      state: "completed",
      payload: { content: [] },
      streams: { assistant_text: "Parent context changed" },
    };
    this.runtimeItems.push(item);
    return item;
  }

  startSideChat(threadId: string, body: Record<string, unknown>, commandId: string): void {
    this.sideChats.start(threadId, body, commandId, this.thread);
  }

  history(snapshotSeq: number, threadId?: string): Record<string, unknown> {
    const side = threadId ? this.sideChats.history(threadId, snapshotSeq) : undefined;
    if (side) return side;
    const imported = threadId ? this.importedThreads.get(threadId) : undefined;
    if (imported) {
      return {
        snapshotSeq,
        thread: structuredClone(imported),
        runtimeItems: [
          {
            id: `import-${threadId}`,
            type: "user_message",
            state: "completed",
            payload: { prompt: this.importedPrompts.get(String(imported.id)) ?? "" },
            streams: {},
          },
        ],
        completedTurns: [],
        contextUsage: null,
        updatedAt: FIXTURE_TIME,
      };
    }
    return {
      snapshotSeq,
      thread: structuredClone(this.thread),
      runtimeItems: structuredClone(this.runtimeItems),
      completedTurns: structuredClone(this.completedTurns),
      contextUsage: structuredClone(this.contextUsage),
      backgroundTasks: structuredClone(this.backgroundTasks),
      updatedAt: FIXTURE_TIME,
    };
  }

  /** Installs the authoritative roster a live `background_tasks.changed` event
   * announced, so the next history read (reconnect) agrees with the event. */
  setBackgroundTasks(tasks: readonly BackgroundTaskFixtureTask[]): void {
    this.backgroundTasks = structuredClone(tasks) as BackgroundTaskFixtureTask[];
  }

  hasThread(threadId: string): boolean {
    return (
      this.thread.id === threadId ||
      this.importedThreads.has(threadId) ||
      this.sideChats.has(threadId)
    );
  }

  importSession(threadId: string, body: Record<string, unknown>): void {
    if (this.hasThread(threadId))
      throw new LabHttpError("thread_already_exists", "Thread already exists.", 409);
    const source = REMOTE_PROCEDURE_RESULT_FIXTURES.listImportableSessions.sessions.find(
      (session) =>
        session.path === body.path &&
        session.agentKind === body.agentKind &&
        session.providerSessionId === body.providerSessionId,
    );
    if (!source) {
      throw new LabHttpError("not_found", "Session not found.", 404);
    }
    if (!this.projects.some((project) => project.id === body.projectId))
      throw new LabHttpError("not_found", "Project not found.", 404);
    this.importedPrompts.set(threadId, source.preview);
    this.importedThreads.set(threadId, {
      ...structuredClone(this.thread),
      id: threadId,
      projectId: body.projectId,
      agentKind: body.agentKind,
      title: body.title,
      status: "inactive",
      attention: "none",
      config: { model: body.model, importedFrom: { path: body.path, importedAt: FIXTURE_TIME } },
      sessionRef: { providerSessionId: body.providerSessionId, discoveredAt: FIXTURE_TIME },
    });
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
    if (kind === "set-draft-config") {
      if (!this.composerPreferencesEnabled) return null;
      const index = this.projects.findIndex((project) => project.id === command.projectId);
      if (index < 0) return { ok: true };
      const project = {
        ...this.projects[index]!,
        lastDraftConfig: structuredClone(command.lastDraftConfig),
      };
      this.projects[index] = project;
      return { ok: true, project: structuredClone(project) };
    }
    if (kind === "create" || kind === "clone") return null;
    let project: Record<string, unknown> | undefined;
    if (kind === "add-existing") {
      const existing = this.projects.find(
        (candidate) =>
          (candidate.location as Record<string, unknown> | undefined)?.path === command.path,
      );
      if (existing)
        return { projects: structuredClone(this.projects), project: structuredClone(existing) };
      project = {
        id: this.projects.some((candidate) => candidate.id === "project-fixture-added")
          ? `project-fixture-added-${this.projects.length}`
          : "project-fixture-added",
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

  /** Deterministic compound-revert result (WS2): identical phase shape to the
   * production BackendHostCore result for one checkpoint revert. */
  checkpointRevert(itemId: string): {
    outcome: "completed";
    replayed: boolean;
    numTurns: number;
    providerPhase: "completed";
    filesPhase: "completed";
    truncatePhase: "completed" | "noop";
    removedCompletedTurnAnchors: string[];
  } {
    const index = this.runtimeItems.findIndex((item) => item.id === itemId);
    const removed = index >= 0 ? this.runtimeItems.slice(index + 1).map((item) => item.id) : [];
    if (index >= 0) this.runtimeItems = this.runtimeItems.slice(0, index + 1);
    return {
      outcome: "completed",
      replayed: false,
      numTurns: removed.length > 0 ? 1 : 0,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: removed.length > 0 ? "completed" : "noop",
      removedCompletedTurnAnchors: [],
    };
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
                "thread-checkpoint-revert",
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
