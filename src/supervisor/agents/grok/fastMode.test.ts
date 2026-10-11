import { describe, expect, it, vi } from "vitest";
import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { AcpSessionConfigSync } from "../acp/sessionConfigSync";
import { GROK_AUTOMATION_RULES, buildGrokAcpArgs, buildGrokArgs } from "./argv";
import {
  foldGrokFastModels,
  resolveGrokAcpModel,
  resolveGrokCliModel,
  withGrokCliModel,
} from "./fastMode";

const models = [
  { id: "grok-4.7", label: "Grok 4.7" },
  { id: "grok-4.7-build-fast", label: "Grok 4.7 Fast" },
  { id: "grok-4.6", label: "Grok 4.6" },
  { id: "orphan-build-fast", label: "Orphan Fast" },
];

const configOptions = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "grok-4.7",
    options: [
      { value: "grok-4.7", name: "Grok 4.7" },
      { value: "grok-4.7-build-fast", name: "Grok 4.7 Fast" },
      { value: "grok-4.6", name: "Grok 4.6" },
    ],
  },
];

describe("foldGrokFastModels", () => {
  it("keeps a fast sibling that has no standard model", () => {
    const folded = foldGrokFastModels({
      models,
      modelEfforts: {
        "grok-4.7": ["high"],
        "grok-4.7-build-fast": ["high"],
        "orphan-build-fast": ["low"],
      },
      thinkingModels: ["grok-4.7-build-fast"],
    });
    expect(folded.models?.map((model) => model.id)).toEqual([
      "grok-4.7",
      "grok-4.6",
      "orphan-build-fast",
    ]);
    expect(folded.fastModels).toEqual(["grok-4.7"]);
    expect(folded.modelEfforts).toEqual({
      "grok-4.7": ["high"],
      "orphan-build-fast": ["low"],
    });
    expect(folded.thinkingModels).toEqual(["grok-4.7"]);
  });
});

describe("resolveGrokCliModel", () => {
  const fastModels = ["grok-4.7"];

  it("sends the sibling id only when Fast is on for a fast-capable model", () => {
    expect(resolveGrokCliModel({ model: "grok-4.7", fast: true }, fastModels)).toBe(
      "grok-4.7-build-fast",
    );
    expect(resolveGrokCliModel({ model: "grok-4.7", fast: false }, fastModels)).toBe("grok-4.7");
    expect(resolveGrokCliModel({ model: "grok-4.7" }, fastModels)).toBe("grok-4.7");
    expect(resolveGrokCliModel({ model: "grok-4.6", fast: true }, fastModels)).toBe("grok-4.6");
    expect(resolveGrokCliModel({ model: "grok-4.7-build-fast" }, fastModels)).toBe(
      "grok-4.7-build-fast",
    );
    expect(resolveGrokCliModel({ model: "grok-4.7-build-fast", fast: false }, fastModels)).toBe(
      "grok-4.7",
    );
  });

  it("preserves a fast-only model when an unsupported Fast toggle is false", () => {
    expect(resolveGrokCliModel({ model: "orphan-build-fast", fast: false }, fastModels)).toBe(
      "orphan-build-fast",
    );
    expect(resolveGrokCliModel({ model: "orphan-build-fast", fast: false }, undefined)).toBe(
      "orphan-build-fast",
    );
  });

  it("rewrites the launch config model without dropping the rest of the config", () => {
    const config = { model: "grok-4.7", fast: true, effort: "high" } as ThreadConfig;
    expect(withGrokCliModel(config, fastModels)).toEqual({
      model: "grok-4.7-build-fast",
      fast: true,
      effort: "high",
    });
  });
});

describe("resolveGrokAcpModel", () => {
  it("selects the build-fast option when Fast is on", () => {
    expect(
      resolveGrokAcpModel({ model: "grok-4.7", fast: true, effort: "high" }, configOptions),
    ).toMatchObject({ configId: "model", value: "grok-4.7-build-fast" });
  });

  it("selects the standard option when Fast is off, including a saved sibling id", () => {
    expect(resolveGrokAcpModel({ model: "grok-4.7", fast: false }, configOptions)?.value).toBe(
      "grok-4.7",
    );
    expect(
      resolveGrokAcpModel({ model: "grok-4.7-build-fast", fast: false }, configOptions)?.value,
    ).toBe("grok-4.7");
    expect(resolveGrokAcpModel({ model: "grok-4.7-build-fast" }, configOptions)?.value).toBe(
      "grok-4.7-build-fast",
    );
  });

  it("leaves a model without a fast sibling on that model", () => {
    expect(resolveGrokAcpModel({ model: "grok-4.6", fast: true }, configOptions)?.value).toBe(
      "grok-4.6",
    );
  });

  it("tells the live session to switch models when only Fast changes", async () => {
    const optionsFor = (currentValue: string) => [{ ...configOptions[0], currentValue }];
    const setSessionConfigOption = vi.fn<
      (args: { sessionId: string; configId: string; value: string }) => Promise<{
        configOptions: ReturnType<typeof optionsFor>;
      }>
    >(async (args) => ({
      configOptions: optionsFor(args.value),
    }));
    const connection = {
      setSessionMode: vi.fn<() => Promise<void>>(async () => undefined),
      setSessionConfigOption,
      request: vi.fn<() => Promise<void>>(async () => undefined),
    };
    const sync = new AcpSessionConfigSync(
      connection as unknown as ClientSideConnection,
      undefined,
      resolveGrokAcpModel,
    );
    sync.rememberOptions([], optionsFor("grok-4.7"));
    const standard = { model: "grok-4.7", effort: "high" } as ThreadConfig;

    await sync.applyTurnConfig("session-1", { ...standard, fast: true }, standard);
    await sync.applyTurnConfig("session-1", standard, { ...standard, fast: true });

    expect(setSessionConfigOption).toHaveBeenNthCalledWith(1, {
      sessionId: "session-1",
      configId: "model",
      value: "grok-4.7-build-fast",
    });
    expect(setSessionConfigOption).toHaveBeenNthCalledWith(2, {
      sessionId: "session-1",
      configId: "model",
      value: "grok-4.7",
    });
    expect(connection.request).not.toHaveBeenCalled();
  });
});

describe("Grok launch argv", () => {
  it("passes the fast sibling to -m and keeps effort", () => {
    const config = withGrokCliModel(
      { model: "grok-4.7", fast: true, effort: "high" } as ThreadConfig,
      ["grok-4.7"],
    );
    expect(buildGrokArgs(config, "", undefined)).toEqual([
      "--no-auto-update",
      "--rules",
      GROK_AUTOMATION_RULES,
      "-m",
      "grok-4.7-build-fast",
      "--reasoning-effort",
      "high",
    ]);
    expect(buildGrokAcpArgs(config)).toContain("grok-4.7-build-fast");
  });
});
