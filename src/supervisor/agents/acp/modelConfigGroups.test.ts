import { describe, expect, it } from "vitest";
import { projectModelConfigGroups } from "./modelConfigGroups";

/** Every projected section owns a member and every member owns a section. */
function expectWellFormed(projection: ReturnType<typeof projectModelConfigGroups>) {
  if (!projection) return;
  const sectionIds = new Set(projection.subProviders.map((section) => section.id));
  expect(projection.subProviders.length).toBeGreaterThan(0);
  for (const section of projection.subProviders) {
    expect(section.label.length).toBeGreaterThan(0);
  }
  for (const groupId of Object.values(projection.modelSubProvider)) {
    expect(sectionIds.has(groupId)).toBe(true);
  }
}

describe("projectModelConfigGroups", () => {
  it("returns undefined for a flat menu so callers emit nothing", () => {
    expect(
      projectModelConfigGroups([
        { value: "m-1", name: "One" },
        { value: "m-2", name: "Two" },
      ]),
    ).toBeUndefined();
  });

  it("returns undefined for empty, malformed, or non-array input", () => {
    expect(projectModelConfigGroups(undefined)).toBeUndefined();
    expect(projectModelConfigGroups("groups")).toBeUndefined();
    expect(projectModelConfigGroups([])).toBeUndefined();
    expect(projectModelConfigGroups([null, 42, "x"])).toBeUndefined();
    // A group entry without an id or without an options array carries nothing.
    expect(
      projectModelConfigGroups([{ options: [{ value: "m-1" }] }, { group: "g" }]),
    ).toBeUndefined();
  });

  it("projects section order, labels, and exact per-value membership", () => {
    const projection = projectModelConfigGroups([
      {
        group: "flagship",
        name: "Flagship",
        options: [
          { value: "m-high", name: "High" },
          { value: "fusion-pair", name: "Fusion (A + B)" },
        ],
      },
      { group: "fast", name: "Fast tier", options: [{ value: "m-fast", name: "Lightning" }] },
    ]);
    expect(projection).toEqual({
      subProviders: [
        { id: "flagship", label: "Flagship" },
        { id: "fast", label: "Fast tier" },
      ],
      modelSubProvider: {
        "m-high": "flagship",
        "fusion-pair": "flagship",
        "m-fast": "fast",
      },
    });
  });

  it("keeps ungrouped entries out of the membership map in mixed menus", () => {
    const projection = projectModelConfigGroups([
      { value: "m-top", name: "Top level" },
      { group: "g", options: [{ value: "m-in" }] },
    ]);
    expect(projection).toEqual({
      subProviders: [{ id: "g", label: "g" }],
      modelSubProvider: { "m-in": "g" },
    });
  });

  it("resolves nested groups to the innermost group and skips member-less ancestors", () => {
    const projection = projectModelConfigGroups([
      {
        group: "outer",
        name: "Outer",
        options: [
          { group: "inner", name: "Inner", options: [{ value: "m-nested" }] },
          { value: "m-direct", name: "Direct" },
        ],
      },
    ]);
    expect(projection).toEqual({
      subProviders: [
        { id: "outer", label: "Outer" },
        { id: "inner", label: "Inner" },
      ],
      modelSubProvider: { "m-nested": "inner", "m-direct": "outer" },
    });
  });

  it("falls back to the group id when the name is absent or blank", () => {
    const projection = projectModelConfigGroups([
      { group: "g1", options: [{ value: "m-1" }] },
      { group: "g2", name: "   ", options: [{ value: "m-2" }] },
    ]);
    expect(projection?.subProviders).toEqual([
      { id: "g1", label: "g1" },
      { id: "g2", label: "g2" },
    ]);
  });

  it("skips malformed children without dropping the group's valid members", () => {
    const projection = projectModelConfigGroups([
      {
        group: "g",
        name: "G",
        options: [null, { value: 7 }, { value: "" }, "junk", { value: "m-ok", name: "Ok" }],
      },
    ]);
    expect(projection).toEqual({
      subProviders: [{ id: "g", label: "G" }],
      modelSubProvider: { "m-ok": "g" },
    });
    // An all-malformed group leaves no empty section behind.
    expect(projectModelConfigGroups([{ group: "dead", options: [null, "junk"] }])).toBeUndefined();
  });

  it("keeps a repeated group id as one section (first label wins) and merges members", () => {
    const projection = projectModelConfigGroups([
      { group: "g", name: "First", options: [{ value: "m-1" }] },
      { group: "g", name: "Second", options: [{ value: "m-2" }] },
    ]);
    expect(projection).toEqual({
      subProviders: [{ id: "g", label: "First" }],
      modelSubProvider: { "m-1": "g", "m-2": "g" },
    });
  });

  it("keeps a value advertised under two groups on its first mapping", () => {
    const projection = projectModelConfigGroups([
      { group: "first", options: [{ value: "m-dup" }] },
      { group: "second", options: [{ value: "m-dup" }] },
    ]);
    expect(projection?.modelSubProvider).toEqual({ "m-dup": "first" });
    expect(projection?.subProviders.map((section) => section.id)).toEqual(["first"]);
  });

  it("treats prototype-reserved ids as plain data keys", () => {
    const projection = projectModelConfigGroups([
      { group: "__proto__", name: "Proto", options: [{ value: "__proto__" }] },
      { group: "g", options: [{ value: "constructor" }] },
    ]);
    expect(projection?.subProviders).toEqual([
      { id: "__proto__", label: "Proto" },
      { id: "g", label: "g" },
    ]);
    expect(Object.getPrototypeOf(projection!.modelSubProvider)).toBe(Object.prototype);
    expect(Object.hasOwn(projection!.modelSubProvider, "__proto__")).toBe(true);
    expect(projection!.modelSubProvider["__proto__"]).toBe("__proto__");
    expect(projection!.modelSubProvider["constructor"]).toBe("g");
  });

  it("stays a well-formed projection under oversized and deeply nested payloads", () => {
    const oversized = Array.from({ length: 100 }, (_, group) => ({
      group: `g-${group}`,
      name: `G ${group}`,
      options: [{ value: `m-${group}` }],
    }));
    const projection = projectModelConfigGroups(oversized);
    expect(projection).toBeDefined();
    expectWellFormed(projection);
    // Capping must drop whole groups (section + members together), never
    // leave a member pointing at a section that was not projected.
    expect(projection!.subProviders.length).toBeLessThan(oversized.length);
    expect(projection!.subProviders[0]).toEqual({ id: "g-0", label: "G 0" });

    // Nesting deeper than the projection descends drops the deep values
    // while the shallow ones still project.
    let deep: Record<string, unknown> = { value: "m-deep" };
    for (let level = 0; level < 50; level++) {
      deep = { group: `d-${level}`, options: [deep] };
    }
    const bounded = projectModelConfigGroups([
      deep,
      { group: "shallow", options: [{ value: "m-0" }] },
    ]);
    expect(bounded?.modelSubProvider).toEqual({ "m-0": "shallow" });
    expectWellFormed(bounded);
  });
});
