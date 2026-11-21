import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";
import { RUNTIME_REQUEST_ITEM_TYPE } from "../../../src/shared/contracts/runtimeEvent.ts";
import { CREW_FIXTURE } from "./crewFixtures.ts";
import { LabHttpError } from "./labAuth.ts";
import { FIXTURE_THREAD_ID } from "./labFixtures.ts";
import { streamingToolActivity } from "./toolPresentationFixtures.ts";

export function applyFixtureApproval(
  event: Record<string, unknown>,
  thread: Record<string, unknown>,
  runtimeItems: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const { requestId, requestType, payload } = event;
  const open = event.type === "request.opened";
  const itemId = `${RUNTIME_REQUEST_ITEM_TYPE}:${String(requestId)}`;
  const next = runtimeItems.filter(({ id }) => id !== itemId);
  if (open) {
    next.push({
      id: itemId,
      type: RUNTIME_REQUEST_ITEM_TYPE,
      state: "started",
      payload: { requestId, requestType, payload },
      streams: {},
    });
  }
  thread.status = open ? "needs_approval" : "finished";
  thread.attention = open ? "needs_approval" : "none";
  return next;
}

export function buildSideChatThread(
  thread: Record<string, unknown>,
  runtimeItems: Array<Record<string, unknown>>,
): Record<string, unknown> {
  runtimeItems.push({
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
  return {
    ...thread,
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    worktreePath: "/Users/fixture/project/.worktrees/review",
    worktreeBranch: "feature/native-review",
  };
}

export function buildArchivedThreadPair(
  thread: Record<string, unknown>,
  label: string,
): { current: Record<string, unknown>; olderId: string; older: Record<string, unknown> } {
  const current = {
    ...thread,
    title: `${label} recent archive`,
    archived: true,
    archivedAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z",
  };
  const olderId = "thread-fixture-archive-older";
  const older = {
    ...current,
    id: olderId,
    title: `${label} older archive`,
    archivedAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-18T12:00:00.000Z",
  };
  return { current, olderId, older };
}

export function seedThreadForkSource(
  runtimeItems: Array<Record<string, unknown>>,
  completedTurns: unknown[],
): void {
  runtimeItems.push({
    id: "later-source-reply",
    type: "assistant_message",
    state: "completed",
    payload: { content: [{ kind: "text", text: "Later source reply" }] },
    streams: { assistant_text: "Later source reply" },
  });
  completedTurns.push({
    startedAt: "2026-08-12T10:02:10.000Z",
    endedAt: "2026-08-12T10:02:12.000Z",
    anchorItemId: "later-source-reply",
  });
}

export function applyProviderSwitchHandoff(
  body: Record<string, unknown>,
  handoff: Record<string, unknown>,
  thread: Record<string, unknown>,
  runtimeItems: Array<Record<string, unknown>>,
  fixtureTime: string,
  sendMessage: (body: Record<string, unknown>) => void,
): Record<string, unknown> {
  if (body.threadId !== thread.id || handoff.fromAgentKind !== thread.agentKind) {
    throw new LabHttpError("provider_switch_stale", "Fixture source provider changed.", 409);
  }
  runtimeItems.push({
    id: "fixture-provider-handoff",
    type: "provider_handoff",
    state: "completed",
    payload: {
      fromAgentKind: handoff.fromAgentKind,
      toAgentKind: body.agentKind,
      at: fixtureTime,
    },
    streams: {},
  });
  sendMessage(body);
  return {
    ...thread,
    sessionRef: { providerSessionId: "fixture-incoming-session", discoveredAt: fixtureTime },
  };
}

export function buildImportedHistorySnapshot(
  imported: Record<string, unknown>,
  threadId: string,
  prompt: string,
  snapshotSeq: number,
  fixtureTime: string,
): Record<string, unknown> {
  return {
    snapshotSeq,
    thread: structuredClone(imported),
    runtimeItems: [
      {
        id: `import-${threadId}`,
        type: "user_message",
        state: "completed",
        payload: { prompt },
        streams: {},
      },
    ],
    completedTurns: [],
    contextUsage: null,
    updatedAt: fixtureTime,
  };
}

export function applyStreamingToolActivity(
  checkpoint: Parameters<typeof streamingToolActivity>[0],
  thread: Record<string, unknown>,
  runtimeItems: Array<Record<string, unknown>>,
) {
  const events = streamingToolActivity(checkpoint, FIXTURE_THREAD_ID);
  // Reconnect and fold-driven history reads must see the same items that
  // the live socket already delivered.
  for (const event of events) {
    if (event.type === "item.started") {
      if (!runtimeItems.some(({ id }) => id === event.itemId)) {
        runtimeItems.push({
          id: event.itemId,
          type: event.itemType,
          state: "started",
          payload: event.payload,
          streams: {},
        });
      }
    } else if (event.type === "item.completed") {
      const item = runtimeItems.find(({ id }) => id === event.itemId);
      if (item) item.state = "completed";
    } else if (event.type === "content.delta") {
      const item = runtimeItems.find(({ id }) => id === event.itemId);
      if (item && typeof event.stream === "string" && typeof event.delta === "string") {
        const streams = item.streams as Record<string, string>;
        streams[event.stream] = (streams[event.stream] ?? "") + event.delta;
      }
    } else if (event.type === "turn.started") {
      thread.status = "working";
      thread.activeTurnStartedAt = new Date().toISOString();
    } else if (event.type === "turn.completed") {
      thread.status = "finished";
      delete thread.activeTurnStartedAt;
    }
  }
  return events;
}

export function buildCrewsThread(thread: Record<string, unknown>): Record<string, unknown> {
  return {
    ...thread,
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

export function createImportedThreadRecord(
  threadId: string,
  body: Record<string, unknown>,
  baseThread: Record<string, unknown>,
  projects: Array<Record<string, unknown>>,
  fixtureTime: string,
): { prompt: string; thread: Record<string, unknown> } {
  const source = REMOTE_PROCEDURE_RESULT_FIXTURES.listImportableSessions.sessions.find(
    (session) =>
      session.path === body.path &&
      session.agentKind === body.agentKind &&
      session.providerSessionId === body.providerSessionId,
  );
  if (!source) throw new LabHttpError("not_found", "Session not found.", 404);
  if (!projects.some((project) => project.id === body.projectId)) {
    throw new LabHttpError("not_found", "Project not found.", 404);
  }
  return {
    prompt: source.preview,
    thread: {
      ...structuredClone(baseThread),
      id: threadId,
      projectId: body.projectId,
      agentKind: body.agentKind,
      title: body.title,
      status: "inactive",
      attention: "none",
      config: { model: body.model, importedFrom: { path: body.path, importedAt: fixtureTime } },
      sessionRef: { providerSessionId: body.providerSessionId, discoveredAt: fixtureTime },
    },
  };
}

export function createProviderHandoffRecord(
  threadId: string,
  body: Record<string, unknown>,
  projects: Array<Record<string, unknown>>,
  fixtureTime: string,
): { prompt: string; thread: Record<string, unknown> } {
  if (!projects.some((project) => project.id === body.projectId)) {
    throw new LabHttpError("not_found", "Handoff project not found.", 404);
  }
  return {
    prompt: String(body.prompt),
    thread: {
      id: threadId,
      projectId: body.projectId,
      title: body.title ?? "Continued thread",
      agentKind: body.agentKind,
      config: body.config,
      presentationMode: body.presentationMode,
      status: "idle",
      attention: "none",
      groupId: body.groupId,
      groupName: body.groupName,
      createdAt: fixtureTime,
      updatedAt: fixtureTime,
    },
  };
}

export function applyThreadCommand(
  thread: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  switch (body.kind) {
    case "rename":
      return { ...thread, title: body.title };
    case "set-done":
      return body.done
        ? { ...thread, done: true, starred: false, status: "inactive", attention: "none" }
        : { ...thread, done: false };
    case "set-starred":
      return { ...thread, starred: body.starred };
    case "archive":
      return { ...thread, archived: true };
    case "unarchive":
      return { ...thread, archived: false };
    default:
      return thread;
  }
}

export function executeCheckpointRevert(
  runtimeItems: Array<Record<string, unknown>>,
  itemId: string,
): {
  runtimeItems: Array<Record<string, unknown>>;
  result: {
    outcome: "completed";
    replayed: boolean;
    numTurns: number;
    providerPhase: "completed";
    filesPhase: "completed";
    truncatePhase: "completed" | "noop";
    removedCompletedTurnAnchors: string[];
  };
} {
  const index = runtimeItems.findIndex((item) => item.id === itemId);
  const removed = index >= 0 ? runtimeItems.slice(index + 1).map((item) => item.id) : [];
  const nextItems = index >= 0 ? runtimeItems.slice(0, index + 1) : runtimeItems;
  return {
    runtimeItems: nextItems,
    result: {
      outcome: "completed",
      replayed: false,
      numTurns: removed.length > 0 ? 1 : 0,
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: removed.length > 0 ? "completed" : "noop",
      removedCompletedTurnAnchors: [],
    },
  };
}

export function collectFollowUpRoutes(
  pendingFollowUps: Set<string>,
  evidenceRouteId: string,
): string[] {
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
  const matched = [...pendingFollowUps].filter((routeId) => eligible.has(routeId));
  for (const routeId of matched) pendingFollowUps.delete(routeId);
  return matched;
}
