import type { RuntimeEvent } from "@/shared/contracts";
import type { V2Event } from "./clientTypes";
import {
  closeOpenCode2Items,
  createOpenCode2MapperState,
  mapOpenCode2Event,
  readOpenCode2EventSessionID,
  setOpenCode2SessionId,
  type OpenCode2MapperState,
} from "./eventMapping";

interface ChildSession {
  state: OpenCode2MapperState;
  parentItemId?: string;
  pending: V2Event[];
}

/** V2 child sessions are correlated by the native subagent tool's sessionID metadata. */
export class OpenCode2Subagents {
  private readonly children = new Map<string, ChildSession>();

  constructor(private readonly root: OpenCode2MapperState) {}

  owns(sessionID: string): boolean {
    return this.children.has(sessionID);
  }

  accepts(event: V2Event): boolean {
    const sessionID = readOpenCode2EventSessionID(event);
    return (
      sessionID === this.root.sessionID ||
      (sessionID !== undefined && this.owns(sessionID)) ||
      (event.type === "session.created" &&
        (event.data.parentID === this.root.sessionID ||
          (event.data.parentID !== undefined && this.owns(event.data.parentID))))
    );
  }

  map(event: V2Event): RuntimeEvent[] {
    const sessionID = readOpenCode2EventSessionID(event);
    if (!sessionID) return [];
    if (event.type === "session.created" && sessionID !== this.root.sessionID)
      this.ensure(sessionID);
    if (sessionID === this.root.sessionID) return this.link(event, this.root);
    const child = this.children.get(sessionID);
    if (!child) return [];
    if (!child.parentItemId) {
      child.pending.push(event);
      return [];
    }
    const events = this.mapChild(child, event);
    events.push(...this.link(event, child.state));
    return events;
  }

  sessionIds(): string[] {
    return [...this.children.keys()];
  }

  close(): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];
    for (const child of this.children.values()) {
      if (child.parentItemId)
        events.push(...this.tag(closeOpenCode2Items(child.state), child.parentItemId));
    }
    this.children.clear();
    return events;
  }

  private ensure(sessionID: string): ChildSession {
    let child = this.children.get(sessionID);
    if (!child) {
      const state = createOpenCode2MapperState(this.root.threadId);
      setOpenCode2SessionId(state, sessionID, { fresh: true });
      child = { state, pending: [] };
      this.children.set(sessionID, child);
    }
    return child;
  }

  private link(event: V2Event, parent: OpenCode2MapperState): RuntimeEvent[] {
    if (
      event.type !== "session.tool.progress" &&
      event.type !== "session.tool.success" &&
      event.type !== "session.tool.failed"
    )
      return [];
    const childID = event.data.metadata?.sessionID;
    if (typeof childID !== "string") return [];
    const tool = parent.messages.get(event.data.assistantMessageID)?.tools.get(event.data.id);
    if (!tool || !["task", "subagent"].includes(tool.name.toLowerCase())) return [];
    const child = this.ensure(childID);
    child.parentItemId = tool.itemId;
    const pending = child.pending;
    child.pending = [];
    return pending.flatMap((entry) => this.map(entry));
  }

  private mapChild(child: ChildSession, event: V2Event): RuntimeEvent[] {
    return this.tag(mapOpenCode2Event(event, child.state), child.parentItemId!);
  }

  private tag(events: RuntimeEvent[], parentItemId: string): RuntimeEvent[] {
    // Child turn/usage lifecycle must never settle or inflate the parent turn.
    return events.flatMap<RuntimeEvent>((event) => {
      if (event.type === "item.started") return [{ ...event, parentItemId }];
      if (
        event.type === "item.updated" ||
        event.type === "item.completed" ||
        event.type === "content.delta" ||
        event.type === "request.opened" ||
        event.type === "request.resolved"
      )
        return [event];
      return [];
    });
  }
}
