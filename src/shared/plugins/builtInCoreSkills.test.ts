import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILT_IN_MCP_SERVER_IDS } from "../contracts/mcpServer";
import {
  BUNDLED_PLUGIN_CORE_SKILLS,
  coreSkillsForBuiltInMcp,
  loadPluginCoreSkillPhrase,
  uniqueCoreSkillForBuiltInMcp,
} from "./builtInCoreSkills";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("bundled plugin core skills", () => {
  it("requires a core skill on every package in resources/plugins", () => {
    const onDisk = readdirSync(join(repoRoot, "resources", "plugins"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(BUNDLED_PLUGIN_CORE_SKILLS.map((plugin) => plugin.pluginName)).toEqual(onDisk);
    expect(BUNDLED_PLUGIN_CORE_SKILLS.every((plugin) => plugin.coreSkill.length > 0)).toBe(true);
  });

  it("binds every built-in MCP to at least one of those core skills", () => {
    for (const id of BUILT_IN_MCP_SERVER_IDS) {
      expect(coreSkillsForBuiltInMcp(id).length, `${id} has no plugin core skill`).toBeGreaterThan(
        0,
      );
    }
    expect(uniqueCoreSkillForBuiltInMcp("browser")).toBe("browser-control");
    expect(uniqueCoreSkillForBuiltInMcp("chrome")).toBe("chrome-control");
    expect(uniqueCoreSkillForBuiltInMcp("computer-use")).toBe("computer-use");
    expect(uniqueCoreSkillForBuiltInMcp("crossagents")).toBe("subagent-delegation");
    expect(coreSkillsForBuiltInMcp("app-controls")).toEqual([
      "app-controls",
      "terminal-inspection",
    ]);
  });

  it("keeps the load phrase stable so MCP instructions can share one test", () => {
    expect(loadPluginCoreSkillPhrase("browser-control")).toBe(
      "load the browser-control skill by name",
    );
  });
});
