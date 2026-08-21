import { describe, expect, it } from "vitest";
import {
  AGENT_PROFILE_DRIVERS,
  agentProfileDriver,
  agentProfileKind,
  createProfilePayloadSchema,
  extractAgentProfileInstanceId,
  isAgentProfileDriver,
  isAgentProfileKind,
  parseAgentProfileKind,
  setProfileEnvironmentPayloadSchema,
} from "./agentProfiles";
import { claudeProfileKind, cursorProfileKind } from "./agentInstance";

describe("agent profile drivers", () => {
  it("keeps the per-provider kind helpers and the generic builder in agreement", () => {
    expect(agentProfileKind("claude", "work")).toBe(claudeProfileKind("work"));
    expect(agentProfileKind("cursor", "work")).toBe(cursorProfileKind("work"));
  });

  it("recognises every registered driver and nothing else", () => {
    for (const entry of AGENT_PROFILE_DRIVERS) {
      expect(isAgentProfileDriver(entry.driver)).toBe(true);
      expect(agentProfileDriver(entry.driver)).toEqual(entry);
    }
    // `acp-generic` shares the `<driver>:<id>` shape but is a standalone
    // registry agent, not a profile of a built-in provider.
    expect(isAgentProfileDriver("acp-generic")).toBe(false);
    expect(agentProfileDriver("acp-generic")).toBeUndefined();
  });

  it("parses profile kinds and rejects look-alikes", () => {
    expect(parseAgentProfileKind("claude:work")).toEqual({ driver: "claude", instanceId: "work" });
    expect(extractAgentProfileInstanceId("cursor:day-job")).toBe("day-job");

    // Base kinds, non-profile instance kinds, and empty ids are not profiles.
    expect(parseAgentProfileKind("claude")).toBeUndefined();
    expect(parseAgentProfileKind("acp-generic:gadget")).toBeUndefined();
    expect(parseAgentProfileKind("cursor:")).toBeUndefined();
    expect(isAgentProfileKind("codex")).toBe(false);
    expect(isAgentProfileKind("acp-generic:gadget")).toBe(false);
    expect(isAgentProfileKind("claude:work")).toBe(true);
  });

  it("keeps an instance id containing a colon addressable", () => {
    // `agentInstanceIdSchema` allows `:`, so only the first separator splits.
    expect(parseAgentProfileKind("claude:team:eu")).toEqual({
      driver: "claude",
      instanceId: "team:eu",
    });
  });
});

describe("profile IPC payloads", () => {
  it("accepts a free-form environment and a credential-only environment", () => {
    expect(
      setProfileEnvironmentPayloadSchema.parse({
        instanceId: "work",
        environment: { CURSOR_API_KEY: { value: "secret", sensitive: true } },
      }).environment.CURSOR_API_KEY?.sensitive,
    ).toBe(true);

    expect(
      setProfileEnvironmentPayloadSchema.parse({ instanceId: "glm", environment: {} }).environment,
    ).toEqual({});
  });

  it("accepts a config-only create and requires a display name", () => {
    const parsed = createProfilePayloadSchema.parse({
      driver: "claude",
      id: "work",
      displayName: "Work",
      config: { configDir: "~/.poracode/claude-profiles/work" },
    });
    expect(parsed.environment).toBeUndefined();
    expect(parsed.config).toEqual({ configDir: "~/.poracode/claude-profiles/work" });

    expect(() =>
      createProfilePayloadSchema.parse({ driver: "cursor", id: "work", displayName: "" }),
    ).toThrow(/displayName|too small/i);
  });
});
