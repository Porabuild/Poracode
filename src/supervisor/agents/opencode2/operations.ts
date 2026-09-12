import type { RuntimeEvent } from "@/shared/contracts";
import type { V2Event } from "./clientTypes";

/** Native session operations outside assistant steps still belong in the transcript. */
export class OpenCode2Operations {
  private readonly shells = new Set<string>();
  constructor(private readonly threadId: string) {}

  map(event: V2Event): RuntimeEvent[] | undefined {
    const threadId = this.threadId;
    if (event.type === "session.skill.activated") {
      const itemId = `opencode2-skill-${event.id}`;
      return [
        {
          type: "item.started",
          threadId,
          itemId,
          itemType: "tool_call",
          payload: {
            name: "Skill",
            args: { skill: event.data.name },
            status: "success",
            result: event.data.text,
          },
        },
        { type: "item.completed", threadId, itemId },
      ];
    }
    if (event.type !== "session.shell.started" && event.type !== "session.shell.ended")
      return undefined;
    const { shell } = event.data;
    const itemId = `opencode2-shell-${shell.id}`;
    const payload = {
      name: "bash",
      args: { command: shell.command },
      status:
        event.type === "session.shell.started"
          ? "running"
          : shell.status === "exited" && shell.exit === 0
            ? "success"
            : "error",
      ...(event.type === "session.shell.ended" ? { result: event.data.output.output } : {}),
    };
    const events: RuntimeEvent[] = this.shells.has(itemId)
      ? []
      : [{ type: "item.started", threadId, itemId, itemType: "tool_call", payload }];
    if (event.type === "session.shell.started") this.shells.add(itemId);
    else {
      this.shells.delete(itemId);
      events.push({ type: "item.completed", threadId, itemId, payload });
    }
    return events;
  }

  close(): RuntimeEvent[] {
    const events = [...this.shells].map((itemId): RuntimeEvent => ({
      type: "item.completed",
      threadId: this.threadId,
      itemId,
      payload: { status: "error" },
    }));
    this.shells.clear();
    return events;
  }
}
