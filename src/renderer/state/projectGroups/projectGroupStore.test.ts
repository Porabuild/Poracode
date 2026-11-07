import { beforeEach, describe, expect, it } from "vitest";
import { useProjectGroupStore } from "./projectGroupStore";

const KEY = "poracode-project-groups";

describe("projectGroupStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
  });

  it("rehydrates a v1 payload", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: { manualGroups: { a: "solo:a" }, lastUsedAt: { a: 5 } },
        version: 1,
      }),
    );
    await useProjectGroupStore.persist.rehydrate();
    expect(useProjectGroupStore.getState().manualGroups).toEqual({ a: "solo:a" });
    expect(useProjectGroupStore.getState().lastUsedAt).toEqual({ a: 5 });
  });

  it("starts fresh from a malformed payload", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ state: { manualGroups: ["a"], lastUsedAt: { a: "x" } }, version: 1 }),
    );
    await useProjectGroupStore.persist.rehydrate();
    expect(useProjectGroupStore.getState().manualGroups).toEqual({});
    expect(useProjectGroupStore.getState().lastUsedAt).toEqual({});
  });

  it("starts fresh from an unversioned or future payload", async () => {
    for (const version of [0, 2]) {
      localStorage.setItem(
        KEY,
        JSON.stringify({ state: { manualGroups: { a: "solo:a" }, lastUsedAt: { a: 5 } }, version }),
      );
      await useProjectGroupStore.persist.rehydrate();
      expect(useProjectGroupStore.getState().manualGroups).toEqual({});
      expect(useProjectGroupStore.getState().lastUsedAt).toEqual({});
    }
  });

  it("ignores an override write that changes nothing", () => {
    const before = useProjectGroupStore.getState();
    before.setOverrides({ manualGroups: {} });
    expect(useProjectGroupStore.getState()).toBe(before);
  });

  it("keeps only the most recent environment choices", () => {
    const store = useProjectGroupStore.getState();
    for (let index = 0; index < 205; index += 1) store.markProjectUsed(`p${index}`, index);
    const recent = useProjectGroupStore.getState().lastUsedAt;
    expect(Object.keys(recent)).toHaveLength(200);
    expect(recent.p0).toBeUndefined();
    expect(recent.p204).toBe(204);
  });
});
