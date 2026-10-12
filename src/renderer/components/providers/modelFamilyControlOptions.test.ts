// @vitest-environment node
import { describe, expect, it } from "vitest";
import { familySelectorMenuOptions } from "./modelFamilyControlOptions";

const options = [
  { id: "opaque-a", label: "Alpha Low" },
  { id: "opaque-b", label: "Alpha High" },
  { id: "opaque-c", label: "Beta High" },
];
const coordinates: Record<string, { model: { id: string; label: string }; effort: string }> = {
  "opaque-a": { model: { id: "alpha", label: "Alpha" }, effort: "low" },
  "opaque-b": { model: { id: "alpha", label: "Alpha" }, effort: "high" },
  "opaque-c": { model: { id: "beta", label: "Beta" }, effort: "high" },
};

describe("familySelectorMenuOptions", () => {
  it("keeps exact option ids while presenting decoded model labels with effort hints", () => {
    const rows = familySelectorMenuOptions({
      selectorId: "secondary",
      options,
      decode: (_id, option) => coordinates[option.id],
    });
    expect(rows).toEqual([
      { id: "opaque-a", label: "Alpha", hint: "Low" },
      { id: "opaque-b", label: "Alpha", hint: "High" },
      { id: "opaque-c", label: "Beta", hint: "High" },
    ]);
  });

  it("retains every raw label when interpretation would collapse distinct native options", () => {
    const rows = familySelectorMenuOptions({
      selectorId: "one",
      options,
      decode: () => ({ model: { id: "same", label: "Same" }, effort: "high" }),
    });
    expect(rows).toEqual(options.map((option) => ({ id: option.id, label: option.label })));
  });

  it("keeps undecoded labels and missing options readable without parsing them", () => {
    const rows = familySelectorMenuOptions({ selectorId: "one", options });
    expect(rows).toEqual(options.map((option) => ({ id: option.id, label: option.label })));
    const decoded = familySelectorMenuOptions({
      selectorId: "one",
      options,
      decode: () => undefined,
    });
    expect(decoded).toEqual(rows);
  });
});
