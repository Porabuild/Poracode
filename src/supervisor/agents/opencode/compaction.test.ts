import { describe, expect, it } from "vitest";
import {
  createOpenCodeMapperState,
  mapOpenCodeEvent,
  setOpenCodeSessionId,
  closeOpenCodeItems,
} from "./eventMapping";
import type { V2Event } from "./clientTypes";
const event = (type: string, data: object) =>
  ({ type, id: type, created: 1, data: { sessionID: "s", ...data } }) as V2Event;
describe("OpenCode compaction", () => {
  it.each(["ended", "failed"])("shows compaction and settles %s", (outcome) => {
    const state = createOpenCodeMapperState("t");
    setOpenCodeSessionId(state, "s");
    const opened = mapOpenCodeEvent(
      event("session.compaction.started", { reason: "manual", recent: "" }),
      state,
    );
    expect(opened[0]).toMatchObject({
      type: "item.started",
      payload: { name: "compact", status: "running" },
    });
    const closed = mapOpenCodeEvent(
      event(`session.compaction.${outcome}`, {
        reason: "manual",
        recent: "",
        text: "summary",
        error: { type: "test", message: "failed" },
      }),
      state,
    );
    expect(closed[0]).toMatchObject({
      type: "item.completed",
      payload: { name: "compact", status: outcome === "ended" ? "success" : "error" },
    });
    expect(closeOpenCodeItems(state)).toEqual([]);
  });
});
