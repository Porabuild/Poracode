// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentStatus, GenerateTitlePayload } from "@/shared/contracts";
import {
  registerTitleGenDefaults,
  generateTitleWithFallback,
  resolveTitleGenConfig,
} from "./titleGen";
import "./claude";
import "./codex";

const claudeStatus: AgentStatus = {
  kind: "claude",
  label: "Claude Code",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "claude-opus-4-7", label: "Opus 4.7" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
    efforts: ["low", "medium", "high", "xHigh", "max"],
    defaultEffort: "high",
    modelEfforts: {
      haiku: [],
      sonnet: ["low", "medium", "high"],
    },
    modes: ["agent", "plan"],
    approvalPolicies: [{ id: "default", label: "Default" }],
    sandboxModes: [],
    settingDefs: [],
    supportsResume: true,
    supportsOneShot: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
  },
};

describe("resolveTitleGenConfig", () => {
  it("falls back to the registered Claude default (haiku) and the lowest effort", () => {
    expect(resolveTitleGenConfig(claudeStatus, "", "")).toEqual({
      model: "haiku",
      effort: "",
      availableEfforts: [],
    });
  });
});

describe("generateTitleWithFallback", () => {
  const projectLocation = { kind: "windows" as const, path: "C:\\repo" };
  type TitleInvoker = (payload: GenerateTitlePayload) => Promise<{ title: string }>;

  it("sends the complete nested selection for the resolved candidate", async () => {
    const invoke = vi.fn<TitleInvoker>().mockResolvedValue({ title: "T" });

    await generateTitleWithFallback({
      projectLocation,
      agentStatuses: [claudeStatus],
      provider: "claude",
      model: "sonnet",
      effort: "low",
      prompt: "summarize this thread",
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      prompt: "summarize this thread",
      selection: { model: "sonnet", effort: "low", fast: false },
    });
  });

  it("keeps empty/false carriers present in the payload instead of omitting them", async () => {
    const invoke = vi.fn<TitleInvoker>().mockResolvedValue({ title: "T" });

    await generateTitleWithFallback({
      projectLocation,
      agentStatuses: [claudeStatus],
      provider: "claude",
      // A preset resolved onto a model without effort options keeps the empty
      // effort and false fast carriers — a stamp could not supply them.
      model: "haiku",
      effort: "high",
      prompt: "summarize this thread",
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      prompt: "summarize this thread",
      // haiku exposes no effort options, so the resolved effort stays "".
      selection: { model: "haiku", effort: "", fast: false },
    });
  });

  it("a present canonical selection is the sole tuple and carries thinking/context/binding", async () => {
    const invoke = vi.fn<TitleInvoker>().mockResolvedValue({ title: "T" });
    const binding = {
      version: 1 as const,
      kind: "family-member" as const,
      owner: { agentKind: "claude", presentationMode: "terminal" as const },
      model: "haiku",
      inertValues: { effort: "", fast: false },
    };

    await generateTitleWithFallback({
      projectLocation,
      agentStatuses: [claudeStatus],
      provider: "claude",
      model: "ignored",
      effort: "ignored",
      fast: true,
      selection: {
        model: "haiku",
        effort: "",
        fast: false,
        thinking: false,
        contextSize: "default",
        selectionBinding: binding,
      },
      prompt: "summarize this thread",
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      prompt: "summarize this thread",
      selection: {
        model: "haiku",
        effort: "",
        fast: false,
        thinking: false,
        contextSize: "default",
        selectionBinding: binding,
      },
    });
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
  registerTitleGenDefaults(kind, { model: "default-model", effort: "low" });
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
      .fn<(payload: GenerateTitlePayload) => Promise<{ title: string; message: string }>>()
      .mockResolvedValue({ title: "Title", message: "Message" });
    await generateTitleWithFallback({
      projectLocation,
      agentStatuses: [agent],
      provider: kind,
      model: "stale",
      effort: "high",
      fast: true,
      selection,
      prompt: "fixture",
      invoke,
    });
    expect(invoke.mock.calls[0]?.[0].selection).toStrictEqual({
      ...selection,
      model: selection.model === "" ? "default-model" : selection.model,
    });
  });
  it("retains absent-object legacy default normalization", async () => {
    const invoke = vi
      .fn<(payload: GenerateTitlePayload) => Promise<{ title: string; message: string }>>()
      .mockResolvedValue({ title: "Title", message: "Message" });
    await generateTitleWithFallback({
      projectLocation,
      agentStatuses: [agent],
      provider: kind,
      model: "",
      effort: "",
      fast: false,
      prompt: "fixture",
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
    registerTitleGenDefaults(other.kind, { model: "default-model", effort: "low" });
    const selection = {
      model: "exact-uid",
      effort: "",
      fast: true,
      thinking: false,
      contextSize: "large",
    };
    const invoke = vi
      .fn<(payload: GenerateTitlePayload) => Promise<{ title: string; message: string }>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue({ title: "Title", message: "Message" });
    await generateTitleWithFallback({
      projectLocation,
      agentStatuses: [agent, other],
      provider: "auto",
      selection,
      prompt: "fixture",
      invoke,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    for (const [payload] of invoke.mock.calls) expect(payload.selection).toStrictEqual(selection);
    expect(invoke.mock.calls[0]?.[0].agentKind).not.toBe(invoke.mock.calls[1]?.[0].agentKind);
  });
});
