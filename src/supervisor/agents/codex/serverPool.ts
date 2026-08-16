import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { resolveNodeForDistro } from "../../wsl/runtime";
import type { CreateStructuredSessionInput } from "../base";
import { buildCodexMcp } from "../userMcp";
import { buildCodexAppServerCommand } from "./argv";
import { CodexAppServerConnection } from "./appServerRpc";
import { buildCodexMcpSkillConflictArgs } from "./mcpSkillConflicts";
import { CodexStdioTransport } from "./stdioTransport";

interface ServerSnapshot {
  appServer: ChildProcess;
  connection: CodexAppServerConnection;
  transport: CodexStdioTransport;
}

interface PoolEntry {
  ready: Promise<ServerSnapshot>;
  leases: number;
}

export interface AcquiredCodexAppServer {
  connection: CodexAppServerConnection;
  dispose(): void;
}

const THREAD_SCOPED_MCP_SERVER_IDS = new Set(["app-controls", "browser", "chrome", "computer-use"]);
const pool = new Map<string, PoolEntry>();
const spawnedAppServers = new Set<ChildProcess>();
const spawnedConnections = new Set<CodexAppServerConnection>();

function executionRuntimeKey(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return "windows";
    case "wsl":
      return `wsl:${location.distro}`;
    case "posix":
      return "posix";
  }
}

function normalizedMcpServer(server: ResolvedMcpServer): ResolvedMcpServer {
  if (!THREAD_SCOPED_MCP_SERVER_IDS.has(server.id) || server.transport.type === "stdio") {
    return server;
  }
  const url = new URL(server.transport.url);
  url.searchParams.delete("thread");
  url.searchParams.delete("title");
  url.searchParams.delete("disable");
  return {
    ...server,
    transport: {
      ...server.transport,
      url: url.toString(),
    },
  };
}

function poolFingerprint(
  location: ProjectLocation,
  mcpServers: readonly ResolvedMcpServer[],
): string {
  const normalizedServers = mcpServers.map(normalizedMcpServer);
  const mcp = buildCodexMcp(normalizedServers);
  return createHash("sha256")
    .update(
      JSON.stringify({
        servers: normalizedServers,
        env: mcp.env,
        skillConflictArgs: buildCodexMcpSkillConflictArgs(location, normalizedServers),
      }),
    )
    .digest("hex");
}

export function codexAppServerPoolKey(
  location: ProjectLocation,
  mcpServers: readonly ResolvedMcpServer[],
  wslExecPath?: string,
  wslNodePath?: string,
): string {
  return [
    executionRuntimeKey(location),
    wslExecPath ?? "",
    wslNodePath ?? "",
    poolFingerprint(location, mcpServers),
  ].join("|");
}

function spawnAppServer(command: ReturnType<typeof buildCodexAppServerCommand>): ChildProcess {
  return spawn(command.command, command.args, {
    cwd: command.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...command.env,
      TERM: "xterm-256color",
    },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
}

async function spawnAndWire(
  input: CreateStructuredSessionInput,
  wslExecPath: string | undefined,
  wslNodePath: string | undefined,
  onExit: (appServer: ChildProcess, connection: CodexAppServerConnection) => void,
): Promise<ServerSnapshot> {
  const appServer = spawnAppServer(
    buildCodexAppServerCommand(input.projectLocation, {
      ...(wslExecPath !== undefined ? { wslExecPath } : {}),
      ...(wslNodePath !== undefined ? { wslNodePath } : {}),
      ...(input.mcpServers !== undefined ? { mcpServers: input.mcpServers } : {}),
      includeMcpConfig: false,
    }),
  );
  spawnedAppServers.add(appServer);
  const transport = new CodexStdioTransport(appServer);
  const connection = new CodexAppServerConnection(transport);
  spawnedConnections.add(connection);
  appServer.prependOnceListener("exit", () => onExit(appServer, connection));

  const spawnError = await new Promise<Error | undefined>((resolve) => {
    appServer.once("error", (error) => resolve(error));
    setImmediate(() => resolve(undefined));
  });
  if (spawnError) {
    spawnedAppServers.delete(appServer);
    spawnedConnections.delete(connection);
    throw new Error(`Codex app-server failed to spawn: ${spawnError.message}`);
  }
  if (appServer.exitCode !== null) {
    spawnedAppServers.delete(appServer);
    spawnedConnections.delete(connection);
    throw new Error(`Codex app-server exited early.${transport.formatOutput()}`);
  }

  return { appServer, connection, transport };
}

export async function acquireCodexAppServer(
  input: CreateStructuredSessionInput,
  wslExecPath?: string,
): Promise<AcquiredCodexAppServer> {
  const wslNodePath =
    input.projectLocation.kind === "wsl"
      ? (await resolveNodeForDistro(input.projectLocation.distro)).nodePath
      : undefined;
  const mcpServers = input.mcpServers ?? [];
  const key = codexAppServerPoolKey(input.projectLocation, mcpServers, wslExecPath, wslNodePath);
  let entry = pool.get(key);
  if (!entry) {
    const ready = spawnAndWire(input, wslExecPath, wslNodePath, (appServer, connection) => {
      spawnedAppServers.delete(appServer);
      spawnedConnections.delete(connection);
      if (pool.get(key) === entry) pool.delete(key);
    });
    entry = { ready, leases: 0 };
    pool.set(key, entry);
    ready.catch(() => {
      if (pool.get(key) === entry) pool.delete(key);
    });
  }

  entry.leases += 1;
  let snapshot: ServerSnapshot;
  try {
    snapshot = await entry.ready;
  } catch (error) {
    entry.leases -= 1;
    throw error;
  }
  let released = false;
  return {
    connection: snapshot.connection,
    dispose: () => {
      if (released) return;
      released = true;
      entry.leases -= 1;
      if (entry.leases > 0) return;

      if (pool.get(key) === entry) pool.delete(key);
      spawnedConnections.delete(snapshot.connection);
      spawnedAppServers.delete(snapshot.appServer);
      snapshot.connection.dispose(new Error("Last Codex app-server pool lease released."));
      if (!snapshot.appServer.killed) {
        terminateChildProcessTree(snapshot.appServer);
      }
    },
  };
}

export function shutdownSpawnedCodexAppServers(): void {
  pool.clear();
  const error = new Error("Codex app-server pool disposed.");
  for (const connection of spawnedConnections) {
    connection.dispose(error);
  }
  spawnedConnections.clear();
  for (const appServer of spawnedAppServers) {
    if (!appServer.killed) {
      terminateChildProcessTree(appServer);
    }
  }
  spawnedAppServers.clear();
}
