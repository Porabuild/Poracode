import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY } from "../acp/canonicalMapping/subagents";
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

  it("marks a new assistant message id without breaking the previous one", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const chunk = (messageId: string | undefined, text: string) =>
      notification({
        sessionUpdate: "agent_message_chunk",
        ...(messageId === undefined ? {} : { messageId }),
        content: { type: "text", text },
      });

    const first = chunk("m1", "first");
    expect(transform(first)).toBe(first);
    const sameId = chunk("m1", "still first");
    expect(transform(sameId)).toBe(sameId);
    const withoutId = chunk(undefined, "no id");
    expect(transform(withoutId)).toBe(withoutId);
    const stillFirst = chunk("m1", "after the id-less chunk");
    expect(transform(stillFirst)).toBe(stillFirst);

    const next = notification({
      sessionUpdate: "agent_message_chunk",
      messageId: "m2",
      _meta: { keep: "yes" },
      content: { type: "text", text: "second message" },
    });
    const marked = transform(next);
    expect(marked).not.toBe(next);
    expect(readUpdate(marked)["_meta"]).toEqual({
      keep: "yes",
      [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: "owner",
    });
  });

  it("leaves agent_thought_chunk untouched", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const thought = notification({
      sessionUpdate: "agent_thought_chunk",
      messageId: "t1",
      content: { type: "text", text: "thinking" },
    });
    expect(transform(thought)).toBe(thought);
  });

  it("unwraps sub-agent result envelopes into the produced text", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "sub-1",
        name: "subagent",
        rawInput: { action: "run", task: "check strings" },
      }),
    );

    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "sub-1",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              ok: true,
              result: "`src/strings.ts` contains 3 lines.",
              error_code: null,
            }),
          },
        },
      ],
    });
    expect(readUpdate(transform(update))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "`src/strings.ts` contains 3 lines." } },
    ]);

    const failed = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "sub-1",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({ ok: false, result: null, error_code: "timeout" }),
          },
        },
      ],
    });
    expect(readUpdate(transform(failed))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "timeout" } },
    ]);

    const plain = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "sub-1",
      content: [{ type: "content", content: { type: "text", text: "not json" } }],
    });
    expect(transform(plain)).toBe(plain);
  });

  it("unwraps fx tool-error envelopes only while the frame is failed", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const envelope = JSON.stringify({
      error: {
        type: "tool_permission_denied",
        tool_name: "shell",
        message: "Permission denied by user",
        reason: "user_denied",
        denied: true,
      },
    });
    const content = [{ type: "content", content: { type: "text", text: envelope } }];

    const failed = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "shell-1",
      status: "failed",
      content,
    });
    expect(readUpdate(transform(failed))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "Permission denied by user" } },
    ]);

    const completed = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "shell-1",
      status: "completed",
      content,
    });
    expect(transform(completed)).toBe(completed);
  });

  it("leaves a failed command's own JSON stdout untouched", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "shell-2",
      status: "failed",
      content: [
        {
          type: "content",
          content: { type: "text", text: JSON.stringify({ error: { message: "Not Found" } }) },
        },
      ],
    });
    expect(transform(update)).toBe(update);
  });

  it("adds the error detail when Stop cancels a sub-agent", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "sub-cancel",
        name: "subagent",
        rawInput: { action: "run", task: "Run wc -l" },
      }),
    );
    const cancelled = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "sub-cancel",
      status: "failed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              error: {
                type: "tool_execution_failed",
                tool_name: "subagent",
                message: "Tool execution failed",
                details: { error: "Cancelled" },
              },
            }),
          },
        },
      ],
    });
    expect(readUpdate(transform(cancelled))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "Tool execution failed: Cancelled" } },
    ]);
  });

  it("leaves an error envelope without fx's tool_name untouched", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "shell-3",
      status: "failed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({ error: { type: "invalid_request_error", message: "Bad" } }),
          },
        },
      ],
    });
    expect(transform(update)).toBe(update);
  });

  it("expands multi-item MCP results in order", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "mcp-multi",
        name: "mcp_fx-smoke_echo",
        _meta: { fx: { toolCall: { mcp: { server: "fx-smoke", tool: "echo" } } } },
      }),
    );

    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "mcp-multi",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              server: "fx-smoke",
              tool: "echo",
              result: {
                content: [
                  { type: "text", text: "a" },
                  { type: "image", data: "AAAA", mimeType: "image/png" },
                ],
              },
            }),
          },
        },
      ],
    });
    expect(readUpdate(transform(update))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "a" } },
      { type: "content", content: { type: "image", data: "AAAA", mimeType: "image/png" } },
    ]);
  });

  it("prefers the sub-agent envelope over the permission-denial rule", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "sub-failed",
        name: "subagent",
        rawInput: { action: "run", task: "fail" },
      }),
    );
    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "sub-failed",
      status: "failed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              ok: false,
              error: { message: "boom" },
              error_code: "x",
            }),
          },
        },
      ],
    });
    expect(readUpdate(transform(update))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "boom" } },
    ]);
  });

  it("unwraps envelopes on a tool_call frame, not only a tool_call_update", () => {
    const transform = createFxAcpSessionUpdateTransform();
    const update = notification({
      sessionUpdate: "tool_call",
      toolCallId: "sub-frame",
      name: "subagent",
      content: [
        {
          type: "content",
          content: { type: "text", text: JSON.stringify({ ok: true, result: "done" }) },
        },
      ],
    });
    expect(readUpdate(transform(update))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "done" } },
    ]);
  });

  it("expands MCP result wrappers into their content entries", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "mcp-1",
        name: "mcp_fx-smoke_echo",
        title: "echo",
        _meta: { fx: { toolCall: { internal: false, mcp: { server: "fx-smoke", tool: "echo" } } } },
      }),
    );

    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "mcp-1",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              server: "fx-smoke",
              tool: "mcp_fx-smoke_echo",
              result: { content: [{ type: "text", text: "echo: RAW3" }], isError: false },
            }),
          },
        },
      ],
    });
    expect(readUpdate(transform(update))["content"]).toEqual([
      { type: "content", content: { type: "text", text: "echo: RAW3" } },
    ]);

    const weird = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "mcp-1",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              server: "fx-smoke",
              tool: "echo",
              result: { content: [{ type: "weird" }] },
            }),
          },
        },
      ],
    });
    expect(transform(weird)).toBe(weird);

    const nonMcp = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "read-1",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              server: "fx-smoke",
              tool: "echo",
              result: { content: [{ type: "text", text: "echo: RAW3" }] },
            }),
          },
        },
      ],
    });
    expect(transform(nonMcp)).toBe(nonMcp);
  });

  it("never mutates the input while rewriting", () => {
    const transform = createFxAcpSessionUpdateTransform();
    transform(
      notification({
        sessionUpdate: "tool_call",
        toolCallId: "mcp-mutate",
        name: "mcp_fx-smoke_echo",
        _meta: { fx: { toolCall: { mcp: { server: "fx-smoke", tool: "echo" } } } },
      }),
    );
    const update = notification({
      sessionUpdate: "tool_call_update",
      toolCallId: "mcp-mutate",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: JSON.stringify({
              server: "fx-smoke",
              tool: "echo",
              result: { content: [{ type: "text", text: "echo: RAW3" }] },
            }),
          },
        },
      ],
    });
    const snapshot = structuredClone(update);
    transform(update);
    expect(update).toEqual(snapshot);

    const message = notification({
      sessionUpdate: "agent_message_chunk",
      messageId: "first",
      content: { type: "text", text: "one" },
    });
    transform(message);
    const nextMessage = notification({
      sessionUpdate: "agent_message_chunk",
      messageId: "second",
      _meta: { keep: true },
      content: { type: "text", text: "two" },
    });
    const messageSnapshot = structuredClone(nextMessage);
    transform(nextMessage);
    expect(nextMessage).toEqual(messageSnapshot);
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
