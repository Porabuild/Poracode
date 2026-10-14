import { createHash } from "node:crypto";
import type { ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base";
import { resolveSessionCwd } from "../acp/sessionPaths";
import { buildCursorSdkMcpServers } from "../userMcp";
import type { CursorSdkModelSelection } from "./sdkModels";
import type { CursorSdkWorkerAgentOptions, CursorSdkWorkerSendOptions } from "./sdkWorkerProtocol";

export interface CursorSdkSafetyPosture {
  autoReview: boolean;
  sandboxEnabled: boolean;
}

function sdkMode(config: ThreadConfig): "agent" | "plan" {
  return config.mode === "plan" ? "plan" : "agent";
}

function sdkAutoReview(config: ThreadConfig): boolean {
  return config.approvalPolicy !== "never";
}

function sdkSandboxEnabled(config: ThreadConfig): boolean {
  return config.sandboxMode !== "danger-full-access";
}

export function sdkSafetyPosture(config: ThreadConfig): CursorSdkSafetyPosture {
  return {
    autoReview: sdkAutoReview(config),
    sandboxEnabled: sdkSandboxEnabled(config),
  };
}

export function sameSdkSafetyPosture(
  left: CursorSdkSafetyPosture,
  right: CursorSdkSafetyPosture,
): boolean {
  return left.autoReview === right.autoReview && left.sandboxEnabled === right.sandboxEnabled;
}

/**
 * Give every fresh local SDK agent a stable Cursor-shaped identity before the
 * provider creates any durable state. If Poracode or the worker exits after
 * Agent.create() but before the returned session ref is persisted, retrying
 * the same thread can safely resume this identity instead of orphaning a
 * second conversation.
 */
export function cursorSdkAgentId(threadId: string): string {
  const digest = createHash("sha256")
    .update("poracode/cursor-sdk/agent-id\0", "utf8")
    .update(threadId, "utf8")
    .digest("hex");
  const versioned = `5${digest.slice(13, 16)}`;
  const variant = ((Number.parseInt(digest[16]!, 16) & 0x3) | 0x8).toString(16);
  return `agent-${digest.slice(0, 8)}-${digest.slice(8, 12)}-${versioned}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function buildCursorSdkAgentOptions(
  config: ThreadConfig,
  model: CursorSdkModelSelection,
  input: CreateStructuredSessionInput,
  mcpServers: readonly ResolvedMcpServer[],
): CursorSdkWorkerAgentOptions {
  const safetyPosture = sdkSafetyPosture(config);
  return {
    model,
    name: `poracode/${input.threadId.slice(0, 8)}`,
    local: {
      cwd: resolveSessionCwd(input.projectLocation),
      settingSources: ["all"],
      autoReview: safetyPosture.autoReview,
      sandboxOptions: { enabled: safetyPosture.sandboxEnabled },
    },
    mcpServers: buildCursorSdkMcpServers(mcpServers),
    mode: sdkMode(config),
    agentId: cursorSdkAgentId(input.threadId),
  };
}

export function buildCursorSdkSendOptions(
  config: ThreadConfig,
  model: CursorSdkModelSelection,
  mcpServers: readonly ResolvedMcpServer[],
  idempotencyKey: string,
  force: boolean,
): CursorSdkWorkerSendOptions {
  return {
    model,
    mode: sdkMode(config),
    mcpServers: buildCursorSdkMcpServers(mcpServers),
    idempotencyKey,
    ...(force ? { local: { force: true } } : {}),
  };
}
