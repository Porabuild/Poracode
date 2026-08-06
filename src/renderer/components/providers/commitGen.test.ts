// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentStatus, GenerateCommitMessagePayload } from "@/shared/contracts";
import {
  generateCommitMessageWithFallback,
  generateCommitMessageWithFallbackDetails,
  getCommitGenCandidates,
  getCommitGenDefaultsHint,
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
      { id: "gpt-5.6-luna", label: "5.6 Luna" },
      { id: "gpt-5.6-terra", label: "5.6 Terra" },
      { id: "gpt-5.6-sol", label: "5.6 Sol" },
      { id: "gpt-5.5", label: "5.5" },
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
    supportsOneShot: true,
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
      { id: "claude-opus-4-7", label: "Opus 4.7" },
      { id: "claude-opus-4-6", label: "Opus 4.6" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
    efforts: ["low", "medium", "high", "xHigh", "max"],
    defaultEffort: "high",
    modelEfforts: {
      "claude-opus-4-6": ["low", "medium", "high", "max"],
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
    supportsOneShot: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
  },
};

describe("resolveCommitGenConfig", () => {
  it("falls back to the registered Codex default (5.6 Terra + low)", () => {
    expect(resolveCommitGenConfig(codexStatus, "", "")).toEqual({
      model: "gpt-5.6-terra",
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
  it("filters out providers whose registered model is not in capabilities", () => {
    // The fake "gemini" entry has Claude capabilities (no gemini-3-flash), so it
    // gets filtered out under auto's strict per-section preferred-model rule.
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
    ).toEqual([codexStatus]);
  });

  it("excludes installed providers that cannot run a one-shot generation", () => {
    // Factory Droid (ACP-registry generic) speaks only interactive sessions, so
    // it must never appear as a commit-message candidate — auto or explicit.
    const factoryDroid: AgentStatus = {
      ...codexStatus,
      kind: "acp-generic:factory-droid",
      label: "Factory Droid",
      capabilities: { ...codexStatus.capabilities, supportsOneShot: false },
    };
    expect(getCommitGenCandidates([codexStatus, factoryDroid], "auto")).toEqual([codexStatus]);
    expect(getCommitGenCandidates([factoryDroid], "acp-generic:factory-droid")).toEqual([]);
  });

  it("falls back to all installed agents when no provider has its preferred model", () => {
    // Codex without its gpt-5.6-terra default — strict filter would empty the
    // list, so the helper loosens to the full installed set sorted by preference.
    const codexWithoutPreferred: AgentStatus = {
      ...codexStatus,
      capabilities: {
        ...codexStatus.capabilities,
        models: [{ id: "gpt-5.6-sol", label: "5.6 Sol" }],
      },
    };
    expect(getCommitGenCandidates([codexWithoutPreferred], "auto")).toEqual([
      codexWithoutPreferred,
    ]);
  });
});

describe("provider default hints", () => {
  it("builds commit-generation hint text from provider registrations", () => {
    expect(getCommitGenDefaultsHint()).toBe(
      "Defaults: Claude -> Sonnet medium, Codex -> GPT-5.6 Terra low, Copilot -> auto, Cursor -> Composer 2.5 Fast, Gemini -> 3 Flash",
    );
  });
});

describe("generateCommitMessageWithFallback", () => {
  const projectLocation = {
    kind: "windows" as const,
    path: "C:\\repo",
  };
  type CommitMessageInvoker = (
    payload: GenerateCommitMessagePayload,
  ) => Promise<{ message: string }>;

  it("falls back to the next auto provider when the first provider fails", async () => {
    const invoke = vi.fn<CommitMessageInvoker>();
    invoke.mockRejectedValueOnce(new Error("Codex CLI not found: codex"));
    invoke.mockResolvedValueOnce({ message: "fix(git): restore commit generation" });

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
      model: "gpt-5.6-terra",
      effort: "low",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      projectLocation,
      agentKind: "claude",
      model: "sonnet",
      effort: "medium",
    });
  });

  it("returns the provider and model that actually generated the message", async () => {
    const invoke = vi.fn<CommitMessageInvoker>();
    invoke.mockRejectedValueOnce(new Error("Codex CLI not found: codex"));
    invoke.mockResolvedValueOnce({ message: "fix(git): restore commit generation" });

    await expect(
      generateCommitMessageWithFallbackDetails({
        projectLocation,
        agentStatuses: [codexStatus, claudeStatus],
        provider: "auto",
        model: "",
        effort: "",
        invoke,
      }),
    ).resolves.toEqual({
      message: "fix(git): restore commit generation",
      provider: "claude",
      model: "sonnet",
    });
  });

  const fastClaude: AgentStatus = {
    ...claudeStatus,
    capabilities: { ...claudeStatus.capabilities, fastModels: ["claude-opus-4-7"] },
  };

  it("forwards fast mode when the resolved model supports it", async () => {
    const invoke = vi.fn<CommitMessageInvoker>().mockResolvedValue({ message: "feat: x" });

    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [fastClaude],
      provider: "claude",
      model: "claude-opus-4-7",
      effort: "high",
      fast: true,
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      model: "claude-opus-4-7",
      effort: "high",
      fast: true,
    });
  });

  it("omits fast mode when the resolved model is not fast-capable", async () => {
    const invoke = vi.fn<CommitMessageInvoker>().mockResolvedValue({ message: "feat: x" });

    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [fastClaude],
      provider: "claude",
      model: "sonnet",
      effort: "high",
      fast: true,
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      model: "sonnet",
      effort: "high",
    });
  });

  it("does not fall back when a specific provider is selected", async () => {
    const invoke = vi.fn<CommitMessageInvoker>();
    invoke.mockRejectedValueOnce(new Error("Codex CLI not found: codex"));

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
