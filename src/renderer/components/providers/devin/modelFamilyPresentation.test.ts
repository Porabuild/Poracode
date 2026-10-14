// @vitest-environment node
import { describe, expect, it } from "vitest";
import { devinModelFamilyPresentation } from "./modelFamilyPresentation";

describe("Devin family presentation", () => {
  it.each([
    ["SWE-2 Medium", "SWE-2", "medium"],
    ["GPT-5.6 Luna High Thinking", "GPT-5.6 Luna", "high"],
    ["Claude Fable 5.1 Extra High", "Claude Fable 5.1", "xhigh"],
  ])("interprets native effort labels: %s", (label, model, effort) => {
    expect(
      devinModelFamilyPresentation.option?.("sidekick", { id: "opaque-member", label }),
    ).toEqual({ model: { id: model, label: model }, effort });
  });

  it.each(["SWE-1.6 Fast", "Future Unrecognized", "GPT-6 Astra High Fast"])(
    "keeps %s an exact unsplit option",
    (label) => {
      expect(
        devinModelFamilyPresentation.option?.("sidekick", { id: "opaque-member", label }),
      ).toBeUndefined();
    },
  );
});

it("names the lead selector Main and gives each selector its own icon", () => {
  expect(devinModelFamilyPresentation.selectorLabel?.("lead")).toBe("Main");
  expect(devinModelFamilyPresentation.selectorLabel?.("sidekick")).toBeUndefined();
  expect(devinModelFamilyPresentation.selectorIcon?.("lead")).toBeTruthy();
  expect(devinModelFamilyPresentation.selectorIcon?.("sidekick")).toBeTruthy();
  expect(devinModelFamilyPresentation.selectorIcon?.("other")).toBeUndefined();
});
