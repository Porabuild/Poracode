import type { RuntimeEvent } from "@/shared/contracts";
import type { LiveVoiceEvent } from "@/shared/contracts/liveVoice";

/** Keeps provider transcript framing out of shared runtime and renderer state. */
export class CodexVoiceTranscript {
  private readonly text = new Map<"user" | "assistant", string>();
  private readonly timelineText = new Map<string, string>();
  private readonly timelineRole = new Map<string, "user" | "assistant">();
  private timelineSeen = false;
  private sequence = 0;

  constructor(
    private readonly threadId: string,
    private readonly connectionId: string,
    private readonly emit: (event: LiveVoiceEvent) => void,
    private readonly emitRuntime: (events: RuntimeEvent[]) => void,
  ) {}

  handle(method: string, params: Record<string, unknown>): void {
    if (method.startsWith("thread/realtime/item/")) {
      const raw = params.item;
      if (raw && typeof raw === "object") {
        const item = raw as Record<string, unknown>;
        if (
          typeof item.realtimeSessionId === "string" &&
          item.realtimeSessionId !== this.connectionId
        )
          return;
        if (item.type !== "transcriptSegment" || typeof item.id !== "string") return;
        if (item.role !== "user" && item.role !== "assistant") return;
        this.timelineSeen = true;
        const text =
          typeof item.text === "string" && item.text.length
            ? item.text
            : (this.timelineText.get(item.id) ?? "");
        const itemId = `voice-${item.id}`;
        if (method.endsWith("/started")) {
          this.timelineText.set(item.id, text);
          this.timelineRole.set(item.id, item.role);
          this.emitRuntime([this.started(itemId, item.role, text)]);
          this.emit({
            connectionId: this.connectionId,
            type: "transcript",
            role: item.role,
            text,
            final: false,
          });
        } else if (method.endsWith("/completed")) {
          const started = this.timelineText.has(item.id);
          this.timelineText.delete(item.id);
          this.timelineRole.delete(item.id);
          this.emitRuntime([
            ...(!started ? [this.started(itemId, item.role, text)] : []),
            {
              type: "item.completed",
              threadId: this.threadId,
              itemId,
              payload: this.payload(text),
            },
          ]);
          this.emit({
            connectionId: this.connectionId,
            type: "transcript",
            role: item.role,
            text,
            final: true,
          });
        }
      } else if (typeof params.itemId === "string" && typeof params.delta === "string") {
        if (!this.timelineText.has(params.itemId)) return;
        const text = (this.timelineText.get(params.itemId) ?? "") + params.delta;
        this.timelineText.set(params.itemId, text);
        const role = this.timelineRole.get(params.itemId);
        if (role)
          this.emit({
            connectionId: this.connectionId,
            type: "transcript",
            role,
            text,
            final: false,
          });
        this.emitRuntime([
          {
            type: "item.updated",
            threadId: this.threadId,
            itemId: `voice-${params.itemId}`,
            payload: this.payload(text),
          },
        ]);
      }
      return;
    }
    if (!method.startsWith("thread/realtime/transcript/")) return;
    const role = params.role;
    if (role !== "user" && role !== "assistant") return;
    const final = method.endsWith("/done");
    const text = final
      ? typeof params.text === "string"
        ? params.text
        : (this.text.get(role) ?? "")
      : (this.text.get(role) ?? "") + (typeof params.delta === "string" ? params.delta : "");
    this.emit({ connectionId: this.connectionId, type: "transcript", role, text, final });
    if (final) {
      this.text.delete(role);
      // Older CLI/history modes publish only flat final transcripts. Persist
      // complete segments, never speculative deltas; newer canonical timelines
      // own their ids and bypass this fallback to avoid duplicate chat rows.
      if (!this.timelineSeen && text.trim()) {
        const itemId = `voice-${this.connectionId}-${++this.sequence}`;
        this.emitRuntime([
          this.started(itemId, role, text),
          { type: "item.completed", threadId: this.threadId, itemId },
        ]);
      }
    } else {
      this.text.set(role, text);
    }
  }

  /** Settle any segment cut short by transport closure or hangup. */
  finish(): void {
    const events: RuntimeEvent[] = [...this.timelineText].map(([id, text]) => ({
      type: "item.completed",
      threadId: this.threadId,
      itemId: `voice-${id}`,
      payload: this.payload(text),
    }));
    this.timelineText.clear();
    this.timelineRole.clear();
    this.text.clear();
    if (events.length) this.emitRuntime(events);
  }

  private payload(text: string) {
    return { content: [{ kind: "text", text }], displayAuthoritative: true, turnIndependent: true };
  }

  private started(itemId: string, role: "user" | "assistant", text: string): RuntimeEvent {
    return {
      type: "item.started",
      threadId: this.threadId,
      itemId,
      itemType: role === "user" ? "user_message" : "assistant_message",
      payload: this.payload(text),
    };
  }
}
