import { describe, expect, it } from "vitest";
import { accountLabel, mcpServerLabel, modelKey, modelLabel, providerLabel } from "./labels";

describe("profile labels", () => {
  it("keeps the compact profile vocabulary distinct from chat and usage labels", () => {
    expect(providerLabel("claude")).toBe("Claude");
    expect(providerLabel("copilot")).toBe("Copilot");
    expect(providerLabel("grok")).toBe("Grok");
    expect(providerLabel("acp-generic")).toBe("ACP Agent");
  });

  it("labels scoped accounts from their base provider", () => {
    expect(accountLabel("claude:work")).toBe("Claude - work");
    expect(accountLabel("claude:z-ai")).toBe("Claude - z.ai");
    expect(accountLabel("acp-generic:custom-agent")).toBe("ACP Agent - custom-agent");
  });

  it("title-cases unknown providers and normalized MCP server ids", () => {
    expect(providerLabel("my_custom-agent")).toBe("My Custom Agent");
    expect(mcpServerLabel("codex_apps")).toBe("Codex Apps");
    expect(mcpServerLabel("plugin_example_issue_tracker")).toBe("Issue Tracker");
  });

  it("round-trips provider/model pairs into human labels", () => {
    expect(modelLabel(modelKey("claude:work", "opus"))).toBe("opus (Claude - work)");
    expect(modelLabel(modelKey(null, "auto"))).toBe("auto");
  });
});
