import { describe, expect, it } from "vitest";
import { defaultSharedSettings } from "@/shared/settings";
import { settingsSubjectSchema } from "@/shared/settingsTransactions";
import { settingsListEntryId, settingsSubjectState } from "./settingsSubjects";

describe("settings content revisions and identities", () => {
  it("compares object contents independent of insertion order but preserves list order", () => {
    const subject = { kind: "field", field: "agentSettings" } as const;
    const a = { ...defaultSharedSettings, agentSettings: { fixture: { one: true, two: "value" } } };
    const b = { ...defaultSharedSettings, agentSettings: { fixture: { two: "value", one: true } } };
    expect(settingsSubjectState(a, subject).revision).toBe(
      settingsSubjectState(b, subject).revision,
    );
    const list = { kind: "entry", field: "hiddenModels", key: "fixture" } as const;
    expect(
      settingsSubjectState({ ...a, hiddenModels: { fixture: ["a", "b"] } }, list).revision,
    ).not.toBe(
      settingsSubjectState({ ...a, hiddenModels: { fixture: ["b", "a"] } }, list).revision,
    );
  });

  it("uses the same learned-selection identity for normalized legacy explicit fields and tags", () => {
    const value = { agentKind: "fixture", modelId: "model", fast: false, tags: ["two", "one"] };
    expect(settingsListEntryId("crossagentSelectionUsage", value)).toBe(
      settingsListEntryId("crossagentSelectionUsage", {
        ...value,
        tags: ["one", "two"],
        explicitFields: { provider: true, model: true, effort: true, fast: true },
      }),
    );
    expect(settingsListEntryId("crossagentSelectionUsage", value)).not.toBe(
      settingsListEntryId("crossagentSelectionUsage", {
        ...value,
        explicitFields: { provider: true, model: false, effort: true, fast: true },
      }),
    );
  });

  it("can address existing long model identities without introducing a stricter persisted-key limit", () => {
    const key = settingsListEntryId("crossagentSelectionUsage", {
      agentKind: "fixture",
      modelId: "long-model-".repeat(400),
      fast: false,
    });
    expect(
      settingsSubjectSchema.safeParse({
        kind: "list-entry",
        field: "crossagentSelectionUsage",
        key,
      }).success,
    ).toBe(true);
    expect(
      settingsSubjectSchema.safeParse({ kind: "entry", field: "hiddenModels", key: "__proto__" })
        .success,
    ).toBe(false);
  });
});
