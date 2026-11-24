import type { RuntimeEvent } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import type { V2Event } from "./clientTypes";
import { readNonNegativeInteger } from "../contextUsage";
import {
  closeOpenCodeItems,
  createOpenCodeMapperState,
  mapOpenCodeEvent,
  readOpenCodeEventSessionID,
  readSessionError,
  setOpenCodeSessionId,
  type OpenCodeMapperState,
} from "./eventMapping";
import { isDelegatedLaunch, openCodeToolPayload, type OpenCodeToolItemState } from "./toolPayload";

interface ChildSession {
  state: OpenCodeMapperState;
  parentTool?: OpenCodeToolItemState;
  /** Out-of-step operations can reannounce stable rows across continuations. */
  operationIds: Set<string>;
  /** Recovery can relink older invocations before returning to the active one. */
  stepCounts: WeakMap<OpenCodeToolItemState, number>;
  pending: V2Event[];
  /** Launch row held open while the child session runs on its own. */
  held?: OpenCodeToolItemState;
  /** True once the child's run ended and no launch has started it again. */
  runEnded?: boolean;
  /** Name of the last tool the child started, published on its launch row. */
  lastToolName?: string;
  /** Finished text parts of the child's latest step, kept as the launch row's result. */
  report?: { messageID: string; parts: Map<number, string> };
}

type RunOutcome = "completed" | "failed" | "cancelled";

/**
 * V2 child sessions are correlated by the native subagent tool's sessionID
 * metadata.
 *
 * The subagent call returns as soon as the child session is started
 * (`metadata.status: "running"`), so the call's own completion says nothing
 * about the child's work. The launch row is held open until the child session
 * reports the end of its run, which keeps the row, its dock entry and its
 * overlay live for as long as the child works.
 */
export class OpenCodeSubagents {
  private readonly children = new Map<string, ChildSession>();

  constructor(private readonly root: OpenCodeMapperState) {}

  owns(sessionID: string): boolean {
    return this.children.has(sessionID);
  }

  accepts(event: V2Event): boolean {
    const sessionID = readOpenCodeEventSessionID(event);
    return (
      sessionID === this.root.sessionID ||
      (sessionID !== undefined && this.owns(sessionID)) ||
      (event.type === "session.created" &&
        (event.data.parentID === this.root.sessionID ||
          (event.data.parentID !== undefined && this.owns(event.data.parentID))))
    );
  }

  /**
   * Every runtime event one server event produces for this thread, in emit
   * order. For the thread's own session that is its canonical rows, with a
   * background launch held open; for a child session it is the end of its run
   * for the launch row, then the child's own rows.
   */
  map(event: V2Event): RuntimeEvent[] {
    const sessionID = readOpenCodeEventSessionID(event);
    if (!sessionID) return [];
    if (event.type === "session.created" && sessionID !== this.root.sessionID)
      this.ensure(sessionID);
    if (sessionID === this.root.sessionID) {
      const canonical = this.admit(mapOpenCodeEvent(event, this.root), event, this.root);
      return [...canonical, ...this.link(event, this.root)];
    }
    const child = this.children.get(sessionID);
    if (!child) return [];
    const events = this.observe(child, event);
    if (!child.parentTool) {
      child.pending.push(event);
      return events;
    }
    events.push(...this.mapChild(child, event));
    events.push(...this.link(event, child.state));
    return events;
  }

