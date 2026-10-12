import { describe, expect, it } from "vitest";
import {
  capabilitiesForPresentation,
  filterHiddenModels,
  withModelVisible,
} from "@/shared/agentSelection";
import { devinDefaultCapabilities } from "./detection";
import { devinDefaultHiddenModels } from "./modelVisibility";
import { devinModelCapabilities, parseDevinModelCatalog } from "./models";
import { devinNegotiatedGuiSelectionCapabilities } from "./selectionCapabilities";

const families = parseDevinModelCatalog(
  JSON.stringify({
    families: [
      {
        family_label: "SWE-1.6",
        slug: "swe-1.6",
        variants: [
          { model_uid: "opaque-old", label: "SWE-1.6" },
          { model_uid: "opaque-old-fast", label: "SWE-1.6 Fast" },
        ],
      },
      {
        family_label: "SWE-2",
        slug: "swe-2",
        variants: [{ model_uid: "opaque-current", label: "SWE-2 High" }],
      },
      {
        family_label: "GLM-5.2",
        slug: "glm-5.2",
        variants: [{ model_uid: "opaque-recommended", label: "GLM-5.2 High" }],
      },
      {
        family_label: "Gemini 3.1 Pro",
        slug: "gemini-3.1-pro",
        variants: [{ model_uid: "opaque-pro", label: "Gemini 3.1 Pro Medium" }],
      },
      {
        family_label: "Future model",
        slug: "future-model",
        variants: [{ model_uid: "swe-1.6-looking-uid", label: "Future model" }],
      },
    ],
  }),
);

describe("Devin default model visibility", () => {
  it("uses known native family identity and hides every older variant without guessing opaque IDs", () => {
    expect(devinDefaultHiddenModels(families)).toEqual(["opaque-old", "opaque-old-fast"]);
    expect(devinDefaultHiddenModels(families.map(({ slug: _slug, ...family }) => family))).toEqual(
      [],
    );
  });

  it("hides older versions only when a newer version of that model line is actually available", () => {
    const extra = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "GLM-5.3",
            slug: "glm-5.3",
            variants: [{ model_uid: "new-glm", label: "GLM-5.3 High" }],
          },
          {
            family_label: "GLM-5.4",
            slug: "glm-5.4",
            variants: [{ model_uid: "future-glm", label: "GLM-5.4 High" }],
          },
          {
            family_label: "Gemini 3.8 Flash",
            slug: "gemini-3.8-flash",
            variants: [{ model_uid: "new-flash", label: "Gemini 3.8 Flash Medium" }],
          },
        ],
      }),
    );
    expect(devinDefaultHiddenModels(families)).not.toContain("opaque-recommended");
    expect(devinDefaultHiddenModels([...families, extra[0]!])).toContain("opaque-recommended");
    expect(devinDefaultHiddenModels([...families, ...extra])).toEqual([
      "opaque-old",
      "opaque-old-fast",
      "opaque-recommended",
      "new-glm",
    ]);
    // A newer Flash model is not a replacement for the latest Pro line.
    expect(devinDefaultHiddenModels([...families, ...extra])).not.toContain("opaque-pro");
    expect(devinDefaultHiddenModels([families[0]!])).toEqual([]);
  });

  it("compares dotted versions numerically and preserves separate model tiers", () => {
    const catalog = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "GPT-6 Sol",
            slug: "gpt-6-sol",
            variants: [{ model_uid: "six", label: "GPT-6 Sol Medium" }],
          },
          {
            family_label: "GPT-6.9 Sol",
            slug: "gpt-6.9-sol",
            variants: [{ model_uid: "nine", label: "GPT-6.9 Sol Medium" }],
          },
          {
            family_label: "GPT-6.10 Sol",
            slug: "gpt-6.10-sol",
            variants: [{ model_uid: "ten", label: "GPT-6.10 Sol Medium" }],
          },
          {
            family_label: "GPT-6 Luna",
            slug: "gpt-6-luna",
            variants: [{ model_uid: "luna", label: "GPT-6 Luna Medium" }],
          },
          {
            family_label: "SWE-1.7 Lightning",
            slug: "swe-1.7-lightning",
            variants: [{ model_uid: "lightning", label: "SWE-1.7 Lightning Medium" }],
          },
        ],
      }),
    );
    expect(devinDefaultHiddenModels(catalog)).toEqual(["six", "nine"]);
  });

  it("keeps all raw choices available for explicit show-all and saved thread selections", () => {
    const source = { ...devinDefaultCapabilities, ...devinModelCapabilities(families) };
    const filtered = filterHiddenModels(source, undefined);
    expect(filtered.models.map((model) => model.id)).not.toContain("opaque-old");
    expect(filterHiddenModels(source, []).models).toEqual(source.models);
    expect(
      withModelVisible(filtered, source, "opaque-old").models.map((model) => model.id),
    ).toContain("opaque-old");
    expect(source.models.map((model) => model.id)).toContain("opaque-old");
  });

  it("declares GUI defaults only for native accepted UIDs, without widening the negotiated menu", () => {
    const result = devinNegotiatedGuiSelectionCapabilities(
      devinDefaultCapabilities,
      {
        models: [
          { id: "opaque-old-fast", label: "Older Fast" },
          { id: "opaque-recommended", label: "Recommended" },
          { id: "unknown", label: "New" },
        ],
      },
      families,
    )!;
    const source = capabilitiesForPresentation({ ...devinDefaultCapabilities, ...result }, "gui");
    expect(source.defaultHiddenModels).toEqual(["opaque-old-fast"]);
    expect(source.models).toHaveLength(3);
    expect(filterHiddenModels(source, undefined).models.map((model) => model.id)).toEqual([
      "opaque-recommended",
      "unknown",
    ]);
    expect(filterHiddenModels(source, []).models).toHaveLength(3);
  });
});
