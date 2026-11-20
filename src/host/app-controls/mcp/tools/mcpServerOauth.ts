import type { McpOauthWaitResult } from "@/shared/contracts";
import { scopeOwner, type McpScope } from "./mcpServerScopes";

type McpOauthOwner = ReturnType<typeof scopeOwner>;
import type { AppControlsToolContext } from "./types";

/** Stays under common MCP client tool timeouts; the supervisor flow itself lasts 5 minutes. */
export const MAX_WAIT_SECONDS = 280;
export const DEFAULT_WAIT_SECONDS = 60;
/** Keep a settled sign-in result long enough for a late `wait` poll to read it. */
const SETTLED_FLOW_RETENTION_MS = 10 * 60 * 1000;

const ownerFlows = new WeakMap<
  AppControlsToolContext["supervisor"],
  Map<string, Promise<McpOauthWaitResult>>
>();
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
  pluginName?: string,
): void {
  let flows = ownerFlows.get(ctx.supervisor);
  if (!flows) {
    flows = new Map();
    ownerFlows.set(ctx.supervisor, flows);
  }
  const key = flowKey(ctx, flowId, pluginName);
  if (flows.has(key)) return;
  const active = flows;
  const pending = ctx.supervisor
    .waitMcpServerOauth({ flowId, ...owner })
    .catch((error: unknown): McpOauthWaitResult => ({
      status: "error",
      message: error instanceof Error && error.message ? error.message : "Sign-in failed.",
    }))
    .then((result) => {
      setTimeout(() => active.delete(key), SETTLED_FLOW_RETENTION_MS).unref?.();
      return result;
    });
  active.set(key, pending);
}

export async function waitForFlow(
  ctx: AppControlsToolContext,
  flowId: string,
  owner: McpOauthOwner,
  waitSeconds: number,
  pluginName?: string,
): Promise<Record<string, unknown>> {
  if (pluginName === undefined) ensureFlowWait(ctx, flowId, owner);
  const pending = ownerFlows.get(ctx.supervisor)?.get(flowKey(ctx, flowId, pluginName));
  if (!pending) return INACTIVE_FLOW;
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

function flowKey(ctx: AppControlsToolContext, flowId: string, pluginName?: string) {
  return pluginName === undefined
    ? flowId
    : JSON.stringify([ctx.identity.threadId, pluginName, flowId]);
}

export async function authenticatedUrls(ctx: AppControlsToolContext, scope: McpScope) {
  const { authenticatedUrls: urls } = await ctx.supervisor.getMcpOauthStatus(
    scopeOwner(ctx, scope),
  );
  return new Set(urls);
}
