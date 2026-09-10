import { PassThrough } from "node:stream";
import { vi } from "vitest";
import type { PermissionMode, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export function createClaudeTestQuery() {
  const output = new PassThrough({ objectMode: true });
  const controls = {
    interrupt: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setModel: vi.fn<(model?: string) => Promise<void>>().mockResolvedValue(undefined),
    setPermissionMode: vi
      .fn<(mode: PermissionMode) => Promise<void>>()
      .mockResolvedValue(undefined),
    applyFlagSettings: vi.fn<(settings: unknown) => Promise<void>>().mockResolvedValue(undefined),
    initializationResult: async () => ({ commands: [] }),
    supportedCommands: async () => [],
    supportedModels: async () => [],
    getContextUsage: async () => null,
    close: () => output.end(),
  };
  return { output, ...controls, runtime: Object.assign(output, controls) as unknown as Query };
}

export async function flushSdkMessages(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export function assistantMessage(sessionId: string, id: string): SDKMessage {
  return {
    type: "assistant",
    uuid: id,
    session_id: sessionId,
    parent_tool_use_id: null,
    message: { id, role: "assistant", content: [{ type: "text", text: id }] },
  } as unknown as SDKMessage;
}

export function resultMessage(sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    session_id: sessionId,
  } as unknown as SDKMessage;
}
