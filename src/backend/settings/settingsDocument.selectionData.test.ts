import { describe, expect, it } from "vitest";
import { decodeSettingsDocument, SettingsDocumentError } from "./settingsDocument";
import { assertSettingsSelectionDataReplaceable } from "./settingsSelectionData";

const fields = [
  "commitGenSelection",
  "titleGenSelection",
  "conflictResolverSelection",
  "experimentJudgeSelection",
  "wslCommitGenSelection",
  "wslTitleGenSelection",
  "wslConflictResolverSelection",
] as const;
const controls = {
  model: "opaque-old-member",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "default",
};

describe("persisted settings selection data", () => {
  it.each(fields)(
    "projects unsupported metadata in %s without rewriting any actual control",
    (field) => {
      const selection = { ...controls, selectionBinding: { version: 200, future: "keep" } };
      const raw = { [field]: selection, themeMode: "dark" };
      const before = JSON.stringify(raw);
      const document = decodeSettingsDocument(raw);
      expect(document.settings[field]).toEqual(controls);
      expect(document.raw[field]).toEqual(selection);
      expect(JSON.stringify(raw)).toBe(before);
      expect(() => assertSettingsSelectionDataReplaceable(document.raw)).toThrow(
        "unsupported selection data",
      );
    },
  );

  it.each([null, {}, { version: 2 }, { version: 1, kind: "unknown" }, "unknown"])(
    "preserves malformed provider metadata %j while reading all actual controls exactly",
    (selectionBinding) => {
      const config = { ...controls, selectionBinding };
      const raw = { providerConfigs: { "fixture:profile": config } };
      const before = JSON.stringify(raw);
      const document = decodeSettingsDocument(raw);
      expect(document.settings.providerConfigs["fixture:profile"]).toEqual(controls);
      expect(document.raw.providerConfigs).toEqual(raw.providerConfigs);
      expect(JSON.stringify(raw)).toBe(before);
      expect(() => assertSettingsSelectionDataReplaceable(document.raw)).toThrow(
        "unsupported selection data",
      );
    },
  );

  it("does not default omitted controls while projecting unsupported metadata", () => {
    const config = { model: "opaque-member", selectionBinding: { version: 200 } };
    const document = decodeSettingsDocument({ providerConfigs: { fixture: config } });
    expect(document.settings.providerConfigs.fixture).toEqual({ model: "opaque-member" });
    expect(document.raw.providerConfigs).toEqual({ fixture: config });
  });

  it("still refuses invalid actual controls instead of repairing them", () => {
    expect(() =>
      decodeSettingsDocument({
        titleGenSelection: { ...controls, fast: "false", selectionBinding: { version: 200 } },
      }),
    ).toThrow(SettingsDocumentError);
  });

  it("does not inspect arbitrary nested plugin configuration", () => {
    const raw = {
      futurePluginConfig: { selectionBinding: { version: 200 }, nested: { model: "keep" } },
    };
    const document = decodeSettingsDocument(raw);
    expect(() => assertSettingsSelectionDataReplaceable(document.raw)).not.toThrow();
    expect(document.raw.futurePluginConfig).toEqual(raw.futurePluginConfig);
  });
});
