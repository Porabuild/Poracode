import { readFileSync } from "node:fs";
import type { ProjectNotesSaveResult } from "../../../src/shared/contracts/notes.ts";
import type { projectNotesReadResultSchema } from "../../../src/shared/remote/contract/routeBodies.ts";
import { protocolFixturePath } from "./paths.ts";
import { FIXTURE_THREAD_ID } from "./labFixtures.ts";
import { initialBackgroundTasks, type BackgroundTaskFixtureTask } from "./backgroundTaskLab.ts";
import { LabHttpError } from "./labAuth.ts";
import { LabComposerToolsState } from "./composerToolsFixtures.ts";
import { LabSideChatState } from "./sideChatFixtures.ts";
import { LabThreadForkState } from "./threadForkFixture.ts";
import {
  workflowLaunchItems,
  markWorkflowAwaitingReference,
  completeWorkflowLaunchReference,
} from "./workflowFixtures.ts";
import {
  sameFileEditPresentationItems,
  toolPresentationItems,
  updateToolPresentationItems,
} from "./toolPresentationFixtures.ts";
import {
  applyFixtureApproval,
  applyProviderSwitchHandoff,
  applyStreamingToolActivity,
  applyThreadCommand,
  buildArchivedThreadPair,
  buildCrewsThread,
  buildImportedHistorySnapshot,
  buildSideChatThread,
  collectFollowUpRoutes,
  createImportedThreadRecord,
  createProviderHandoffRecord,
  executeCheckpointRevert,
  seedThreadForkSource,
} from "./lifecycleThreadMutations.ts";

