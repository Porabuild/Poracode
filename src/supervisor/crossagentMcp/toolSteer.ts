import type { SubagentToolContext } from "./toolRegistry";
import {
  errorResult,
  jsonResult,
  parseWaitOptions,
  parseWaitTimeoutMs,
  runToolResult,
  WAIT_AGAIN_INSTRUCTION,
} from "./toolResult";
import type { McpToolResult } from "./types";

export async function steerAgent(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  const runId = typeof args.run_id === "string" ? args.run_id : "";
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  if (!runId) return errorResult("run_id is required");
  if (!prompt.trim()) return errorResult("prompt must not be empty");
  if (args.background !== undefined && typeof args.background !== "boolean") {
    return errorResult("background must be a boolean");
  }
  // Validate reads before delivering a correction that cannot be rolled back.
  const options = parseWaitOptions(args);
  const timeoutMs = parseWaitTimeoutMs(args);
  const startedAt = Date.now();
  const next = await ctx.runManager.steer(
    runId,
    prompt,
    ctx.parentThreadId,
    args.background === true,
  );
  const receipt = {
    run_id: next.runId,
    ...(next.continuedFrom ? { continued_from: next.continuedFrom } : {}),
  };
  if (args.background === true) {
    return jsonResult({ ...receipt, status: "accepted" }, WAIT_AGAIN_INSTRUCTION);
  }
  return runToolResult({
    ...receipt,
    ...(await ctx.runManager.waitFor(
      next.runId,
      Math.max(0, timeoutMs - (Date.now() - startedAt)),
      ctx.parentThreadId,
      next.continuedFrom ? { ...options, afterOutputChars: 0 } : options,
    )),
  });
}
