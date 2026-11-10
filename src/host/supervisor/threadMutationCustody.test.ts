import { describe, expect, it } from "vitest";
import { withThreadMutationCustody, type RunThreadMutation } from "./threadMutationCustody";

describe("multi-thread mutation custody", () => {
  it("deduplicates ids and holds every lock until the operation settles", async () => {
    const held = new Set<string>();
    const acquired: string[] = [];
    const lock: RunThreadMutation = async (threadId, operation) => {
      if (held.has(threadId)) throw new Error("Reentrant lock");
      held.add(threadId);
      acquired.push(threadId);
      try {
        return await operation();
      } finally {
        held.delete(threadId);
      }
    };
    const result = await withThreadMutationCustody(lock, ["b", "a", "b"], async (ordered) => {
      expect(ordered).toEqual(["a", "b"]);
      expect([...held]).toEqual(["a", "b"]);
      return "removed";
    });
    expect(result).toBe("removed");
    expect(acquired).toEqual(["a", "b"]);
    expect(held.size).toBe(0);
  });

  it("releases all acquired locks when removal fails", async () => {
    const held = new Set<string>();
    const lock: RunThreadMutation = async (id, operation) => {
      held.add(id);
      try {
        return await operation();
      } finally {
        held.delete(id);
      }
    };
    await expect(
      withThreadMutationCustody(lock, ["a", "b"], async () => {
        throw new Error("Removal failed");
      }),
    ).rejects.toThrow("Removal failed");
    expect(held.size).toBe(0);
  });

  it("does not overflow the stack for a large worktree group", async () => {
    const lock: RunThreadMutation = async (_id, operation) => operation();
    const ids = Array.from({ length: 4_000 }, (_, index) => `thread-${index}`);
    await expect(
      withThreadMutationCustody(lock, ids, async (ordered) => ordered.length),
    ).resolves.toBe(ids.length);
  });
});