  /**
   * Filter the canonical events of a `session.tool.success` that started or
   * continued a child session. Unless the call already waited for its child
   * (the server reports `metadata.status: "completed"`, or the child's run
   * ended before the call returned), the row's `item.completed` is withheld and
   * the row stays running until {@link OpenCodeSubagents.map} sees the end of
   * the child's run.
   */
  private admit(
    canonical: RuntimeEvent[],
    event: V2Event,
    owner: OpenCodeMapperState,
  ): RuntimeEvent[] {
    if (event.type !== "session.tool.success") return canonical;
    const metadata = event.data.metadata as { sessionID?: unknown; status?: unknown } | undefined;
    const childID = metadata?.sessionID;
    if (typeof childID !== "string" || metadata?.status === "completed") return canonical;
    const tool = owner.messages.get(event.data.assistantMessageID)?.tools.get(event.data.id);
    if (!tool || !isDelegatedLaunch(tool.name)) return canonical;
    const completion = canonical.findIndex(
      (entry) => entry.type === "item.completed" && entry.itemId === tool.itemId,
    );
    if (completion < 0 || tool.subAgentStatus !== undefined) return canonical;
    const child = this.ensure(childID);
    if (child.runEnded) return this.waitedLaunch(canonical, child, tool);
    // A later call that continues the same child supersedes the row of the
    // run it joined; that row must not stay running behind the new one.
    const superseded = child.held === tool ? [] : this.finish(child, "completed");
    child.held = tool;
    // Published for the row's whole life: its completion belongs to this
    // session, so a client that reads it back from storage must not treat a
    // still-running copy as an orphan of a dead session.
    tool.held = true;
    tool.background = true;
    return [
      ...superseded,
      ...canonical.flatMap((entry, index) => {
        if (index === completion) return [];
        // The row's own update was built before the hold; republish it as running.
        return entry.type === "item.updated" && entry.itemId === tool.itemId
          ? [{ ...entry, payload: openCodeToolPayload(tool) }]
          : [entry];
      }),
    ];
  }

  sessionIds(): string[] {
    return [...this.children.keys()];
  }

  /** Child sessions whose launch row is still held: they are working on their own. */
  heldSessionIds(): string[] {
    return [...this.children].filter(([, child]) => child.held).map(([sessionID]) => sessionID);
  }

  /**
   * Stream recovery: the server's active-session list is authoritative for a
   * child whose terminal event was missed. Its snapshot was already replayed,
   * so a held launch row settles with the child's final text.
   */
  reconcile(
    sessionID: string,
    snapshot: {
      active: boolean;
      outcome: "succeeded" | "failed" | "interrupted" | undefined;
      error: string | undefined;
    },
  ): RuntimeEvent[] {
    const child = this.children.get(sessionID);
    // The server records an outcome only once a run settles. Without one the
    // child has not run yet (a launch racing the reconnect), so the row waits.
    if (!child?.held || snapshot.active || snapshot.outcome === undefined) return [];
    if (snapshot.outcome === "succeeded") return this.finish(child, "completed");
    return this.finish(
      child,
      snapshot.outcome === "failed" ? "failed" : "cancelled",
      snapshot.error,
    );
  }

