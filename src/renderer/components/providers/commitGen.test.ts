import { describe, expect, it } from "vitest";
import type { AgentStatus } from "../../../shared/contracts";
import { resolveCommitGenConfig } from "./commitGen";
import "./codex";

const codexStatus: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.1-codex-mini"],
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    modelEfforts: {
      "gpt-5.1-codex-mini": ["medium", "high"],
    },
    modes: ["agent", "plan"],
    approvalPolicies: ["on-request"],
    sandboxModes: ["workspace-write"],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
  },
};

describe("resolveCommitGenConfig", () => {
  it("falls back to provider defaults when the stored config is empty", () => {
    expect(resolveCommitGenConfig(codexStatus, "", "")).toEqual({
      model: "gpt-5.4-mini",
      effort: "low",
      availableEfforts: ["low", "medium", "high", "xhigh"],
    });
  });

  it("normalizes effort to the selected model's supported efforts", () => {
    expect(resolveCommitGenConfig(codexStatus, "gpt-5.1-codex-mini", "low")).toEqual({
      model: "gpt-5.1-codex-mini",
      effort: "high",
      availableEfforts: ["medium", "high"],
    });
  });
});
