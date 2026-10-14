import { describe, expect, it } from "vitest";
import catalog from "./fixtures/sdk-models.json";
import { CursorSdkMaxModeCompatibility, patchCursorSdkMaxModeRequest } from "./sdkMaxMode";
import { buildCursorSdkModelSelection, cursorSdkCapabilitiesFromModels } from "./sdkModels";

describe("Cursor SDK local Max Mode compatibility", () => {
  it("keeps Grok's 500K context independent from xhigh effort and fast", () => {
    const compatibility = new CursorSdkMaxModeCompatibility();
    compatibility.setCatalog(catalog);
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
    expect(compatibility.needsMaxMode(model)).toBe(true);
    expect(
      compatibility.needsMaxMode({
        ...model,
        ...(model.params
          ? { params: model.params.map((p) => (p.id === "context" ? { ...p, value: "256k" } : p)) }
          : {}),
      }),
    ).toBe(false);
  });

  it("uses the live catalog for extended windows, aliases, and parameter names", () => {
    const compatibility = new CursorSdkMaxModeCompatibility();
    compatibility.setCatalog([
      {
        id: "future-model",
        displayName: "Future",
        aliases: ["future"],
        parameters: [{ id: "context_window", values: [{ value: "small" }, { value: "large" }] }],
      },
    ]);
    expect(
      compatibility.needsMaxMode({
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
      expect(compatibility.needsMaxMode({ id: "future", ...(params ? { params } : {}) })).toBe(
        false,
      );
    }
    expect(
      compatibility.needsMaxMode({ id: "unknown", params: [{ id: "context", value: "500k" }] }),
    ).toBe(false);
  });

  it("retains the catalog's 1M selections and default extended window", () => {
    const compatibility = new CursorSdkMaxModeCompatibility();
    compatibility.setCatalog(catalog);
    for (const model of catalog) {
      const context = model.parameters?.find((p) => p.id === "context");
      if (!context) continue;
      expect(cursorSdkCapabilitiesFromModels([model]).modelContextSizes?.[model.id]).toEqual(
        context.values.map((v) => v.value),
      );
      const extended = context.values.at(-1)!;
      expect(
        compatibility.needsMaxMode({
          id: model.id,
          params: [{ id: "context", value: extended.value }],
        }),
      ).toBe(context.values.length > 1);
    }
  });

  it.each(["ux", "Bx", "$x"])(
    "patches the audited local-executor constructor (%s)",
    (namespace) => {
      const source = `{"./src/agent/local-executor.ts"(e){return new ${namespace}.G4({modelId:t.model.id,parameters:(t.model.params??[]).map((e=>new ${namespace}.SR({id:e.id,value:e.value})))})}}`;
      const patched = patchCursorSdkMaxModeRequest(source);
      expect(patched).toContain(
        'maxMode:globalThis[Symbol.for("poracode.cursor-sdk.max-mode.v1")](t.model),parameters:',
      );
      expect(patched).toContain("value:e.value");
    },
  );

  it("leaves unrelated chunks unchanged and rejects an unrecognized local request", () => {
    const unrelated = "new Bx.G4({modelId:t.model.id,parameters:[]})";
    expect(patchCursorSdkMaxModeRequest(unrelated)).toBe(unrelated);
    expect(() =>
      patchCursorSdkMaxModeRequest('"./src/agent/local-executor.ts"(){ changed(); }'),
    ).toThrow("not supported");
    const ambiguous =
      '"./src/agent/local-executor.ts"(){new Bx.G4({modelId:t.model.id,parameters:[]});new Bx.G4({modelId:t.model.id,parameters:[]})}';
    expect(() => patchCursorSdkMaxModeRequest(ambiguous)).toThrow("not supported");
  });
});
