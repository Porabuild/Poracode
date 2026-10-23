import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { createKnownSessionRef, type AgentArgvSpec } from "../base";
import { buildOpenCode2Args } from "./argv";
import { cachedOpenCode2Binary } from "./binary";
import { acquireOpenCode2Server, retireOpenCode2TerminalServer } from "./client";
import { openCode2SessionDatabaseEnv } from "./database";

/** Keep the TUI on the supervisor's configured server, rather than the native service. */
export async function buildOpenCode2TerminalLaunch(
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionId: string | undefined,
  mcpServers: readonly ResolvedMcpServer[] = [],
): Promise<AgentArgvSpec> {
  const databaseEnv = openCode2SessionDatabaseEnv(location, sessionId);
  const acquired = await acquireOpenCode2Server({
    projectLocation: location,
    mcpServers,
    isolateMcpServers: true,
    ...(sessionId ? { resumeSessionId: sessionId } : {}),
  });
  try {
    let retirement: Promise<void> | undefined;
    return {
      binary: cachedOpenCode2Binary(location) ?? "opencode2",
      args: ["--server", acquired.baseUrl, ...buildOpenCode2Args(config, prompt, sessionId)],
      // The V2 TUI reads OPENCODE_PASSWORD for an explicit --server. Keep it
      // out of argv and release the lease only when the PTY's cleanup runs.
      env: { ...databaseEnv, OPENCODE_PASSWORD: await acquired.handle.password },
      preferShell: true,
      cleanup: () => (retirement ??= retireOpenCode2TerminalServer(location, sessionId, acquired)),
      ...(sessionId ? { sessionRef: createKnownSessionRef(sessionId) } : {}),
    };
  } catch (error) {
    await acquired.dispose();
    throw error;
  }
}