  close(): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];
    for (const child of this.children.values()) {
      // Descendants close first: completing a launch row releases the router's
      // gated child history, which must not strand an open child row.
      if (child.parentTool)
        events.push(...this.tag(closeOpenCodeItems(child.state), child.parentTool.itemId));
      events.push(...this.finish(child, "cancelled"));
    }
    this.children.clear();
    return events;
  }

  private ensure(sessionID: string): ChildSession {
    let child = this.children.get(sessionID);
    if (!child) {
      const state = createOpenCodeMapperState(this.root.threadId);
      setOpenCodeSessionId(state, sessionID, { fresh: true });
      child = { state, pending: [], operationIds: new Set(), stepCounts: new WeakMap() };
      this.children.set(sessionID, child);
    }
    return child;
  }

  /**
   * A call that waited for its child completes with the run's outcome, the
   * same way a held row does once its child reports the end of the run.
   */
  private waitedLaunch(
    canonical: RuntimeEvent[],
    child: ChildSession,
    tool: OpenCodeToolItemState,
  ): RuntimeEvent[] {
    tool.subAgentStatus = "completed";
    const report = childReport(child);
    if (report) tool.result = report;
    return canonical.map((entry) =>
      (entry.type === "item.updated" || entry.type === "item.completed") &&
      entry.itemId === tool.itemId
        ? { ...entry, payload: openCodeToolPayload(tool) }
        : entry,
    );
  }

  /** Track the child's run for its held launch row; its own rows come after. */
  private observe(child: ChildSession, event: V2Event): RuntimeEvent[] {
    switch (event.type) {
      case "session.execution.started":
        child.runEnded = false;
        return [];
      case "session.execution.succeeded":
        child.runEnded = true;
        return this.finish(child, "completed");
      case "session.execution.failed":
        child.runEnded = true;
        return this.finish(child, "failed", readSessionError(event.data.error));
      case "session.execution.interrupted":
        child.runEnded = true;
        return this.finish(child, "cancelled", msg("runtime.delegatedAgentInterrupted"));
      case "session.tool.input.started": {
        const name = event.data.name;
        if (typeof name === "string" && name.length > 0) child.lastToolName = name;
        return [];
      }
      case "session.text.ended": {
        const { assistantMessageID, ordinal, text } = event.data;
        if (typeof text !== "string" || text.trim().length === 0) return [];
        if (child.report?.messageID !== assistantMessageID)
          child.report = { messageID: assistantMessageID, parts: new Map() };
        child.report.parts.set(ordinal, text);
        return [];
      }
      default:
        return [];
    }
  }

  /** Settle the child's held launch row with how its run ended. */
  private finish(child: ChildSession, outcome: RunOutcome, error?: string): RuntimeEvent[] {
    const tool = child.held;
    delete child.held;
    if (!tool) return [];
    delete tool.held;
    if (outcome === "completed") {
      tool.subAgentStatus = "completed";
      const report = childReport(child);
      if (report) tool.result = report;
    } else {
      tool.status = "error";
      tool.subAgentStatus = outcome;
      // The server's own failure text reads as prose; a run Poracode cut short
      // carries the catalog message so the renderer localizes it.
      tool.result =
        outcome === "failed" && error
          ? error
          : { error: error ?? msg("runtime.delegatedAgentInterrupted") };
    }
    return [
      {
        type: "item.completed",
        threadId: this.root.threadId,
        itemId: tool.itemId,
        payload: openCodeToolPayload(tool),
      },
    ];
  }

  private link(event: V2Event, parent: OpenCodeMapperState): RuntimeEvent[] {
    if (
      event.type !== "session.tool.progress" &&
      event.type !== "session.tool.success" &&
      event.type !== "session.tool.failed"
    )
      return [];
    const childID = event.data.metadata?.sessionID;
    if (typeof childID !== "string") return [];
    const tool = parent.messages.get(event.data.assistantMessageID)?.tools.get(event.data.id);
    if (!tool || !isDelegatedLaunch(tool.name)) return [];
    const child = this.ensure(childID);
    // A different launch tool starts the child on a new run.
    if (child.parentTool !== tool) child.runEnded = false;
    child.parentTool = tool;
    const pending = child.pending;
    child.pending = [];
    return [...pending.flatMap((entry) => this.map(entry)), ...this.updateProgress(child)];
  }

  private mapChild(child: ChildSession, event: V2Event): RuntimeEvent[] {
    // A child can launch grandchildren; their rows follow the same rule.
    const events = this.tag(
      this.admit(mapOpenCodeEvent(event, child.state), event, child.state),
      child.parentTool!.itemId,
    );
    const parent = child.parentTool!;
    let stepCount = child.stepCounts.get(parent) ?? 0;
    const operation =
      event.type === "session.skill.activated" ||
      event.type === "session.shell.started" ||
      event.type === "session.shell.ended";
    // Ordinary starts are fenced by the mapper's announcement/completion state.
    for (const entry of events) {
      if (entry.type !== "item.started") continue;
      if (operation) {
        if (child.operationIds.has(entry.itemId)) continue;
        child.operationIds.add(entry.itemId);
      }
      stepCount += 1;
    }
    child.stepCounts.set(parent, stepCount);
    // Child rows are gated while their panel is closed. Publish the count and
    // the current tool on the launch row as well so the main transcript still
    // sees live progress.
    events.push(...this.updateProgress(child));
    return events;
  }

  private updateProgress(child: ChildSession): RuntimeEvent[] {
    const parent = child.parentTool;
    if (!parent) return [];
    const stepCount = child.stepCounts.get(parent) ?? 0;
    const previous = parent.progress;
    const lastToolName = child.lastToolName;
    if (
      stepCount <= (readNonNegativeInteger(previous.stepCount) ?? 0) &&
      (lastToolName === undefined || lastToolName === previous.lastToolName)
    )
      return [];
    parent.progress = {
      ...previous,
      ...(stepCount > 0 ? { stepCount } : {}),
      ...(lastToolName ? { lastToolName } : {}),
    };
    return [
      {
        type: "item.updated",
        threadId: this.root.threadId,
        itemId: parent.itemId,
        payload: openCodeToolPayload(parent),
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

/** The child's latest step, in the order its text parts were written. */
function childReport(child: ChildSession): string | undefined {
  if (!child.report) return undefined;
  const text = [...child.report.parts]
    .sort(([left], [right]) => left - right)
    .map(([, part]) => part)
    .join("\n\n")
    .trim();
  return text.length > 0 ? text : undefined;
}
