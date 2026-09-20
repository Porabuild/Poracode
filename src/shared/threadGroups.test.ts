import { describe, expect, it } from "vitest";
import { canChangeThreadGroup, dissolveGroupMembership } from "./threadGroups";
import { groupThread } from "./test/threadGroups";

describe("dissolveGroupMembership", () => {
  it("clears a pair without mutating its input or unrelated rows", () => {
    const threads = [groupThread("a"), groupThread("b"), groupThread("other", "other")];
    const before = structuredClone(threads);
    const result = dissolveGroupMembership(threads, "a");
    expect(result.clearedIds).toEqual(["a", "b"]);
    expect(
      result.threads
        .slice(0, 2)
        .every((thread) => !("groupId" in thread) && !("groupName" in thread)),
    ).toBe(true);
    expect(result.threads[2]).toBe(threads[2]);
    expect(threads).toEqual(before);
  });
  it("leaves two siblings grouped when removing one of three", () => {
    const threads = [groupThread("a"), groupThread("b"), groupThread("c")];
    const result = dissolveGroupMembership(threads, "a");
    expect(result.clearedIds).toEqual(["a"]);
    expect(result.threads.slice(1)).toEqual(threads.slice(1));
    expect(result.threads[0]?.groupId).toBeUndefined();
  });
  it("clears all members only of the target group", () => {
    const threads = [
      groupThread("a"),
      groupThread("b"),
      groupThread("c"),
      groupThread("other", "other"),
    ];
    const result = dissolveGroupMembership(threads, "b", { all: true });
    expect(result.clearedIds).toEqual(["b", "a", "c"]);
    expect(result.threads.slice(0, 3).every((thread) => thread.groupId === undefined)).toBe(true);
    expect(result.threads[3]).toBe(threads[3]);
  });
  it("does not treat ungrouped threads as siblings", () => {
    const a = groupThread("a", "");
    const b = groupThread("b", "");
    expect(dissolveGroupMembership([a, b], "a", { all: true }).clearedIds).toEqual(["a"]);
    expect(dissolveGroupMembership([a, b], "missing").clearedIds).toEqual([]);
  });
});

describe("canChangeThreadGroup", () => {
  it.each([
    ["experiment", undefined, false],
    ["experiment", "ordinary", false],
    ["ordinary", "experiment", false],
    [undefined, "experiment", false],
    ["experiment", "experiment", true],
    ["ordinary", undefined, true],
    [undefined, "ordinary", true],
    ["ordinary", "other", true],
  ] as const)("checks membership from %s to %s", (previous, next, allowed) => {
    expect(canChangeThreadGroup(previous, next, (id) => id === "experiment")).toBe(allowed);
  });
});
