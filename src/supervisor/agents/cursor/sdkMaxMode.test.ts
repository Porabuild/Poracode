import { describe, expect, it } from "vitest";
import catalog from "./fixtures/sdk-models.json";
import { CursorSdkMaxModeQualification } from "./sdkMaxMode";
import { buildCursorSdkModelSelection, cursorSdkCapabilitiesFromModels } from "./sdkModels";

describe("Cursor SDK Max Mode qualification", () => {
  it("keeps Grok's 500K context independent from xhigh effort and fast", () => {
    const qualification = new CursorSdkMaxModeQualification();
    qualification.setCatalog(catalog);
    const model = buildCursorSdkModelSelection(
      {
        model: "grok-4.7",
        effort: "xhigh",
        contextSize: "500k",
        fast: false,
      },
      catalog,
    );
    expect(model.params).toEqual(
      expect.arrayContaining([
        { id: "context", value: "500k" },
        { id: "reasoning_effort", value: "xhigh" },
        { id: "fast", value: "false" },
      ]),
    );
    expect(qualification.needsMaxMode(model)).toBe(true);
    expect(
      qualification.needsMaxMode({
        ...model,
        ...(model.params
          ? { params: model.params.map((p) => (p.id === "context" ? { ...p, value: "256k" } : p)) }
          : {}),
      }),
    ).toBe(false);
  });

  it("uses the live catalog for extended windows, aliases, and parameter names", () => {
    const qualification = new CursorSdkMaxModeQualification();
    qualification.setCatalog([
      {
        id: "future-model",
        displayName: "Future",
        aliases: ["future"],
        parameters: [{ id: "context_window", values: [{ value: "small" }, { value: "large" }] }],
      },
    ]);
    expect(
      qualification.needsMaxMode({
        id: "future",
        params: [{ id: "context_window", value: "large" }],
      }),
    ).toBe(true);
    for (const params of [
      undefined,
      [],
      [{ id: "context_window", value: "unknown" }],
      [{ id: "effort", value: "xhigh" }],
    ]) {
      expect(qualification.needsMaxMode({ id: "future", ...(params ? { params } : {}) })).toBe(
        false,
      );
    }
    expect(
      qualification.needsMaxMode({ id: "unknown", params: [{ id: "context", value: "500k" }] }),
    ).toBe(false);
  });

  it("retains the catalog's 1M selections and default extended window", () => {
    const qualification = new CursorSdkMaxModeQualification();
    qualification.setCatalog(catalog);
    for (const model of catalog) {
      const context = model.parameters?.find((p) => p.id === "context");
      if (!context) continue;
      expect(cursorSdkCapabilitiesFromModels([model]).modelContextSizes?.[model.id]).toEqual(
        context.values.map((v) => v.value),
      );
      const extended = context.values.at(-1)!;
      expect(
        qualification.needsMaxMode({
          id: model.id,
          params: [{ id: "context", value: extended.value }],
        }),
      ).toBe(context.values.length > 1);
    }
  });

  it("decorates extended-context selections and leaves standard windows untouched", () => {
    const qualification = new CursorSdkMaxModeQualification();
    qualification.setCatalog(catalog);
    const model = buildCursorSdkModelSelection(
      {
        model: "grok-4.7",
        effort: "xhigh",
        contextSize: "500k",
        fast: false,
      },
      catalog,
    );
    expect(qualification.withNativeMaxMode(model)).toEqual({ ...model, maxMode: true });

    const standard: typeof model = {
      ...model,
      ...(model.params
        ? { params: model.params.map((p) => (p.id === "context" ? { ...p, value: "256k" } : p)) }
        : {}),
    };
    const qualified = qualification.withNativeMaxMode(standard);
    expect(qualified).toEqual(standard);
    expect(qualified).not.toHaveProperty("maxMode");
  });

  it("is idempotent for an already-qualified selection", () => {
    const qualification = new CursorSdkMaxModeQualification();
    qualification.setCatalog(catalog);
    const qualified = {
      id: "grok-4.7",
      maxMode: true,
      params: [{ id: "context", value: "500k" }],
    };
    expect(qualification.withNativeMaxMode(qualified)).toEqual(qualified);
  });
});
