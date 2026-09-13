import type { OpenCode2Client, SessionMessageInfo, V2Event } from "./clientTypes";
import { readOpenCode2Messages } from "./history";

/** Snapshots are authoritative; incomplete text is repaired by its eventual ended event. */
export function openCode2SnapshotEvents(
  sessionID: string,
  messages: SessionMessageInfo[],
): V2Event[] {
  const events: V2Event[] = [];
  const push = (type: V2Event["type"], data: object) => {
    events.push({
      id: "recovery",
      created: Date.now(),
      type,
      data: { sessionID, ...data },
    } as V2Event);
  };
  for (const message of messages) {
    if (message.type !== "assistant") continue;
    const base = { assistantMessageID: message.id };
    message.content.forEach((part, ordinal) => {
      if (part.type === "text" || part.type === "reasoning") {
        if (message.time.completed === undefined) return;
        push(part.type === "text" ? "session.text.ended" : "session.reasoning.ended", {
          ...base,
          ordinal,
          text: part.text,
        });
      } else {
        push("session.tool.input.started", { ...base, id: part.id, name: part.name });
        if (part.state.status !== "streaming")
          push("session.tool.called", { ...base, id: part.id, input: part.state.input });
        if (part.state.status === "running")
          push("session.tool.progress", { ...base, id: part.id, metadata: part.state.metadata });
        if (part.state.status === "completed")
          push("session.tool.success", {
            ...base,
            id: part.id,
            content: part.state.content,
            metadata: part.state.metadata,
          });
        if (part.state.status === "error")
          push("session.tool.failed", {
            ...base,
            id: part.id,
            error: part.state.error,
            content: part.state.content,
            metadata: part.state.metadata,
          });
      }
    });
    if (message.time.completed !== undefined)
      push("session.step.ended", { ...base, tokens: message.tokens });
  }
  return events;
}

export async function readOpenCode2Recovery(client: OpenCode2Client, sessionID: string) {
  const options = { signal: AbortSignal.timeout(30_000) };
  const since = Date.now();
  const [messages, permissions, forms] = await Promise.all([
    readOpenCode2Messages(client, sessionID),
    client.permission.list({ sessionID }, options),
    client.form.list({ sessionID }, options),
  ]);
  const [active, session] = await Promise.all([
    client.session.active(options),
    client.session.get({ sessionID }, options),
  ]);
  return {
    since,
    // Idle is observed after the first history read. A turn can finish between
    // those reads, so fetch its committed final content before settling streams.
    messages: active[sessionID] ? messages : await readOpenCode2Messages(client, sessionID),
    permissions,
    forms,
    active: Boolean(active[sessionID]),
    outcome: session.outcome,
  };
}
