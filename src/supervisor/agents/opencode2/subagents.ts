import type { RuntimeEvent } from "@/shared/contracts";
import type { V2Event } from "./clientTypes";
import { readNonNegativeInteger } from "../contextUsage";
import { openCode2ToolPayload, type OpenCode2ToolItemState } from "./toolPayload";
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
  parentTool?: OpenCode2ToolItemState;
  /** Stable rows seen across every continuation of this native session. */
  itemIds: Set<string>;
  /** New rows attached to the current parent invocation. */
  stepCount: number;
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
    if (!child.parentTool) {
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
      if (child.parentTool)
        events.push(...this.tag(closeOpenCode2Items(child.state), child.parentTool.itemId));
    }
    this.children.clear();
    return events;
  }

  private ensure(sessionID: string): ChildSession {
    let child = this.children.get(sessionID);
    if (!child) {
      const state = createOpenCode2MapperState(this.root.threadId);
      setOpenCode2SessionId(state, sessionID, { fresh: true });
      child = { state, pending: [], itemIds: new Set(), stepCount: 0 };
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
    if (child.parentTool && child.parentTool.itemId !== tool.itemId) child.stepCount = 0;
    child.parentTool = tool;
    const pending = child.pending;
    child.pending = [];
    return [...pending.flatMap((entry) => this.map(entry)), ...this.updateProgress(child)];
  }

  private mapChild(child: ChildSession, event: V2Event): RuntimeEvent[] {
    const events = this.tag(mapOpenCode2Event(event, child.state), child.parentTool!.itemId);
    // Native operation replays can reannounce a stable canonical row.
    for (const entry of events) {
      if (entry.type !== "item.started" || child.itemIds.has(entry.itemId)) continue;
      child.itemIds.add(entry.itemId);
      child.stepCount += 1;
    }
    // Child rows are gated while their panel is closed. Publish the count on
    // the parent tool as well so the main transcript still sees live progress.
    events.push(...this.updateProgress(child));
    return events;
  }

  private updateProgress(child: ChildSession): RuntimeEvent[] {
    const parent = child.parentTool;
    const stepCount = child.stepCount;
    if (!parent || stepCount <= (readNonNegativeInteger(parent.progress.stepCount) ?? 0)) return [];
    parent.progress = { ...parent.progress, stepCount };
    return [
      {
        type: "item.updated",
        threadId: this.root.threadId,
        itemId: parent.itemId,
        payload: openCode2ToolPayload(parent),
      },
    ];
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
