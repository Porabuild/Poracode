import { describe, expect, it, vi } from "vitest";
import type { AgentStatus, GenerateCommitMessagePayload } from "../../../shared/contracts";
import {
  generateCommitMessageWithFallback,
  getCommitGenCandidates,
  resolveCommitGenConfig,
} from "./commitGen";
import "./claude";
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

const claudeStatus: AgentStatus = {
  kind: "claude",
  label: "Claude Code",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: ["claude-opus-4-6[1m]", "sonnet", "haiku"],
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "high",
    modelEfforts: {
      haiku: [],
      sonnet: ["low", "medium", "high"],
    },
    modes: ["agent", "plan"],
    approvalPolicies: ["default", "auto"],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
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

describe("getCommitGenCandidates", () => {
  it("returns only authenticated installed agents", () => {
    expect(
      getCommitGenCandidates(
        [
          codexStatus,
          { ...claudeStatus, installed: false },
          { ...claudeStatus, kind: "gemini", label: "Gemini", authState: "unknown" },
        ],
        "auto",
      ),
    ).toEqual([codexStatus]);
  });
});

describe("generateCommitMessageWithFallback", () => {
  const projectLocation = {
    kind: "windows" as const,
    path: "C:\\repo",
  };

  it("falls back to the next auto provider when the first provider fails", async () => {
    const invoke = vi
      .fn<(payload: GenerateCommitMessagePayload) => Promise<{ message: string }>>()
      .mockRejectedValueOnce(new Error("Codex CLI not found: codex"))
      .mockResolvedValueOnce({ message: "fix(git): restore commit generation" });

    await expect(
      generateCommitMessageWithFallback({
        projectLocation,
        agentStatuses: [codexStatus, claudeStatus],
        provider: "auto",
        model: "",
        effort: "",
        invoke,
      }),
    ).resolves.toBe("fix(git): restore commit generation");

    expect(invoke).toHaveBeenNthCalledWith(1, {
      projectLocation,
      agentKind: "codex",
      model: "gpt-5.4-mini",
      effort: "low",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      projectLocation,
      agentKind: "claude",
      model: "haiku",
      effort: "high",
    });
  });

  it("does not fall back when a specific provider is selected", async () => {
    const invoke = vi
      .fn<(payload: GenerateCommitMessagePayload) => Promise<{ message: string }>>()
      .mockRejectedValueOnce(new Error("Codex CLI not found: codex"));

    await expect(
      generateCommitMessageWithFallback({
        projectLocation,
        agentStatuses: [codexStatus, claudeStatus],
        provider: "codex",
        model: "",
        effort: "",
        invoke,
      }),
    ).rejects.toThrow("Codex CLI not found: codex");

    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
