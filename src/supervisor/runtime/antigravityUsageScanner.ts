import { antigravityPoolWindows, type UsageSnapshot } from "@lightcode/agents-usage";
import {
  GET_COMMAND_MODEL_CONFIGS,
  GET_USER_STATUS,
  modelsFromBody,
  planFromUserStatus,
  queryLs,
} from "./antigravityLanguageServer";
import { listListeningPorts, listProcesses, resolveTargets } from "./antigravityProcessScan";

/**
 * Antigravity usage from its local language server (LS-only by design).
 *
 * While `agy` (or the Antigravity IDE) is running it hosts a local language
 * server — a Connect-RPC service reachable on a loopback port — whose
 * `GetUserStatus` reports per-model quota for the full set (Gemini + Claude +
 * GPT-OSS). When the LS is not reachable the snapshot is app-not-running: there
 * is no live session. We deliberately do NOT fall back to `agy`'s Cloud Code
 * surface — it reports a different backend's quota (Gemini-only, with different
 * reset windows and counts), so mixing it in would flip the panel to
 * inconsistent numbers as `agy` starts and stops.
 *
 * Discovery (process trees, loopback ports, CSRF tokens) lives in
 * `antigravityProcessScan.ts`; the RPC calls + response parsing live in
 * `antigravityLanguageServer.ts`. This file orchestrates the two.
 */

/** Probe the running language server; undefined when none is reachable. */
async function scanLanguageServer(nowMs: number): Promise<UsageSnapshot | undefined> {
  const { pids, csrfTokens } = resolveTargets(await listProcesses());
  if (pids.size === 0) return undefined;
  const ports = (await listListeningPorts())
    .filter((entry) => pids.has(entry.pid))
    .map((entry) => entry.port);
  for (const port of [...new Set(ports)]) {
    let body = await queryLs(port, GET_USER_STATUS, csrfTokens);
    let models = body !== undefined ? modelsFromBody(body) : [];
    if (body !== undefined && models.length === 0) {
      // GetUserStatus answered but carried no quota — try the configs endpoint.
      const configs = await queryLs(port, GET_COMMAND_MODEL_CONFIGS, csrfTokens);
      if (configs !== undefined) {
        body = configs;
        models = modelsFromBody(configs);
      }
    }
    const windows = antigravityPoolWindows(models);
    if (windows.length > 0) {
      const plan = planFromUserStatus(body);
      return {
        providerId: "antigravity",
        status: "ok",
        windows,
        fetchedAt: nowMs,
        ...(plan ? { plan } : {}),
      };
    }
  }
  return undefined;
}

/** Build the Antigravity usage snapshot from its local language server. */
export async function scanAntigravityUsage(nowMs: number): Promise<UsageSnapshot> {
  const ls = await scanLanguageServer(nowMs).catch(() => undefined);
  if (ls && ls.windows.length > 0) return ls;
  // No reachable LS: `agy`/the IDE isn't running. The user may well be signed
  // in, so this is "start the app", not "sign in".
  return { providerId: "antigravity", status: "app-not-running", windows: [], fetchedAt: nowMs };
}
