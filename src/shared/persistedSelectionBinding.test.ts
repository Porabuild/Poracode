import { describe, expect, it } from "vitest";
import stamped from "./fixtures/selection-binding-v1/config-terminal-stamped.json";
import future from "./fixtures/selection-binding-v1/config-future-version.json";
import malformed from "./fixtures/selection-binding-v1/binding-malformed-cases.json";
import { modelSelectionSchema } from "./selectionBinding.schemas";
import {
  hasUnsupportedSelectionBinding,
  projectPersistedSelectionBinding,
} from "./persistedSelectionBinding";

describe("persisted selection metadata projection", () => {
  it("keeps legacy and recognized records without manufacturing metadata", () => {
    for (const value of [{ model: "m" }, stamped.config]) {
      expect(hasUnsupportedSelectionBinding(value)).toBe(false);
      expect(projectPersistedSelectionBinding(value)).toBe(value);
    }
  });

  it.each(malformed.cases)("preserves actual controls for $reason", ({ binding }) => {
    const raw = {
      model: "m",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
      selectionBinding: binding,
    };
    const before = JSON.stringify(raw);
    expect(hasUnsupportedSelectionBinding(raw)).toBe(true);
    expect(projectPersistedSelectionBinding(raw)).toStrictEqual({
      model: "m",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    });
    expect(JSON.stringify(raw)).toBe(before);
    expect(hasUnsupportedSelectionBinding(raw)).toBe(true);
    expect(modelSelectionSchema.safeParse(raw).success).toBe(false);
  });

  it("keeps forward raw data while the read projection stays usable", () => {
    const raw = structuredClone(future.config);
    const before = JSON.stringify(raw);
    const { selectionBinding: _binding, ...actual } = raw;
    expect(projectPersistedSelectionBinding(raw)).toStrictEqual(actual);
    expect(JSON.stringify(raw)).toBe(before);
    expect(hasUnsupportedSelectionBinding(raw)).toBe(true);
  });

  it("does not classify unrelated nested data as a selection container", () => {
    const raw = { model: "m", pluginData: { selectionBinding: { version: 200 } } };
    expect(hasUnsupportedSelectionBinding(raw)).toBe(false);
    expect(projectPersistedSelectionBinding(raw)).toBe(raw);
  });

  it("rejects own undefined metadata and never evaluates a metadata getter", () => {
    const absent = { model: "m", selectionBinding: undefined };
    expect(hasUnsupportedSelectionBinding(absent)).toBe(true);
    expect(projectPersistedSelectionBinding(absent)).toStrictEqual({ model: "m" });
    const getter = Object.defineProperty({ model: "m" }, "selectionBinding", {
      enumerable: true,
      get() {
        throw new Error("metadata getter must not run");
      },
    });
    expect(hasUnsupportedSelectionBinding(getter)).toBe(true);
    expect(projectPersistedSelectionBinding(getter)).toStrictEqual({ model: "m" });
  });
});
