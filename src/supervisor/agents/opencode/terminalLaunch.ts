import { OPENCODE_PROVIDER_KIND } from "@/shared/agents/opencode";
import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { createKnownSessionRef, type AgentArgvSpec } from "../base";
import { buildOpenCodeArgs } from "./argv";
import { cachedOpenCodeBinary } from "./binary";
import { acquireOpenCodeServer, retireOpenCodeTerminalServer } from "./client";
import { openCodeSessionDatabaseEnv } from "./database";

/** Keep the TUI on the supervisor's configured server, rather than the native service. */
export async function buildOpenCodeTerminalLaunch(
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionId: string | undefined,
  mcpServers: readonly ResolvedMcpServer[] = [],
): Promise<AgentArgvSpec> {
  const databaseEnv = openCodeSessionDatabaseEnv(location, sessionId);
  const acquired = await acquireOpenCodeServer({
    projectLocation: location,
    mcpServers,
    ...(sessionId ? { resumeSessionId: sessionId } : {}),
  });
  try {
    let retirement: Promise<void> | undefined;
    return {
      binary: cachedOpenCodeBinary(location) ?? OPENCODE_PROVIDER_KIND,
      args: ["--server", acquired.baseUrl, ...buildOpenCodeArgs(config, prompt, sessionId)],
      // The V2 TUI reads OPENCODE_PASSWORD for an explicit --server. Keep it
      // out of argv and release the lease only when the PTY's cleanup runs.
      env: { ...databaseEnv, OPENCODE_PASSWORD: await acquired.handle.password },
      preferShell: true,
      cleanup: () => (retirement ??= retireOpenCodeTerminalServer(location, sessionId, acquired)),
      ...(sessionId ? { sessionRef: createKnownSessionRef(sessionId) } : {}),
    };
  } catch (error) {
    await acquired.dispose();
    throw error;
  }
}
