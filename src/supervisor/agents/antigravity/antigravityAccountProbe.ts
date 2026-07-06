import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactAgentProviderMetadata, type AgentProviderMetadata } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import {
  emailFromUserStatus,
  GET_USER_STATUS,
  planFromUserStatus,
  queryLs,
} from "./antigravityLanguageServer";
import { resolveAntigravityLsEndpoints } from "./antigravityProcessScan";

/**
 * Resolve the signed-in Antigravity account (email + plan) from its local
 * language server. `agy` hosts the LS only while a session is live, so the
 * account is otherwise invisible at detection time (the credential itself sits
 * in the OS keyring). Two strategies, in order:
 *   1. Reuse an LS that's already listening (a running `agy`/IDE session) — free.
 *   2. Briefly spawn `agy` to bring its LS up, read `GetUserStatus`, then kill
 *      the process tree. The throwaway `-p` turn never completes (we tear down
 *      the moment the status answers), so no quota is spent.
 *
 * Everything is best-effort and fails safe (undefined on any error). Discovery
 * + RPC live in `antigravityProcessScan.ts` / `antigravityLanguageServer.ts`.
 */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SPAWN_LS_TIMEOUT_MS = 12_000;
const SPAWN_POLL_INTERVAL_MS = 700;

export interface AntigravityAccountProbeOptions {
  /** Resolved `agy` executable for the spawn fallback; omit to disable spawning. */
  executablePath?: string;
  /** WSL distros to include in the reuse-running-LS scan. */
  wslDistros?: readonly string[];
  /** Set false to never spawn (passive-only). Defaults to true. */
  allowSpawn?: boolean;
}

/** Test seam: lets specs drive the orchestration without real processes. */
export interface AntigravityAccountProbeDeps {
  readRunningAccount: (wslDistros: readonly string[]) => Promise<AgentProviderMetadata | undefined>;
  spawnAndReadAccount: (executablePath: string) => Promise<AgentProviderMetadata | undefined>;
}

/** Build the account metadata from a GetUserStatus body; undefined when empty. */
export function antigravityAccountFromUserStatus(body: unknown): AgentProviderMetadata | undefined {
  // `compactAgentProviderMetadata` drops blank/missing fields and returns
  // undefined when nothing remains, so passing both extracted values is enough.
  const authenticatedAs = emailFromUserStatus(body);
  const plan = planFromUserStatus(body);
  return compactAgentProviderMetadata({
    ...(authenticatedAs ? { authenticatedAs } : {}),
    ...(plan ? { plan } : {}),
  });
}

/** Query whatever Antigravity LS is reachable right now; undefined when none answers. */
async function readRunningAccount(
  wslDistros: readonly string[],
): Promise<AgentProviderMetadata | undefined> {
  const { ports, csrfTokens } = await resolveAntigravityLsEndpoints(wslDistros);
  for (const port of ports) {
    const account = antigravityAccountFromUserStatus(
      await queryLs(port, GET_USER_STATUS, csrfTokens),
    );
    if (account) return account;
  }
  return undefined;
}

/** Spawn `agy` just long enough to bring its LS up, read the account, kill it. */
async function spawnAndReadAccount(
  executablePath: string,
): Promise<AgentProviderMetadata | undefined> {
  // Isolate the cwd so `agy`'s throwaway `-p` conversation can't rewrite the
  // real project's `last_conversations.json[cwd]` (see antigravity/index.ts).
  const cwd = await mkdtemp(join(tmpdir(), "lc-agy-account-"));
  // `-p` runs non-interactively (no TTY needed) and the LS comes up within ~2s.
  const child = spawn(executablePath, ["-p", "."], {
    cwd,
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    const deadline = Date.now() + SPAWN_LS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(SPAWN_POLL_INTERVAL_MS);
      const account = await readRunningAccount([]).catch((error) => {
        console.warn("[antigravity] readRunningAccount during spawn poll failed:", error);
        return undefined;
      });
      if (account) return account;
      // `agy -p` exited before the LS answered (e.g. not actually signed in).
      if (child.exitCode !== null) break;
    }
    return undefined;
  } finally {
    // taskkill /T tears down the `agy` → `language_server` tree on Windows.
    terminateChildProcessTree(child);
    await rm(cwd, { recursive: true, force: true }).catch((error) => {
      console.warn("[antigravity] failed to clean up temp dir:", error);
    });
  }
}

const defaultDeps: AntigravityAccountProbeDeps = { readRunningAccount, spawnAndReadAccount };

/**
 * Resolve the Antigravity account: reuse a running LS, else spawn `agy` to
 * bring one up (when `executablePath` is provided and `allowSpawn` isn't false).
 */
export async function probeAntigravityAccount(
  options: AntigravityAccountProbeOptions,
  deps: AntigravityAccountProbeDeps = defaultDeps,
): Promise<AgentProviderMetadata | undefined> {
  const wslDistros = options.wslDistros ?? [];
  const running = await deps.readRunningAccount(wslDistros).catch((error) => {
    console.warn("[antigravity] readRunningAccount failed:", error);
    return undefined;
  });
  if (running) return running;
  if (options.allowSpawn !== false && options.executablePath) {
    return deps.spawnAndReadAccount(options.executablePath).catch((error) => {
      console.warn("[antigravity] spawnAndReadAccount failed:", error);
      return undefined;
    });
  }
  return undefined;
}
