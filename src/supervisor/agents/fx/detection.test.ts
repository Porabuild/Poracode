import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectProbeCtx } from "../base";
import {
  buildFxCapabilities,
  FX_TERMINAL_AUTH_METHOD,
  fxDefaultCapabilities,
  parseFxModelsJson,
  parseFxStatusJson,
  probeFxCapabilities,
} from "./detection";

const base = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<typeof import("../base").readAgentCommandOutput>(),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  ...base,
}));

describe("parseFxStatusJson", () => {
  it("parses the status payload", () => {
    const stdout = JSON.stringify({
      kind: "status",
      model: "spacexai/grok-4.7",
      effort: "auto",
      auth: "AI_GATEWAY_API_KEY",
      permission_mode: "ask",
      modes: [
        { id: "auto", name: "Auto" },
        { id: "ask", name: "Ask" },
        { id: "full-access", name: "Full access" },
      ],
    });
    expect(parseFxStatusJson(stdout)).toEqual({
      model: "spacexai/grok-4.7",
      auth: "AI_GATEWAY_API_KEY",
    });
  });

  it("returns undefined for invalid JSON and wrong kinds", () => {
    expect(parseFxStatusJson("not json")).toBeUndefined();
    expect(parseFxStatusJson(JSON.stringify({ kind: "models", model: "x" }))).toBeUndefined();
    expect(parseFxStatusJson(JSON.stringify(["status"]))).toBeUndefined();
  });

  it("omits missing model/auth", () => {
    expect(parseFxStatusJson(JSON.stringify({ kind: "status" }))).toEqual({});
  });
});

describe("parseFxModelsJson", () => {
  it("parses entries and skips ones without a string id", () => {
    const stdout = JSON.stringify({
      kind: "models",
      count: 2,
      models: [
        {
          id: "anthropic/claude-opus-5.5",
          name: "Claude Opus 5.5",
          efforts: ["low", "medium", "high", "xhigh", "max"],
          fast: true,
          ultrafast: false,
        },
        { name: "No id", efforts: ["low"], fast: true },
        { id: 42, name: "Numeric id" },
      ],
    });
    expect(parseFxModelsJson(stdout)).toEqual([
      {
        id: "anthropic/claude-opus-5.5",
        name: "Claude Opus 5.5",
        efforts: ["low", "medium", "high", "xhigh", "max"],
        fast: true,
      },
    ]);
  });

  it("returns undefined for invalid JSON and wrong kinds", () => {
    expect(parseFxModelsJson("{")).toBeUndefined();
    expect(parseFxModelsJson(JSON.stringify({ kind: "status", models: [] }))).toBeUndefined();
    expect(parseFxModelsJson(JSON.stringify({ kind: "models", models: {} }))).toBeUndefined();
  });
});

