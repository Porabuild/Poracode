import { describe, expect, it } from "vitest";
import { z } from "zod";
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
        workspaceId: null,
      }),
    ).toEqual({ kind: "set-workspace", threadId: "t1", workspaceId: null });
  });
});

describe("flat thread reorder compatibility", () => {
  const command = {
    kind: "reorder-flat",
    threadId: "b1",
    projectId: "beta",
    targetThreadId: "a1",
    placement: "before",
  } as const;

  it("requires the source project and placement on the distinct command", () => {
    expect(remoteThreadCommandSchema.parse(command)).toEqual(command);
    expect(remoteThreadCommandSchema.safeParse({ ...command, projectId: "" }).success).toBe(false);
    expect(remoteThreadCommandSchema.safeParse({ ...command, placement: "around" }).success).toBe(
      false,
    );
  });

  it("is rejected by the pre-upgrade discriminated union instead of silently changing scope", () => {
    const previousVariants = remoteThreadCommandSchema.options.filter(
      (variant) => variant.shape.kind.value !== "reorder-flat",
    );
    const previousSchema = z.discriminatedUnion("kind", [
      previousVariants[0]!,
      previousVariants[1]!,
      ...previousVariants.slice(2),
    ]);
    expect(previousSchema.safeParse(command).success).toBe(false);
    const projectCommand = {
      ...command,
      kind: "reorder",
      threadIds: ["b1"],
      scope: "catalog",
    };
    // An extra scope never extends the established project-only wire kind.
    expect(remoteThreadCommandSchema.parse(projectCommand)).not.toHaveProperty("scope");
    expect(previousSchema.parse(projectCommand)).toEqual(
      remoteThreadCommandSchema.parse(projectCommand),
    );
  });
});
