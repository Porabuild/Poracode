import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { findFastConfigOption } from "../acp/modelConfigOptions";
import {
  createFxAcpSessionUpdateTransform,
  FX_ACP_FAST_CONFIG_BINDING,
  FX_ACP_PROMPT_STEERING,
  normalizeFxAcpConfigOptions,
  resolveFxAcpMode,
} from "./acp";

function notification(update: Record<string, unknown>): SessionNotification {
  return { sessionId: "s1", update } as unknown as SessionNotification;
}

function readUpdate(value: SessionNotification): Record<string, unknown> {
  return value.update as unknown as Record<string, unknown>;
}

describe("resolveFxAcpMode", () => {
  it("uses the approval-policy mode when available", () => {
    expect(
      resolveFxAcpMode({ model: "m", approvalPolicy: "bypassPermissions" }, [
        "auto",
        "ask",
        "full-access",
      ]),
    ).toBe("full-access");
    expect(
      resolveFxAcpMode({ model: "m", approvalPolicy: "ask" }, ["auto", "ask", "full-access"]),
    ).toBe("ask");
    expect(resolveFxAcpMode({ model: "m" }, ["auto", "ask", "full-access"])).toBe("auto");
  });

  it("falls back to fx 0.0.13's code id for full access", () => {
    expect(
      resolveFxAcpMode({ model: "m", approvalPolicy: "bypassPermissions" }, ["ask", "code"]),
    ).toBe("code");
  });

  it("returns undefined when no advertised mode matches", () => {
    expect(
      resolveFxAcpMode({ model: "m", approvalPolicy: "bypassPermissions" }, ["ask"]),
    ).toBeUndefined();
  });
});

describe("normalizeFxAcpConfigOptions", () => {
  const provider = {
    id: "provider",
    category: "model",
    type: "select",
    currentValue: "gateway",
    options: [{ value: "gateway", name: "Vercel AI Gateway" }],
  };
  const model = {
    id: "model",
    category: "model",
    type: "select",
    currentValue: "spacexai/grok-4.7",
    options: [
      { value: "anthropic/claude-sonnet-5.5", name: "anthropic/claude-sonnet-5.5" },
      { value: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5" },
      { value: "spacexai/grok-4.7", name: "spacexai/grok-4.7" },
    ],
  };
  const mode = { id: "mode", category: "mode", type: "select", options: [{ value: "ask" }] };

  it("drops the provider select and leaves other options untouched", () => {
    const input = [provider, model, mode];
    const result = normalizeFxAcpConfigOptions(input);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(mode);
  });

  it("strips names that only repeat the value, keeps friendly names", () => {
    const option = normalizeFxAcpConfigOptions([
      {
        id: "model",
        type: "select",
        options: [
          { value: "auto", name: "auto" },
          { value: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5" },
        ],
      },
    ])[0] as { options: Array<{ value: string; name?: string }> };
    expect(option.options).toEqual([
      { value: "auto" },
      { value: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5" },
    ]);
  });

  it("regroups flat vendor/model values by prefix in first-seen order", () => {
    const option = normalizeFxAcpConfigOptions([model])[0] as {
      options: Array<{ group: string; name: string; options: unknown[] }>;
    };
    expect(option.options).toEqual([
      {
        group: "anthropic",
        name: "anthropic",
        options: [
          { value: "anthropic/claude-sonnet-5.5" },
          { value: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5" },
        ],
      },
      { group: "spacexai", name: "spacexai", options: [{ value: "spacexai/grok-4.7" }] },
    ]);
  });

  it("leaves the list flat when any value lacks a vendor prefix", () => {
    const option = normalizeFxAcpConfigOptions([
      {
        id: "model",
        type: "select",
        options: [{ value: "auto" }, { value: "spacexai/grok-4.7" }],
      },
    ])[0] as { options: Array<Record<string, unknown>> };
    expect(option.options).toEqual([{ value: "auto" }, { value: "spacexai/grok-4.7" }]);
  });

  it("never mutates the input", () => {
    const input = [provider, model, mode];
    const snapshot = structuredClone(input);
    normalizeFxAcpConfigOptions(input);
    expect(input).toEqual(snapshot);
  });
});

describe("createFxAcpSessionUpdateTransform", () => {
  it("maps a run subagent call and uses the trimmed title", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const result = transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        name: "subagent",
        title: "  Inspect the repo  ",
        rawInput: { action: "run", task: "Inspect the repo layout" },
      }),
    );
    expect(readUpdate(result)["rawInput"]).toEqual({
      action: "run",
      task: "Inspect the repo layout",
      subagent_type: "agent",
      prompt: "Inspect the repo layout",
      description: "Inspect the repo",
    });
  });

  it("falls back to the first task line truncated to 80 chars", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const firstLine = "x".repeat(100);
    const result = transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "call-2",
        name: "subagent",
        title: "",
        rawInput: { action: "run", task: `${firstLine}\nsecond line` },
      }),
    );
    expect(readUpdate(result)["rawInput"]).toMatchObject({
      description: "x".repeat(80),
    });
  });

  it("remembers a subagent tool call for its tool_call_update", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "call-3",
        name: "subagent",
        title: "Check tests",
        rawInput: { action: "run", task: "Run tests" },
      }),
    );
    const result = transform(
      notification({
        sessionUpdate: "tool_call_update",
        toolCallId: "call-3",
        rawInput: { action: "run", task: "Run tests" },
      }),
    );
    expect(readUpdate(result)["rawInput"]).toMatchObject({
      subagent_type: "agent",
      prompt: "Run tests",
      description: "Run tests",
    });
  });

  it("leaves message actions and non-subagent tools untouched", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const message = notification({
      sessionUpdate: "tool_call",
      toolCallId: "call-4",
      name: "subagent",
      title: "Message",
      rawInput: { action: "message", agent: "a1", message: "hello" },
    });
    expect(transform(message)).toBe(message);
    const other = notification({
      sessionUpdate: "tool_call",
      toolCallId: "call-5",
      name: "read_file",
      rawInput: { path: "a.ts" },
    });
    expect(transform(other)).toBe(other);
  });
});

describe("FX_ACP_PROMPT_STEERING", () => {
  it("supports only an exact true agentCapabilities._meta.fx.steering", () => {
    const supported = (value: unknown) =>
      FX_ACP_PROMPT_STEERING.isSupported({
        agentCapabilities: { _meta: { fx: { steering: value } } },
      } as never);
    expect(supported(true)).toBe(true);
    expect(supported(false)).toBe(false);
    expect(supported("true")).toBe(false);
    expect(FX_ACP_PROMPT_STEERING.isSupported({ agentCapabilities: { _meta: {} } } as never)).toBe(
      false,
    );
    expect(FX_ACP_PROMPT_STEERING.isSupported({} as never)).toBe(false);
  });

  it("marks steer prompts with the fx namespace", () => {
    expect(FX_ACP_PROMPT_STEERING.requestMeta).toEqual({ fx: { steer: true } });
  });
});

describe("FX_ACP_FAST_CONFIG_BINDING", () => {
  it("claims the exact fast select, never ultrafast, even when ultrafast is first", () => {
    const options = [
      {
        id: "ultrafast",
        category: "model",
        type: "select",
        options: [{ value: "false" }, { value: "true" }],
      },
      {
        id: "fast",
        category: "model",
        type: "select",
        options: [{ value: "false" }, { value: "true" }],
      },
    ];
    expect(findFastConfigOption(options, FX_ACP_FAST_CONFIG_BINDING)?.id).toBe("fast");
  });
});
