import { LabHttpError } from "./labAuth.ts";
import { buildRuntimeEvent } from "./labFixtures.ts";

/** Opt-in auxiliary conversations. Captured private inputs are test memory,
 * never part of the painted history, shell rows or control-plane journal. */
export class LabSideChatState {
  enabled = false;
  private readonly children = new Map<string, Record<string, unknown>>();
  private readonly items = new Map<string, Array<Record<string, unknown>>>();
  private readonly commands = new Map<string, string>();
  private inputs: Array<{ threadId: string; body: Record<string, unknown> }> = [];

  reset(): void {
    this.enabled = false;
    this.children.clear();
    this.items.clear();
    this.commands.clear();
    this.inputs = [];
  }
  rows(): Array<Record<string, unknown>> {
    return structuredClone([...this.children.values()]);
  }
  has(threadId: string): boolean {
    return this.children.has(threadId);
  }
  submissions(): ReadonlyArray<{ threadId: string; body: Record<string, unknown> }> {
    return structuredClone(this.inputs);
  }

  start(
    threadId: string,
    body: Record<string, unknown>,
    commandId: string,
    parent: Record<string, unknown>,
  ): void {
    if (!commandId || body.parentThreadId !== parent.id)
      throw new LabHttpError("invalid_side_chat", "Invalid side chat source.", 400);
    const wire = JSON.stringify({ threadId, body });
    const previous = this.commands.get(commandId);
    if (previous) {
      if (previous !== wire)
        throw new LabHttpError("command_id_conflict", "Command payload changed.", 409);
      return;
    }
    this.commands.set(commandId, wire);
    const {
      sessionRef: _oldSession,
      agentInstanceId: _oldInstance,
      activeTurnStartedAt: _oldTurn,
      ...base
    } = parent;
    const now = new Date().toISOString();
    this.children.set(threadId, {
      ...structuredClone(base),
      id: threadId,
      title: body.title,
      agentKind: body.agentKind,
      config: body.config,
      parentThreadId: parent.id,
      ...(typeof body.agentInstanceId === "string"
        ? { agentInstanceId: body.agentInstanceId }
        : {}),
      presentationMode: "gui",
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      createdAt: now,
      updatedAt: now,
      sessionRef: { providerSessionId: `side-${threadId}`, discoveredAt: now },
    });
    this.items.set(threadId, []);
    this.send(threadId, body);
  }

  send(threadId: string, body: Record<string, unknown>): Array<Record<string, unknown>> {
    if (!this.has(threadId)) throw new LabHttpError("not_found", "Side chat not found.", 404);
    this.inputs.push({ threadId, body: structuredClone(body) });
    const rows = this.items.get(threadId)!;
    const turn = `side-turn-${rows.length}`;
    const userId = String(body.userMessageItemId ?? `side-user-${rows.length}`),
      answerId = `side-answer-${rows.length}`;
    const textSegments = Array.isArray(body.segments)
      ? body.segments.filter(
          (value): value is Record<string, unknown> =>
            value !== null &&
            typeof value === "object" &&
            (value as Record<string, unknown>).kind === "text",
        )
      : [];
    const userPayload = {
      content:
        textSegments.length > 0
          ? textSegments.map((segment) => ({
              kind: "text",
              text: String(segment.content),
              ...(segment.selection === true ? { selection: true } : {}),
            }))
          : [{ kind: "text", text: String(body.prompt) }],
    };
    const answer = `Side reply: ${String(body.prompt)}`;
    rows.push(
      { id: userId, type: "user_message", state: "completed", payload: userPayload, streams: {} },
      {
        id: answerId,
        type: "assistant_message",
        state: "completed",
        payload: { content: [] },
        streams: { assistant_text: answer },
      },
    );
    return [
      { ...buildRuntimeEvent("turn.started", threadId), turnId: turn },
      {
        ...buildRuntimeEvent("item.started", threadId),
        turnId: turn,
        itemId: userId,
        itemType: "user_message",
        payload: userPayload,
      },
      {
        ...buildRuntimeEvent("item.completed", threadId),
        turnId: turn,
        itemId: userId,
        payload: userPayload,
      },
      {
        ...buildRuntimeEvent("item.started", threadId),
        turnId: turn,
        itemId: answerId,
        itemType: "assistant_message",
        payload: { content: [] },
      },
      {
        ...buildRuntimeEvent("content.delta", threadId),
        turnId: turn,
        itemId: answerId,
        stream: "assistant_text",
        delta: answer,
      },
      {
        ...buildRuntimeEvent("item.completed", threadId),
        turnId: turn,
        itemId: answerId,
        payload: { content: [] },
      },
      { ...buildRuntimeEvent("turn.completed", threadId), turnId: turn },
    ];
  }

  history(threadId: string, snapshotSeq: number): Record<string, unknown> | undefined {
    const thread = this.children.get(threadId);
    if (!thread) return undefined;
    return {
      snapshotSeq,
      thread: structuredClone(thread),
      runtimeItems: structuredClone(this.items.get(threadId)),
      runtimeNextCursor: null,
      completedTurns: [],
      completedTurnsNextCursor: null,
      contextUsage: null,
      backgroundTasks: [],
      updatedAt: new Date().toISOString(),
    };
  }

  historyItems(
    threadId: string,
    before: number | undefined,
    limit: number,
  ): Record<string, unknown> {
    const rows = this.items.get(threadId) ?? [];
    const end = before ?? rows.length,
      start = Math.max(0, end - limit);
    return { items: structuredClone(rows.slice(start, end)), nextCursor: start > 0 ? start : null };
  }

  remove(threadId: string): void {
    this.children.delete(threadId);
    this.items.delete(threadId);
  }
}
