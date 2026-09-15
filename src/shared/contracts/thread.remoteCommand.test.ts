import { describe, expect, it } from "vitest";
import { remoteThreadCommandSchema } from "./thread";

describe("remoteThreadCommandSchema grouping and workspace", () => {
  it("still accepts a set-group assignment from older clients", () => {
    expect(
      remoteThreadCommandSchema.parse({
        kind: "set-group",
        threadId: "t1",
        groupId: "g1",
        groupName: "Research",
      }),
    ).toEqual({
      kind: "set-group",
      threadId: "t1",
      groupId: "g1",
      groupName: "Research",
    });
  });

  it("accepts a set-group with no group id as ungroup", () => {
    expect(
      remoteThreadCommandSchema.parse({
        kind: "set-group",
        threadId: "t1",
      }),
    ).toEqual({ kind: "set-group", threadId: "t1" });
  });

  it("accepts set-workspace assign and unfile", () => {
    expect(
      remoteThreadCommandSchema.parse({
        kind: "set-workspace",
        threadId: "t1",
        workspaceId: "ws-work",
      }),
    ).toEqual({ kind: "set-workspace", threadId: "t1", workspaceId: "ws-work" });
    expect(
      remoteThreadCommandSchema.parse({
        kind: "set-workspace",
        threadId: "t1",
      }),
    ).toEqual({ kind: "set-workspace", threadId: "t1" });
  });
});