describe("buildFxCapabilities", () => {
  const models = [
    {
      id: "anthropic/claude-opus-5.5",
      name: "Claude Opus 5.5",
      efforts: ["low", "medium", "high", "xhigh", "max"],
      fast: true,
    },
    {
      id: "spacexai/grok-4.7",
      name: "Grok 4.7",
      efforts: ["low", "xhigh", "auto", "medium", "high"],
      fast: false,
    },
    {
      id: "openai/gpt-5.4-nano",
      name: "  ",
      efforts: [],
      fast: false,
    },
  ];

  it("moves the status default model first and keeps fx's order otherwise", () => {
    const capabilities = buildFxCapabilities({ model: "spacexai/grok-4.7" }, models);
    expect(capabilities.models).toEqual([
      { id: "spacexai/grok-4.7", label: "Grok 4.7" },
      { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5" },
      { id: "openai/gpt-5.4-nano", label: "openai/gpt-5.4-nano" },
    ]);
  });

  it("sorts efforts canonically with auto last and keeps empty ladders empty", () => {
    const capabilities = buildFxCapabilities({ model: "spacexai/grok-4.7" }, models);
    expect(capabilities.modelEfforts?.["spacexai/grok-4.7"]).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "auto",
    ]);
    expect(capabilities.modelEfforts?.["openai/gpt-5.4-nano"]).toEqual([]);
    expect(capabilities.modelEfforts?.["anthropic/claude-opus-5.5"]).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "auto",
    ]);
    expect(capabilities.efforts).toEqual(["low", "medium", "high", "xhigh", "auto"]);
    expect(capabilities.defaultEffort).toBe("auto");
  });

  it("reports fast-capable models only", () => {
    const capabilities = buildFxCapabilities(undefined, models);
    expect(capabilities.fastModels).toEqual(["anthropic/claude-opus-5.5"]);
    expect(buildFxCapabilities(undefined, [models[1]!]).fastModels).toBeUndefined();
  });

  it("groups sub-providers only when every id has a vendor prefix", () => {
    expect(buildFxCapabilities(undefined, models).subProviders).toEqual([
      { id: "anthropic", label: "anthropic" },
      { id: "spacexai", label: "spacexai" },
      { id: "openai", label: "openai" },
    ]);
    expect(
      buildFxCapabilities(undefined, [
        { id: "grok", name: "Grok", efforts: [], fast: false },
        { id: "openai/gpt", name: "GPT", efforts: [], fast: false },
      ]).subProviders,
    ).toBeUndefined();
  });

  it("maps auth to missing/authenticated and omits unknown", () => {
    expect(
      buildFxCapabilities({ model: "spacexai/grok-4.7", auth: "missing" }, models).authState,
    ).toBe("missing");
    expect(
      buildFxCapabilities({ model: "spacexai/grok-4.7", auth: "AI_GATEWAY_API_KEY" }, models)
        .authState,
    ).toBe("authenticated");
    expect(buildFxCapabilities({ model: "spacexai/grok-4.7" }, models).authState).toBe(undefined);
  });

  it("offers the terminal login method and leaves logout to the per-backend panel", () => {
    const capabilities = buildFxCapabilities(undefined, models);
    expect(capabilities.authMethods).toEqual([FX_TERMINAL_AUTH_METHOD]);
    expect(capabilities.authLogoutSupported).toBeUndefined();
    expect(capabilities.approvalPolicies).toEqual(fxDefaultCapabilities.approvalPolicies);
  });

  it("falls back to the status default model when the catalog is unavailable", () => {
    const capabilities = buildFxCapabilities({ model: "spacexai/grok-4.7" }, undefined);
    expect(capabilities.models).toEqual([{ id: "spacexai/grok-4.7", label: "spacexai/grok-4.7" }]);
    expect(capabilities.efforts).toEqual([]);
    expect(capabilities.modelEfforts).toEqual({ "spacexai/grok-4.7": [] });
  });

  it("reports connected backends as provider metadata when given", () => {
    const connectedProviders = [
      { id: "codex", label: "Codex" },
      { id: "grok", label: "Grok" },
    ];
    expect(buildFxCapabilities(undefined, models, connectedProviders).providerMetadata).toEqual({
      connectedProviders,
    });
    expect(buildFxCapabilities(undefined, models).providerMetadata).toBeUndefined();
  });
});

describe("probeFxCapabilities", () => {
  beforeEach(() => {
    base.readAgentCommandOutput.mockReset();
  });

  it("adds the backends from the pinned status call to provider metadata", async () => {
    base.readAgentCommandOutput.mockImplementation(async (_location, _binary, _args, options) =>
      options?.env?.["FX_PROVIDER"] === "codex"
        ? {
            ok: true,
            stdout: JSON.stringify({
              kind: "status",
              connected_providers: ["grok", "vercel-ai-gateway"],
            }),
            stderr: "",
          }
        : { ok: false, stdout: "", stderr: "" },
    );
    const ctx: DetectProbeCtx = {
      location: { kind: "posix", path: "/tmp/demo" },
      executablePath: "/usr/local/bin/fx",
      probeEnv: { FX_AUTO_UPGRADE: "0" },
    };

    const capabilities = await probeFxCapabilities(ctx);

    expect(capabilities.providerMetadata).toEqual({
      connectedProviders: [
        { id: "vercel", label: "Vercel AI Gateway" },
        { id: "grok", label: "Grok" },
      ],
    });
    const pinned = base.readAgentCommandOutput.mock.calls.filter(
      ([, , , options]) => options?.env?.["FX_PROVIDER"] === "codex",
    );
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.[2]).toEqual(["status", "--json"]);
    expect(pinned[0]?.[3]?.env).toEqual({
      FX_AUTO_UPGRADE: "0",
      FX_PROVIDER: "codex",
      FX_MODEL: "poracode-status-probe",
    });
  });
});
