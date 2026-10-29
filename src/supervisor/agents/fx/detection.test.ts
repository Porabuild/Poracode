import { describe, expect, it } from "vitest";
import {
  buildFxCapabilities,
  FX_TERMINAL_AUTH_METHOD,
  fxDefaultCapabilities,
  parseFxModelsJson,
  parseFxStatusJson,
} from "./detection";

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
      modes: ["auto", "ask", "full-access"],
    });
  });

  it("returns undefined for invalid JSON and wrong kinds", () => {
    expect(parseFxStatusJson("not json")).toBeUndefined();
    expect(parseFxStatusJson(JSON.stringify({ kind: "models", model: "x" }))).toBeUndefined();
    expect(parseFxStatusJson(JSON.stringify(["status"]))).toBeUndefined();
  });

  it("omits missing model/auth and tolerates malformed modes", () => {
    expect(parseFxStatusJson(JSON.stringify({ kind: "status", modes: [null, { id: 1 }] }))).toEqual(
      {
        modes: [],
      },
    );
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
    const capabilities = buildFxCapabilities({ model: "spacexai/grok-4.7", modes: [] }, models);
    expect(capabilities.models).toEqual([
      { id: "spacexai/grok-4.7", label: "Grok 4.7" },
      { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5" },
      { id: "openai/gpt-5.4-nano", label: "openai/gpt-5.4-nano" },
    ]);
  });

  it("sorts efforts canonically with auto last and keeps empty ladders empty", () => {
    const capabilities = buildFxCapabilities({ model: "spacexai/grok-4.7", modes: [] }, models);
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
      buildFxCapabilities({ model: "spacexai/grok-4.7", auth: "missing", modes: [] }, models)
        .authState,
    ).toBe("missing");
    expect(
      buildFxCapabilities(
        { model: "spacexai/grok-4.7", auth: "AI_GATEWAY_API_KEY", modes: [] },
        models,
      ).authState,
    ).toBe("authenticated");
    expect(buildFxCapabilities({ model: "spacexai/grok-4.7", modes: [] }, models).authState).toBe(
      undefined,
    );
  });

  it("always offers the terminal login method and logout", () => {
    const capabilities = buildFxCapabilities(undefined, models);
    expect(capabilities.authMethods).toEqual([FX_TERMINAL_AUTH_METHOD]);
    expect(capabilities.authLogoutSupported).toBe(true);
    expect(capabilities.approvalPolicies).toEqual(fxDefaultCapabilities.approvalPolicies);
  });

  it("falls back to the status default model when the catalog is unavailable", () => {
    const capabilities = buildFxCapabilities({ model: "spacexai/grok-4.7", modes: [] }, undefined);
    expect(capabilities.models).toEqual([{ id: "spacexai/grok-4.7", label: "spacexai/grok-4.7" }]);
    expect(capabilities.efforts).toEqual([]);
    expect(capabilities.modelEfforts).toEqual({ "spacexai/grok-4.7": [] });
  });
});
