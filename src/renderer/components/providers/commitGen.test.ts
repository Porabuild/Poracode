import { describe, expect, it, vi } from "vitest";
import type { AgentStatus, GenerateCommitMessagePayload } from "../../../shared/contracts";
import { getCommitGenDefaultsHint } from "./ProviderIcon";
import {
  generateCommitMessageWithFallback,
  getCommitGenCandidates,
  resolveCommitGenConfig,
} from "./commitGen";
import "./claude";
import "./copilot";
import "./codex";
import "./cursor";
import "./gemini";

const codexStatus: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "gpt-5.4", label: "5.4" },
      { id: "gpt-5.4-mini", label: "5.4 Mini" },
      { id: "gpt-5.1-codex-mini", label: "5.1 Codex Mini" },
    ],
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    modelEfforts: {
      "gpt-5.1-codex-mini": ["medium", "high"],
    },
    modes: ["agent", "plan"],
    approvalPolicies: [{ id: "on-request", label: "On Request" }],
    sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

const claudeStatus: AgentStatus = {
  kind: "claude",
  label: "Claude Code",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "claude-opus-4-6[1m]", label: "Opus 1M" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "high",
    modelEfforts: {
      haiku: [],
      sonnet: ["low", "medium", "high"],
    },
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "default", label: "Default" },
      { id: "auto", label: "Auto" },
    ],
    sandboxModes: [],
    settingDefs: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
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
  it("returns installed agents with non-missing auth", () => {
    expect(
      getCommitGenCandidates(
        [
          codexStatus,
          { ...claudeStatus, installed: false },
          { ...claudeStatus, kind: "gemini", label: "Gemini", authState: "missing" },
          { ...claudeStatus, kind: "gemini", label: "Gemini WSL", authState: "unknown" },
        ],
        "auto",
      ),
    ).toEqual([
      codexStatus,
      { ...claudeStatus, kind: "gemini", label: "Gemini WSL", authState: "unknown" },
    ]);
  });
});

describe("provider default hints", () => {
  it("builds commit-generation hint text from provider registrations", () => {
    expect(getCommitGenDefaultsHint()).toBe(
      "Defaults: Claude -> Haiku, Codex -> GPT-5.4 Mini, Copilot -> first available model, Cursor -> Auto, Gemini -> Flash",
    );
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
