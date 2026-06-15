import { describe, expect, it } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import {
  cleanModels,
  environmentFromRows,
  profileUsesExternalProvider,
  rowsFromEnvironment,
} from "./ClaudeProfileSettingsModel";

describe("ClaudeProfileSettingsModel", () => {
  it("round-trips an unchanged sealed secret even after the field enters replace mode", () => {
    const rows = rowsFromEnvironment(
      { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      () => "row-1",
    );

    expect(environmentFromRows([{ ...rows[0]!, replacing: true }])).toEqual({
      ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true },
    });
  });

  it("uses typed secret replacements instead of the sealed placeholder", () => {
    const rows = rowsFromEnvironment(
      { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      () => "row-1",
    );

    expect(environmentFromRows([{ ...rows[0]!, replacing: true, value: "sk-new" }])).toEqual({
      ANTHROPIC_AUTH_TOKEN: { value: "sk-new", sensitive: true },
    });
  });

  it("deduplicates custom model rows after trimming", () => {
    expect(
      cleanModels([
        { rowId: "1", id: " glm-5.2 ", label: " GLM 5.2 " },
        { rowId: "2", id: "glm-5.2", label: "Duplicate" },
        { rowId: "3", id: " ", label: "Ignored" },
      ]),
    ).toEqual([{ id: "glm-5.2", label: "GLM 5.2" }]);
  });

  it("does not mark an empty effort list as an external-provider override", () => {
    const instance: AgentInstanceConfig = {
      id: "work",
      driver: "claude",
      config: { configDir: "~/.lightcode/claude-profiles/work" },
    };

    expect(profileUsesExternalProvider(instance, { configDir: "x", efforts: [] })).toBe(false);
  });
});
