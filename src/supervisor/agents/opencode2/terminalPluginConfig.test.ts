import { describe, expect, it } from "vitest";
import { readTerminalPluginTargets } from "./terminalPluginConfig";
describe("native terminal plugin configuration", () => {
  it("preserves native object entries and excludes control rules and local files", () => {
    expect(
      readTerminalPluginTargets(`{ // native JSONC
      plugins: ["*", "-disabled", "opencode.*", "./local.ts", "/path/plugin", "file:///plugin", "opencode.example@1.0.0", {package:"opencode.custom",options:{}}, "@vendor/pkg", {package:"github:vendor/plugin", options:{enabled:false}}, "@vendor/pkg"],
    }`),
    ).toEqual(["opencode.example@1.0.0", "opencode.custom", "@vendor/pkg", "github:vendor/plugin"]);
  });
  it("does not turn malformed configuration into an empty inventory", () => {
    expect(() => readTerminalPluginTargets("broken")).toThrow("JSON5");
    expect(() => readTerminalPluginTargets('{"plugins": {}}')).toThrow("Invalid terminal plugins");
  });
});
