import { dispatchPageTool, PAGE_TOOL_NAMES, type PageToolContext } from "./page";
import type { ToolSpec } from "./types";

export const PERFORM_TOOL: ToolSpec = {
  name: "perform",
  description:
    "Run up to 20 known page actions in order, stop on the first failure, and return one final compact snapshot. Use only previously observed targets; split at decisions or navigation. Include a condition wait before observing asynchronous changes. Completed actions are not rolled back; never replay the entire batch after a partial failure.",
  inputSchema: {
    type: "object",
    required: ["steps"],
    properties: {
      tabId: { type: "string" },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          required: ["action"],
          properties: { action: { type: "string", enum: [...PAGE_TOOL_NAMES] } },
          additionalProperties: true,
        },
        description:
          "Each step has action plus that command's arguments, e.g. {action:'fill',ref:'@e1',text:'Ada'}. All steps target the same tab. Nested batches and tab changes are not allowed.",
      },
      observe: { type: "string", enum: ["text", "none"], default: "text" },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

export function readPerformSteps(
  payload: Record<string, unknown>,
  disabledTools: readonly string[] = [],
): Record<string, unknown>[] {
  if (payload.observe !== undefined && payload.observe !== "text" && payload.observe !== "none") {
    throw new Error("observe must be text or none");
  }
  if (!Array.isArray(payload.steps) || payload.steps.length < 1 || payload.steps.length > 20) {
    throw new Error("steps must contain 1 to 20 page actions");
  }
  const steps = payload.steps.map((step: unknown) => {
    if (!step || typeof step !== "object" || Array.isArray(step))
      throw new Error("each step must be an object");
    const value = step as Record<string, unknown>;
    if (typeof value.action !== "string" || !PAGE_TOOL_NAMES.has(value.action))
      throw new Error("unsupported perform action");
    if ("tabId" in value || "steps" in value || "observe" in value)
      throw new Error("steps cannot change tabs or nest observations/batches");
    return value;
  });
  for (const step of steps) {
    if (disabledTools.includes(step.action as string))
      throw new Error(`Tool disabled by Poracode: ${step.action}`);
  }
  if (payload.observe !== "none" && disabledTools.includes("snapshot"))
    throw new Error("Tool disabled by Poracode: snapshot; use observe:none");
  return steps;
}

export async function performPageActions(
  payload: Record<string, unknown>,
  ctx: PageToolContext,
): Promise<unknown> {
  const steps = readPerformSteps(payload, ctx.disabledTools);
  const results: Array<{ index: number; action: string; result: unknown }> = [];
  let error: string | undefined;
  let failedIndex: number | undefined;
  for (const [index, step] of steps.entries()) {
    const action = step.action as string;
    try {
      const result = await dispatchPageTool(action, step, { ...ctx, animateCursor: false });
      results.push({ index, action, result });
      if (
        result &&
        typeof result === "object" &&
        (("error" in result && result.error) ||
          ("found" in result && result.found === false) ||
          ("ok" in result && result.ok === false))
      ) {
        error = `perform stopped at step ${index} (${action})`;
        failedIndex = index;
        break;
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      failedIndex = index;
      break;
    }
  }
  let observation: unknown;
  let observationError: string | undefined;
  if (payload.observe !== "none") {
    try {
      observation = await dispatchPageTool("snapshot", { mode: "compact" }, ctx);
    } catch (cause) {
      observationError = cause instanceof Error ? cause.message : String(cause);
    }
  }
  return {
    ok: error === undefined && observationError === undefined,
    steps: results,
    ...(error !== undefined ? { error, failedIndex } : {}),
    ...(observation !== undefined ? { observation } : {}),
    ...(observationError !== undefined
      ? {
          observationError,
          ...(!error
            ? { error: "Actions completed but final observation failed; do not replay them." }
            : {}),
        }
      : {}),
  };
}
