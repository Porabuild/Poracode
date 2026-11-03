import type { McpOauthWaitResult } from "@/shared/contracts";
import { scopeOwner, type McpScope } from "./mcpServerScopes";

type McpOauthOwner = ReturnType<typeof scopeOwner>;
import type { AppControlsToolContext } from "./types";

/** Stays under common MCP client tool timeouts; the supervisor flow itself lasts 5 minutes. */
export const MAX_WAIT_SECONDS = 280;
export const DEFAULT_WAIT_SECONDS = 60;
/** Keep a settled sign-in result long enough for a late `wait` poll to read it. */
const SETTLED_FLOW_RETENTION_MS = 10 * 60 * 1000;

const flows = new Map<string, Promise<McpOauthWaitResult>>();
const INACTIVE_FLOW: McpOauthWaitResult = {
  status: "error",
  message: "The sign-in flow is no longer active.",
};

/**
 * Begin waiting on a sign-in flow once; later waits share the same result. The
 * chain never rejects, and a settled result is kept briefly for a late poll.
 */
export function ensureFlowWait(
  ctx: AppControlsToolContext,
  flowId: string,
  owner: McpOauthOwner,
): void {
  if (flows.has(flowId)) return;
  const pending = ctx.supervisor
    .waitMcpServerOauth({ flowId, ...owner })
    .catch((error: unknown): McpOauthWaitResult => ({
      status: "error",
      message: error instanceof Error && error.message ? error.message : "Sign-in failed.",
    }))
    .then((result) => {
      setTimeout(() => flows.delete(flowId), SETTLED_FLOW_RETENTION_MS).unref?.();
      return result;
    });
  flows.set(flowId, pending);
}

export async function waitForFlow(
  ctx: AppControlsToolContext,
  flowId: string,
  owner: McpOauthOwner,
  waitSeconds: number,
): Promise<Record<string, unknown>> {
  ensureFlowWait(ctx, flowId, owner);
  const pending = flows.get(flowId) ?? Promise.resolve(INACTIVE_FLOW);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitSeconds * 1000);
  });
  try {
    const result = await Promise.race([pending, timeout]);
    return result ?? { status: "pending", flowId, note: "Still waiting for the user to finish." };
  } finally {
    clearTimeout(timer);
  }
}

export async function authenticatedUrls(ctx: AppControlsToolContext, scope: McpScope) {
  const { authenticatedUrls: urls } = await ctx.supervisor.getMcpOauthStatus(
    scopeOwner(ctx, scope),
  );
  return new Set(urls);
}
