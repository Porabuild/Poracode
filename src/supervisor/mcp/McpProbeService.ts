import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  mcpProbePayloadSchema,
  mcpProbeResultSchema,
  type McpProbeEnvironment,
  type McpProbePayload,
  type McpProbeResult,
  type McpServer,
  type ProjectLocation,
} from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { getWslCommand } from "../agents/base";
import { resolveNodeForDistro } from "../wsl/runtime";
import { deployFilesToWslTempBase, resolveWslHelpersDir } from "../wsl/wslDeploy";
import { probeMcpServer, unavailableMcpProbeResult } from "./probeMcpServer";

const WORKER_OUTPUT_MAX_BYTES = 64 * 1024;

type WslLocation = Extract<ProjectLocation, { kind: "wsl" }>;
type HostProbe = (
  server: McpServer,
  environment: McpProbeEnvironment,
  signal: AbortSignal,
) => Promise<McpProbeResult>;
type WslProbe = (
  server: McpServer,
  location: WslLocation,
  environment: McpProbeEnvironment,
  signal: AbortSignal,
) => Promise<McpProbeResult>;

export interface McpProbeServiceOptions {
  probeHost?: HostProbe;
  probeWsl?: WslProbe;
  /**
   * Optional: attaches a stored OAuth `Authorization` header to HTTP/SSE
   * servers before probing, so an authenticated server probes as available.
   */
  applyAuthorization?: (server: McpServer) => Promise<McpServer>;
}

function applyProjectCwd(server: McpServer, location: ProjectLocation | undefined): McpServer {
  if (!location || server.transport.type !== "stdio" || server.transport.cwd) return server;
  const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
  return { ...server, transport: { ...server.transport, cwd } };
}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function runWslProbeWorker(
  server: McpServer,
  location: WslLocation,
  environment: McpProbeEnvironment,
  signal: AbortSignal,
): Promise<McpProbeResult> {
  const helpersDir = resolveWslHelpersDir();
  const workerSource = helpersDir ? join(helpersDir, "mcp-probe.mjs") : "";
  if (!workerSource || !existsSync(workerSource)) {
    return unavailableMcpProbeResult("probe-unavailable", environment);
  }

  const resolvedNode = await Promise.race([
    resolveNodeForDistro(location.distro),
    abortPromise(signal),
  ]);
  if (signal.aborted) throw signal.reason;

  const deployed = deployFilesToWslTempBase(location.distro, `poracode-mcp-probe-${process.pid}`, [
    { src: workerSource, relDest: "mcp-probe/mcp-probe.mjs" },
  ]);
  if (!deployed) return unavailableMcpProbeResult("probe-unavailable", environment);
  if (signal.aborted) throw signal.reason;
  const workerPath = `${deployed.linuxBaseDir}/mcp-probe/mcp-probe.mjs`;

  return new Promise<McpProbeResult>((resolve) => {
    let child: ChildProcess | undefined;
    let output = "";
    let settled = false;
    const finish = (result: McpProbeResult): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      if (child) terminateChildProcessTree(child);
      finish(unavailableMcpProbeResult("timeout", environment, "Connection timed out."));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      child = spawn(
        getWslCommand(),
        [
          "-d",
          location.distro,
          "--cd",
          location.linuxPath,
          "--",
          resolvedNode.nodePath,
          workerPath,
        ],
        {
          stdio: ["pipe", "pipe", "ignore"],
          windowsHide: true,
        },
      );
    } catch {
      finish(unavailableMcpProbeResult("probe-unavailable", environment));
      return;
    }

    child.on("error", () => finish(unavailableMcpProbeResult("probe-unavailable", environment)));
    child.stdin?.on("error", () => {
      if (child) terminateChildProcessTree(child);
      finish(unavailableMcpProbeResult("probe-unavailable", environment));
    });
    child.stdout?.on("error", () => {
      if (child) terminateChildProcessTree(child);
      finish(unavailableMcpProbeResult("probe-unavailable", environment));
    });
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (Buffer.byteLength(output, "utf8") > WORKER_OUTPUT_MAX_BYTES && child) {
        terminateChildProcessTree(child);
        finish(unavailableMcpProbeResult("protocol-error", environment));
      }
    });
    child.on("close", () => {
      if (settled) return;
      try {
        const result = mcpProbeResultSchema.parse(JSON.parse(output));
        finish({ ...result, environment });
      } catch {
        finish(unavailableMcpProbeResult("probe-unavailable", environment));
      }
    });

    child.stdin?.end(JSON.stringify({ server, environment }));
  });
}

export class McpProbeService {
  private readonly probeHost: HostProbe;
  private readonly probeWsl: WslProbe;
  private readonly applyAuthorization: ((server: McpServer) => Promise<McpServer>) | undefined;
  private readonly active = new Set<AbortController>();

  constructor(options: McpProbeServiceOptions = {}) {
    this.probeHost = options.probeHost ?? probeMcpServer;
    this.probeWsl = options.probeWsl ?? runWslProbeWorker;
    this.applyAuthorization = options.applyAuthorization;
  }

  async probe(input: McpProbePayload): Promise<McpProbeResult> {
    const payload = mcpProbePayloadSchema.parse(input);
    const environment: McpProbeEnvironment = {
      runtime: payload.projectLocation?.kind === "wsl" ? "wsl" : "host",
      projectScoped: payload.projectLocation !== undefined,
    };
    let server = applyProjectCwd(payload.server, payload.projectLocation);
    if (this.applyAuthorization) {
      server = await this.applyAuthorization(server).catch(() => server);
    }
    const controller = new AbortController();
    this.active.add(controller);
    const timeout =
      payload.projectLocation?.kind === "wsl"
        ? setTimeout(
            () => controller.abort(new DOMException("The operation timed out", "TimeoutError")),
            server.timeoutMs,
          )
        : undefined;
    timeout?.unref?.();

    try {
      if (payload.projectLocation?.kind === "wsl") {
        return await this.probeWsl(server, payload.projectLocation, environment, controller.signal);
      }
      return await this.probeHost(server, environment, controller.signal);
    } catch {
      return controller.signal.aborted
        ? unavailableMcpProbeResult("timeout", environment, "Connection timed out.")
        : unavailableMcpProbeResult("probe-unavailable", environment);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.active.delete(controller);
    }
  }

  dispose(): void {
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
}
