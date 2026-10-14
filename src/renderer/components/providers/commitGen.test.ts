// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentStatus, GenerateCommitMessagePayload } from "@/shared/contracts";
import {
  registerCommitGenDefaults,
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

    // The request carries the complete nested selection per candidate — the
    // scalar triple is gone from the payload.
    expect(invoke).toHaveBeenNthCalledWith(1, {
      projectLocation,
      agentKind: "codex",
      selection: { model: "gpt-5.6-terra", effort: "low", fast: false },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      projectLocation,
      agentKind: "claude",
      selection: { model: "sonnet", effort: "medium", fast: false },
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

  it("keeps the false Fast carrier present when the resolved model cannot use it", async () => {
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
      selection: { model: "sonnet", effort: "high", fast: false },
    });
  });

  it("keeps the true Fast carrier when the resolved model supports it", async () => {
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
      selection: { model: "claude-opus-4-7", effort: "high", fast: true },
    });
  });

  it("converts absent scalar inputs to the exact unstamped tuple (empty effort present)", async () => {
    const invoke = vi.fn<CommitMessageInvoker>().mockResolvedValue({ message: "feat: x" });

    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [fastClaude],
      provider: "claude",
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      selection: { model: "sonnet", effort: "medium", fast: false },
    });
  });

  it("a present canonical selection is the sole tuple: scalars are ignored and extras ride along", async () => {
    const invoke = vi.fn<CommitMessageInvoker>().mockResolvedValue({ message: "feat: x" });
    const binding = {
      version: 1 as const,
      kind: "family-member" as const,
      owner: { agentKind: "claude", presentationMode: "terminal" as const },
      model: "sonnet",
      inertValues: { effort: "medium" },
    };

    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [fastClaude],
      provider: "claude",
      model: "ignored-scalar-model",
      effort: "xhigh",
      fast: true,
      selection: {
        model: "sonnet",
        effort: "medium",
        fast: false,
        thinking: true,
        contextSize: "default",
        selectionBinding: binding,
      },
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      selection: {
        model: "sonnet",
        effort: "medium",
        fast: false,
        thinking: true,
        contextSize: "default",
        selectionBinding: binding,
      },
    });
  });

  it("carries mismatching intent unchanged for validation by the actual provider", async () => {
    const invoke = vi.fn<CommitMessageInvoker>().mockResolvedValue({ message: "feat: x" });
    const binding = {
      version: 1 as const,
      kind: "family-member" as const,
      owner: { agentKind: "claude", presentationMode: "terminal" as const },
      model: "sonnet",
      inertValues: { effort: "medium" },
    };

    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [fastClaude],
      provider: "claude",
      selection: {
        model: "claude-opus-4-7",
        effort: "high",
        fast: false,
        selectionBinding: binding,
      },
      invoke,
    });

    // Actual controls and metadata both reach consumption unchanged; the
    // provider must reject the mismatching record as evidence.
    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      selection: {
        model: "claude-opus-4-7",
        effort: "high",
        fast: false,
        selectionBinding: binding,
      },
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

describe("complete modern utility payloads", () => {
  const projectLocation = { kind: "posix" as const, path: "/fixture" };
  const kind = "fixture-profile:utility";
  const agent: AgentStatus = {
    kind,
    label: "Fixture",
    installed: true,
    authState: "authenticated",
    capabilities: {
      ...claudeStatus.capabilities,
      models: [
        { id: "m", label: "M" },
        { id: "default-model", label: "Default" },
      ],
      efforts: ["low", "high"],
      modelEfforts: {},
      defaultEffort: "high",
      supportsOneShot: true,
      fastModels: [],
    },
  };
  registerCommitGenDefaults(kind, { model: "default-model", effort: "low" });
  it.each([
    { model: "m" },
    { model: "m", effort: "", fast: false },
    { model: "exact-uid-not-in-catalog", effort: "high", fast: false },
    { model: "m", effort: "high", fast: true },
    { model: "m", effort: "unsupported", thinking: true, contextSize: "large" },
    { model: "m", thinking: false, contextSize: "" },
    { model: "" },
  ])("preserves modern tuple %j at the actual transport boundary", async (selection) => {
    const invoke = vi
      .fn<(payload: GenerateCommitMessagePayload) => Promise<{ title: string; message: string }>>()
      .mockResolvedValue({ title: "Title", message: "Message" });
    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [agent],
      provider: kind,
      model: "stale",
      effort: "high",
      fast: true,
      selection,
      invoke,
    });
    expect(invoke.mock.calls[0]?.[0].selection).toStrictEqual({
      ...selection,
      model: selection.model === "" ? "default-model" : selection.model,
    });
  });
  it("retains absent-object legacy default normalization", async () => {
    const invoke = vi
      .fn<(payload: GenerateCommitMessagePayload) => Promise<{ title: string; message: string }>>()
      .mockResolvedValue({ title: "Title", message: "Message" });
    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [agent],
      provider: kind,
      model: "",
      effort: "",
      fast: false,
      invoke,
    });
    expect(invoke.mock.calls[0]?.[0].selection).toStrictEqual({
      model: "default-model",
      effort: "low",
      fast: false,
    });
  });
  it("preserves the complete request across provider fallback", async () => {
    const other = { ...agent, kind: `${kind}:other` };
    registerCommitGenDefaults(other.kind, { model: "default-model", effort: "low" });
    const selection = {
      model: "exact-uid",
      effort: "",
      fast: true,
      thinking: false,
      contextSize: "large",
    };
    const invoke = vi
      .fn<(payload: GenerateCommitMessagePayload) => Promise<{ title: string; message: string }>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue({ title: "Title", message: "Message" });
    await generateCommitMessageWithFallback({
      projectLocation,
      agentStatuses: [agent, other],
      provider: "auto",
      selection,
      invoke,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    for (const [payload] of invoke.mock.calls) expect(payload.selection).toStrictEqual(selection);
    expect(invoke.mock.calls[0]?.[0].agentKind).not.toBe(invoke.mock.calls[1]?.[0].agentKind);
  });
});
