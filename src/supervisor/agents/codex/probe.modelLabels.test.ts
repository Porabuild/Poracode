import { expect, it } from "vitest";
import { mapCodexModels } from "./probe";

it.each([
  ["gpt-6.1-terra", "GPT-6.1 Terra", "6.1 Terra"],
  ["gpt-6.1-terra", "gpt-6.1-terra", "6.1 Terra"],
  ["gpt-6.1-sol", "GPT-6.1 Sol", "6.1 Sol"],
  ["gpt-6-astra", "GPT-6 Astra", "6 Astra"],
  ["gpt-6-sol", "gpt-6-sol", "6 Sol"],
  ["gpt-6-luna", "GPT-6-Luna", "6 Luna"],
  ["gpt-5.6-terra", "GPT-5.6 Terra", "5.6 Terra"],
  ["gpt-5.4-mini", " GPT-5.4  Mini ", "5.4 Mini"],
  ["gpt-5.3-codex-spark", "GPT-5.3 Codex Spark", "5.3 Codex Spark"],
  ["gpt-6.1-terra", "6.1 Terra", "6.1 Terra"],
  ["gpt-6.1-terra", "Terra for coding", "Terra for coding"],
  ["custom-model", "Custom Model (Preview)", "Custom Model (Preview)"],
])("labels %s with display name %s as %s", (id, displayName, label) => {
  const result = mapCodexModels([
    {
      id,
      model: id,
      displayName,
      hidden: false,
      isDefault: true,
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
    },
  ]);
  expect(result.models).toEqual([{ id, label }]);
});