import { buildTurnTimingStory } from "./timingFixtures.ts";
import {
  longFindReplyItem,
  transcriptCodeItems,
  transcriptEditableFileItems,
  transcriptFileItems,
  transcriptHtmlVisualItems,
  transcriptImageItems,
  transcriptMcpAppItems,
  transcriptPdfItems,
  transcriptSourceLinkItems,
  transcriptVideoItems,
  transcriptWideTableItems,
} from "./lifecycleTranscriptFixtures.ts";
import {
  applyDesktopProjectActionsEdit,
  applyProjectActionsFixture,
  applyProjectCommand,
  LabProjectNotesStore,
  verifyProjectActionsSaved,
} from "./lifecycleProjectState.ts";

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
  private readonly notesStore = new LabProjectNotesStore();
  private pendingSteer: Record<string, unknown> | null = null;
  private goal: Record<string, unknown> | null = null;
  threadHistoryChangesEnabled = false;
  /** Authoritative live roster; the snapshot carries it so reconnect never
   * resurrects a drained list from a stale event. */
  private backgroundTasks: readonly BackgroundTaskFixtureTask[] = [];
  private readonly attachments = new Map<string, Buffer>();
  private readonly pendingFollowUps = new Set<string>();
  private readonly projectMcpServers = new Map<string, unknown[]>();
  readonly composerTools = new LabComposerToolsState(this.projectMcpServers);
  readonly sideChats = new LabSideChatState();
  readonly threadForks = new LabThreadForkState();
  composerPreferencesEnabled = false;
  providerHandoffEnabled = false;
  toolPresentationEnabled = false;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.composerPreferencesEnabled = false;
    this.providerHandoffEnabled = false;
    this.toolPresentationEnabled = false;
    this.threadHistoryChangesEnabled = false;
    const shell = readFixture("shell-snapshot.json");
    const history = readFixture("thread-history.json");
    this.projects = structuredClone(shell.projects as Array<Record<string, unknown>>);
    this.importedThreads.clear();
    this.sideChats.reset();
    this.threadForks.reset();
    this.importedPrompts.clear();
    this.thread = structuredClone(history.thread as Record<string, unknown>);
    this.runtimeItems = structuredClone(history.runtimeItems as Array<Record<string, unknown>>);
    this.completedTurns = structuredClone(history.completedTurns as unknown[]);
    this.contextUsage = structuredClone(history.contextUsage);
    this.runtimeSummariesByThread = structuredClone(
      shell.runtimeSummariesByThread as Record<string, unknown>,
    );
    this.notesStore.reset();
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
        ...this.threadForks.rows(),
        ...structuredClone([...this.importedThreads.values()]),
      ],
      runtimeSummariesByThread: structuredClone(this.runtimeSummariesByThread),
      updatedAt: FIXTURE_TIME,
    };
  }

  prepareArchivedThreads(label: string): void {
    const pair = buildArchivedThreadPair(this.thread, label);
    this.thread = pair.current;
    this.importedThreads.set(pair.olderId, pair.older);
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

  renameFixtureProject(name: string): void {
    const project = this.projects[0];
    if (project) project.name = name;
  }

  prepareTerminalThread(): void {
    this.thread = { ...this.thread, presentationMode: "terminal" };
  }

  prepareProjectActions(): void {
    applyProjectActionsFixture(this.projects);
  }

  editProjectActionsFromDesktop(): void {
    applyDesktopProjectActionsEdit(this.projects);
  }

  assertProjectActionsSaved(): void {
    verifyProjectActionsSaved(this.projects);
  }

  prepareLongFindReply(): void {
    this.runtimeItems.push(longFindReplyItem());
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

  prepareTranscriptFile(): void {
    this.setFinishedItems(transcriptFileItems());
  }
  prepareTranscriptEditableFiles(): void {
    this.setFinishedItems(transcriptEditableFileItems());
  }
  prepareTranscriptVideo(): void {
    this.setFinishedItems(transcriptVideoItems());
  }
  prepareTranscriptPdf(): void {
    this.setFinishedItems(transcriptPdfItems());
  }
  prepareTranscriptHtmlVisual(): void {
    this.setFinishedItems(transcriptHtmlVisualItems());
  }
  prepareTranscriptMcpApp(): void {
    this.setFinishedItems(transcriptMcpAppItems());
  }
  prepareThreadHistoryChanges(): void {
    this.threadHistoryChangesEnabled = true;
  }
  prepareTranscriptWideTable(): void {
    this.setFinishedItems(transcriptWideTableItems());
  }
  prepareTranscriptCode(): void {
    this.setFinishedItems(transcriptCodeItems());
  }

  private setFinishedItems(items: Array<Record<string, unknown>>): void {
    this.thread.status = "finished";
    this.thread.attention = "none";
    this.runtimeItems = items;
  }

  setFixtureApproval(event: Record<string, unknown>): void {
    this.runtimeItems = applyFixtureApproval(event, this.thread, this.runtimeItems);
  }

  prepareTranscriptSourceLink(): void {
    this.setFinishedItems(transcriptSourceLinkItems());
  }

  prepareTranscriptImage(withGallery = false): void {
    this.setFinishedItems(transcriptImageItems(withGallery));
  }

  prepareToolPresentation(options?: Parameters<typeof toolPresentationItems>[0]): void {
    this.toolPresentationEnabled = true;
    this.thread.status = "finished";
    this.thread.attention = "none";
    delete this.thread.activeTurnStartedAt;
    this.runtimeItems = toolPresentationItems(options);
  }

  prepareSameFileEdits(): void {
    this.prepareToolPresentation();
    this.runtimeItems = sameFileEditPresentationItems();
  }

  updateToolPresentation(): Record<string, unknown> {
    return updateToolPresentationItems(this.runtimeItems, FIXTURE_THREAD_ID);
  }

  advanceToolActivity(checkpoint: Parameters<typeof applyStreamingToolActivity>[0]) {
    return applyStreamingToolActivity(checkpoint, this.thread, this.runtimeItems);
  }

  prepareSideChat(): void {
    this.sideChats.enabled = true;
    this.thread = buildSideChatThread(this.thread, this.runtimeItems);
  }

  prepareCrews(): void {
    this.thread = buildCrewsThread(this.thread);
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
    const fork = threadId ? this.threadForks.snapshot(threadId, snapshotSeq) : undefined;
    if (fork) return fork;
    const side = threadId ? this.sideChats.history(threadId, snapshotSeq) : undefined;
    if (side) return side;
    const imported = threadId ? this.importedThreads.get(threadId) : undefined;
    if (imported && threadId) {
      return buildImportedHistorySnapshot(
        imported,
        threadId,
        this.importedPrompts.get(String(imported.id)) ?? "",
        snapshotSeq,
        FIXTURE_TIME,
      );
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
      this.sideChats.has(threadId) ||
      this.threadForks.has(threadId)
    );
  }

  prepareThreadForks(): void {
    if (this.threadForks.enabled) return;
    this.threadForks.enabled = true;
    seedThreadForkSource(this.runtimeItems, this.completedTurns);
  }

  importSession(threadId: string, body: Record<string, unknown>): void {
    if (this.hasThread(threadId))
      throw new LabHttpError("thread_already_exists", "Thread already exists.", 409);
    const created = createImportedThreadRecord(
      threadId,
      body,
      this.thread,
      this.projects,
      FIXTURE_TIME,
    );
    this.importedPrompts.set(threadId, created.prompt);
    this.importedThreads.set(threadId, created.thread);
  }

  startProviderHandoff(threadId: string, body: Record<string, unknown>): void {
    if (this.hasThread(threadId))
      throw new LabHttpError("thread_already_exists", "Thread already exists.", 409);
    const created = createProviderHandoffRecord(threadId, body, this.projects, FIXTURE_TIME);
    this.importedPrompts.set(threadId, created.prompt);
    this.importedThreads.set(threadId, created.thread);
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
    return applyProjectCommand(
      this.projects,
      this.projectMcpServers,
      command,
      this.composerPreferencesEnabled,
      FIXTURE_TIME,
    );
  }

  projectSettings(projectId: string): Record<string, unknown> | null {
    if (!this.projects.some((project) => project.id === projectId)) return null;
    return { mcpServers: structuredClone(this.projectMcpServers.get(projectId) ?? []) };
  }

  readNotes(projectId: string): ReturnType<typeof projectNotesReadResultSchema.parse> {
    return this.notesStore.read(this.projects, projectId);
  }

  prepareProjectNotes(text = "Notes from the paired desktop"): void {
    this.notesStore.prepare(text, FIXTURE_TIME);
  }

  writeNotes(projectId: string, body: Record<string, unknown>): ProjectNotesSaveResult | undefined {
    return this.notesStore.write(this.projects, projectId, body, FIXTURE_TIME);
  }

  prepareProviderSwitchSource(): void {
    this.thread = {
      ...this.thread,
      sessionRef: { providerSessionId: "fixture-outgoing-session", discoveredAt: FIXTURE_TIME },
    };
  }

  start(body: Record<string, unknown>): Record<string, unknown> {
    const handoff = body.providerSwitch as Record<string, unknown> | undefined;
    if (handoff) {
      this.thread = applyProviderSwitchHandoff(
        body,
        handoff,
        this.thread,
        this.runtimeItems,
        FIXTURE_TIME,
        (msg) => this.send(msg),
      );
    }
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
    this.thread = applyThreadCommand(this.thread, body);
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
  checkpointRevert(itemId: string) {
    const reverted = executeCheckpointRevert(this.runtimeItems, itemId);
    this.runtimeItems = reverted.runtimeItems;
    return reverted.result;
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
    return collectFollowUpRoutes(this.pendingFollowUps, evidenceRouteId);
  }
}
