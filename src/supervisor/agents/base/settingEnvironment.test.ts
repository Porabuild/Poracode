import { expect, it } from "vitest";
import type { AgentSettingDef } from "@/shared/contracts";
import { agentSettingsEnvironment } from "./settingEnvironment";

const definitions: AgentSettingDef[] = [
  {
    key: "enabled",
    type: "toggle",
    label: "Enabled",
    description: "Enable fixture",
    default: true,
    env: { ENABLED: "1" },
  },
  {
    key: "shell",
    type: "toggle",
    label: "Shell",
    description: "Windows fixture shell",
    default: true,
    platforms: ["win32"],
    env: { WINDOWS_SHELL: "1" },
  },
  {
    key: "speed",
    type: "select",
    label: "Speed",
    description: "Fixture speed",
    default: "5",
    envVar: "SPEED",
    options: [{ id: "5", label: "5" }],
  },
];

it("uses defaults only for supported settings on the process platform", () => {
  expect(agentSettingsEnvironment(definitions, undefined, "linux")).toEqual({
    ENABLED: "1",
    SPEED: "5",
  });
  expect(agentSettingsEnvironment(definitions, undefined, "win32")).toEqual({
    ENABLED: "1",
    WINDOWS_SHELL: "1",
    SPEED: "5",
  });
});

it("preserves false toggle overrides and explicit select values", () => {
  expect(
    agentSettingsEnvironment(definitions, { enabled: false, shell: false, speed: "8" }, "win32"),
  ).toEqual({ SPEED: "8" });
});
