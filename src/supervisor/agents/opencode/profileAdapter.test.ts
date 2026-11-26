import { describe, expect, it } from "vitest";
import { createOpenCodeProfileAdapter } from "./index";

const instance = {
  id: "work",
  driver: "opencode",
  displayName: "Work",
  config: {
    connection: "local" as const,
    endpoint: "http://127.0.0.1:11434/v1",
    model: "openai/gpt-oss:20b",
  },
};

describe("OpenCode local profile adapter", () => {
  it("pins the raw model and hides the base credential, plugin, and skill surfaces", () => {
    const adapter = createOpenCodeProfileAdapter(instance);
    expect(adapter.kind).toBe("opencode:work");
    expect(adapter.capabilities.models).toEqual([
      { id: "poracode-profile/openai/gpt-oss:20b", label: "openai/gpt-oss:20b" },
    ]);
    expect(adapter.capabilities.defaultEffort).toBeUndefined();
    expect(adapter.capabilities.efforts).toEqual([]);
    expect(adapter.capabilities.slashCommands).toBeUndefined();
    expect(adapter.manageCredentials).toBeUndefined();
    expect(adapter.managePlugins).toBeUndefined();
    expect(adapter.listNativePlugins).toBeUndefined();
    expect(adapter.skillSupport).toBeUndefined();
    // Profiles retire through their own lease; app shutdown never installs the
    // base adapter's global shutdown here.
    expect(adapter.shutdown).toBeUndefined();
  });

  it("keeps ordinary agent-default profiles on the base server path", () => {
    const adapter = createOpenCodeProfileAdapter({
      id: "account",
      driver: "opencode",
      displayName: "Account",
      config: { connection: "agent" },
    });
    expect(adapter.kind).toBe("opencode:account");
    expect(adapter.capabilities.models).toEqual([]);
    expect(adapter.manageCredentials).toBeDefined();
    expect(adapter.skillSupport).toBeDefined();
  });
});
