import { describe, expect, it } from "vitest";
import {
  catalogIdSequencesEqual,
  isCatalogReorderNoOp,
  reorderCatalogBlockIds,
  reorderCatalogIds,
} from "./catalogOrder";

describe("reorderCatalogIds", () => {
  it("moves an item after the target", () => {
    expect(reorderCatalogIds(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
  });

  it("moves an item before the target", () => {
    expect(reorderCatalogIds(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
  });

  it("returns the same array for adjacent no-op placements", () => {
    const ids = ["a", "b", "c"];

    expect(reorderCatalogIds(ids, "a", "b", "before")).toBe(ids);
    expect(reorderCatalogIds(ids, "c", "b", "after")).toBe(ids);
  });

  it("leaves the sequence untouched for unknown ids and self-moves", () => {
    const ids = ["a", "b", "c"];

    expect(reorderCatalogIds(ids, "missing", "b", "before")).toBe(ids);
    expect(reorderCatalogIds(ids, "a", "missing", "after")).toBe(ids);
    expect(reorderCatalogIds(ids, "a", "a", "after")).toBe(ids);
  });
});

describe("isCatalogReorderNoOp", () => {
  it("detects equivalent reorder positions", () => {
    expect(isCatalogReorderNoOp(["a", "b", "c"], "a", "b", "before")).toBe(true);
    expect(isCatalogReorderNoOp(["a", "b", "c"], "c", "b", "after")).toBe(true);
    expect(isCatalogReorderNoOp(["a", "b", "c"], "a", "c", "after")).toBe(false);
  });
});

describe("reorderCatalogBlockIds", () => {
  it("moves a block before the target, preserving block and bystander order", () => {
    expect(reorderCatalogBlockIds(["a", "b", "c", "d"], ["c", "d"], "a", "before")).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("moves a block after the target", () => {
    expect(reorderCatalogBlockIds(["a", "b", "c", "d"], ["a", "b"], "d", "after")).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("returns the input reference when the block is already adjacent", () => {
    const ids = ["a", "b", "c", "d"];

    expect(reorderCatalogBlockIds(ids, ["a", "b"], "c", "before")).toBe(ids);
    expect(reorderCatalogBlockIds(ids, ["c", "d"], "b", "after")).toBe(ids);
  });

  it("treats a target inside the block as a no-op", () => {
    const ids = ["a", "b", "c"];
    expect(reorderCatalogBlockIds(ids, ["a", "b"], "a", "before")).toBe(ids);
  });

  it("returns the input reference for empty, missing, or incomplete blocks", () => {
    const ids = ["a", "b", "c"];

    expect(reorderCatalogBlockIds(ids, [], "a", "before")).toBe(ids);
    expect(reorderCatalogBlockIds(ids, ["missing"], "a", "before")).toBe(ids);
    expect(reorderCatalogBlockIds(ids, ["b", "missing"], "a", "before")).toBe(ids);
    expect(reorderCatalogBlockIds(ids, ["b"], "missing", "before")).toBe(ids);
  });
});

describe("catalogIdSequencesEqual", () => {
  it("compares by value", () => {
    expect(catalogIdSequencesEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(catalogIdSequencesEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(catalogIdSequencesEqual(["a"], ["a", "b"])).toBe(false);
  });
});
