// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { familyMenuColumn } from "./modelFamilyControlOptions";

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

describe("familyMenuColumn", () => {
  it("resolves component effort and model edits to existing exact option IDs", () => {
    const onChange = vi.fn<(value: string) => void>();
    const column = familyMenuColumn({
      id: "secondary",
      label: "Secondary",
      options,
      value: "opaque-a",
      decode: (_id, option) => coordinates[option.id],
      onChange,
    });
    expect(column.models.options).toEqual([
      { id: "alpha", label: "Alpha" },
      { id: "beta", label: "Beta" },
    ]);
    expect(column.effort?.value).toBe("low");
    column.effort?.onChange("high");
    expect(onChange).toHaveBeenLastCalledWith("opaque-b");
    column.models.onChange("beta");
    expect(onChange).toHaveBeenLastCalledWith("opaque-c");
    onChange.mockClear();
    column.effort?.onChange("ultra");
    column.models.onChange("absent");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("retains every raw choice when interpretation would collapse distinct native options", () => {
    const column = familyMenuColumn({
      id: "one",
      label: "One",
      options,
      value: "opaque-b",
      decode: () => ({ model: { id: "same", label: "Same" }, effort: "high" }),
      onChange: vi.fn<(value: string) => void>(),
    });
    expect(column.models.options).toEqual(options);
    expect(column.models.value).toBe("opaque-b");
    expect(column.effort).toBeUndefined();
  });

  it("keeps undecoded labels and missing options readable without parsing them", () => {
    const column = familyMenuColumn({
      id: "one",
      label: "One",
      options,
      value: "retired",
      onChange: vi.fn<(value: string) => void>(),
    });
    expect(column.models.value).toBe("retired");
    expect(column.models.options).toEqual(options);
    expect(column.effort).toBeUndefined();
  });
});
