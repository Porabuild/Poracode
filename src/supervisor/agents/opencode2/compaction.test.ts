import { describe, expect, it } from "vitest";
import {
  createOpenCode2MapperState,
  mapOpenCode2Event,
  setOpenCode2SessionId,
  closeOpenCode2Items,
} from "./eventMapping";
import type { V2Event } from "./clientTypes";
const event = (type: string, data: object) =>
  ({ type, id: type, created: 1, data: { sessionID: "s", ...data } }) as V2Event;
describe("OpenCode 2 compaction", () => {
  it.each(["ended", "failed"])("shows compaction and settles %s", (outcome) => {
    const state = createOpenCode2MapperState("t");
    setOpenCode2SessionId(state, "s");
    const opened = mapOpenCode2Event(
      event("session.compaction.started", { reason: "manual", recent: "" }),
      state,
    );
    expect(opened[0]).toMatchObject({
      type: "item.started",
      payload: { name: "compact", status: "running" },
    });
    const closed = mapOpenCode2Event(
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
    expect(closeOpenCode2Items(state)).toEqual([]);
  });
});
