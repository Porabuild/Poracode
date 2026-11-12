import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpTransport, ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import {
  markDistroBinaryExecutable,
  resolveDistroArch,
  resolveNodeForDistro,
} from "../wsl/runtime";
import { deployFilesToWslTempBase, resolveWslHelpersDir } from "../wsl/wslDeploy";
import {
  MCP_FILTER_CONFIG_ENV,
  MCP_FILTER_CONFIG_V1_ENV,
  MCP_FILTER_CONFIG_V2_ENV,
  MCP_HTTP_RELAY_CONFIG_ENV,
  MCP_STDIO_CONFIG_ENV,
  encodeMcpHttpRelayConfig,
} from "./mcpToolFilterConfig";

interface FilterOptions {
  remoteViaStdio?: boolean;
  proxyStdioCwd?: boolean;
  isolateConnectionFailures?: boolean;
  omitInvalidSchemaPatterns?: boolean;
}

type McpLaunchHelper =
  | {
      kind: "js";
      name: "mcp-filter.mjs" | "mcp-relay.mjs" | "mcp-stdio.mjs";
      env: Record<string, string>;
    }
  | { kind: "native"; path: string; env: Record<string, string> };

function requiresFiltering(server: ResolvedMcpServer, options: FilterOptions): boolean {
  return (
    options.isolateConnectionFailures === true ||
    (server.disabledTools?.length ?? 0) > 0 ||
    (options.remoteViaStdio === true && server.transport.type !== "stdio")
  );
}

/**
 * Transports this module wrapped in a launch helper. Marking the produced
 * object (rather than sniffing env keys) keeps a user stdio server that
 * happens to carry a helper env var from skipping the filter; a copied
 * transport that loses the marker only costs an extra relay, never a bypass.
 */
const helperRelayTransports = new WeakSet<McpTransport>();

/** A Poracode launch helper already relays this server under its policy. */
function isHelperRelay(transport: McpTransport): boolean {
  return helperRelayTransports.has(transport);
}

/** A Poracode-served endpoint applies the server's tool policy itself. */
function isHostEndpoint(server: ResolvedMcpServer): boolean {
  return server.directTransport !== undefined && server.transport.type === "http";
}

function filterConfig(server: ResolvedMcpServer, options: FilterOptions): string {
  return Buffer.from(
    JSON.stringify({
      ...(options.omitInvalidSchemaPatterns
        ? {
            version: 2,
            omitInvalidSchemaPatterns: true,
            // New native wrappers preserve the rest of the protocol and stdio
            // environment; existing filtering lanes retain their old policy.
            ...(!requiresFiltering(server, options) ? { schemaOnly: true } : {}),
          }
        : options.isolateConnectionFailures
          ? { version: 1 }
          : {}),
      ...(options.isolateConnectionFailures ? { isolateConnectionFailures: true } : {}),
      server,
      disabledTools: server.disabledTools ?? [],
    }),
    "utf8",
  ).toString("base64url");
}

/** Staged target id of the native relay for this host, when one exists. */
export function nativeRelayTargetId(): string | undefined {
  if (process.platform === "darwin") return "darwin-universal";
  if (process.platform === "win32") {
    return process.arch === "x64" || process.arch === "arm64" ? `win32-${process.arch}` : undefined;
  }
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  return undefined;
}

/** Staged native relay binary for this host, when the prepare script produced one. */
export function nativeMcpRelayBinaryPath(helpersDir: string): string | undefined {
  const id = nativeRelayTargetId();
  if (!id) return undefined;
  const path = join(
    helpersDir,
    "mcp-relay",
    id,
    process.platform === "win32" ? "poracode-mcp-relay.exe" : "poracode-mcp-relay",
  );
  return existsSync(path) ? path : undefined;
}

function nativeRelayPath(helpersDir: string | undefined): string | undefined {
  return helpersDir ? nativeMcpRelayBinaryPath(helpersDir) : undefined;
}

/** Staged static musl `linux-x64` native relay binary for x64 WSL distros. */
function wslNativeMcpRelayBinaryPath(helpersDir: string | undefined): string | undefined {
  if (!helpersDir) return undefined;
  const path = join(helpersDir, "mcp-relay", "linux-x64", "poracode-mcp-relay");
  return existsSync(path) ? path : undefined;
}

/**
 * Multi-mode `poracode-mcp-relay` (`MCP_FILTER_CONFIG*` and `MCP_STDIO_CONFIG`)
 * landed in `0.2.0`. Pre-`0.2.0` staged binaries or unmanifested fixtures stay
 * eligible for `MCP_HTTP_RELAY_CONFIG` while falling back to `.mjs` elsewhere.
 */
export function nativeRelaySupportsExtendedModes(helpersDir: string | undefined): boolean {
  if (!helpersDir) return false;
  try {
    const raw = JSON.parse(
      readFileSync(join(helpersDir, "mcp-relay", "manifest.json"), "utf8"),
    ) as {
      helper?: unknown;
      helperVersion?: unknown;
    };
    if (raw?.helper !== "poracode-mcp-relay" || typeof raw.helperVersion !== "string") {
      return false;
    }
    const [major = 0, minor = 0] = raw.helperVersion.split(".").map((part) => Number(part));
    return major > 0 || minor >= 2;
  } catch {
    return false;
  }
}

function launchHelper(
  server: ResolvedMcpServer,
  options: FilterOptions,
  nativeRelay?: string,
  nativeExtended = false,
): McpLaunchHelper {
  const transport = server.transport;
  if (
    transport.type === "http" &&
    isHostEndpoint(server) &&
    options.omitInvalidSchemaPatterns !== true &&
    // Failure isolation keeps the SDK proxy and its diagnostic tool.
    options.isolateConnectionFailures !== true
  ) {
    const env = {
      [MCP_HTTP_RELAY_CONFIG_ENV]: encodeMcpHttpRelayConfig({
        url: transport.url,
        headers: transport.headers,
        timeoutMs: server.timeoutMs,
        disabledTools: [...(server.disabledTools ?? [])],
      }),
    };
    // The native relay speaks plain HTTP only; HTTPS keeps the JS relay.
    if (nativeRelay && transport.url.startsWith("http:")) {
      return { kind: "native", path: nativeRelay, env };
    }
    return { kind: "js", name: "mcp-relay.mjs", env };
  }
  if (options.omitInvalidSchemaPatterns === true || requiresFiltering(server, options)) {
    const env = {
      [options.omitInvalidSchemaPatterns
        ? MCP_FILTER_CONFIG_V2_ENV
        : options.isolateConnectionFailures
          ? MCP_FILTER_CONFIG_V1_ENV
          : MCP_FILTER_CONFIG_ENV]: filterConfig(server, options),
    };
    const canUseNativeFilter =
      Boolean(nativeRelay) &&
      nativeExtended &&
      options.isolateConnectionFailures !== true &&
      (transport.type === "stdio" ||
        (transport.type === "http" && transport.url.startsWith("http:")));
    if (canUseNativeFilter) {
      return { kind: "native", path: nativeRelay!, env };
    }
    return { kind: "js", name: "mcp-filter.mjs", env };
  }
  const env = {
    [MCP_STDIO_CONFIG_ENV]: Buffer.from(JSON.stringify({ version: 1, server })).toString(
      "base64url",
    ),
  };
  if (nativeRelay && nativeExtended && transport.type === "stdio") {
    return { kind: "native", path: nativeRelay, env };
  }
  return { kind: "js", name: "mcp-stdio.mjs", env };
}

function resolveJsHelperSources(
  helpers: readonly McpLaunchHelper[],
  helpersDir: string | undefined,
): { name: string; path: string }[] {
  const names = [
    ...new Set(helpers.flatMap((helper) => (helper.kind === "js" ? [helper.name] : []))),
  ];
  const sources = names.map((name) => ({ name, path: helpersDir ? join(helpersDir, name) : "" }));
  if (sources.some((source) => !source.path || !existsSync(source.path))) {
    throw new Error("Poracode MCP launch helper is unavailable.");
  }
  return sources;
}

export async function prepareMcpToolFilters<T extends ResolvedMcpServer>(
  servers: readonly T[],
  location: ProjectLocation,
  options: FilterOptions = {},
): Promise<T[]> {
  const transformsTools =
    options.omitInvalidSchemaPatterns === true || options.isolateConnectionFailures === true;
  const needsProxy = (server: T) => {
    // Relaying a relay would only add another process per agent session.
    if (isHelperRelay(server.transport) && !transformsTools) return false;
    if (isHostEndpoint(server)) return options.remoteViaStdio === true || transformsTools;
    return (
      transformsTools ||
      (server.disabledTools?.length ?? 0) > 0 ||
      (options.remoteViaStdio === true && server.transport.type !== "stdio") ||
      Boolean(options.proxyStdioCwd && server.transport.type === "stdio" && server.transport.cwd)
    );
  };
  const proxiedServers = servers.filter(needsProxy);
  if (proxiedServers.length === 0) return [...servers];

  const helpersDir = resolveWslHelpersDir();
  const nativeExtended = nativeRelaySupportsExtendedModes(helpersDir);
  const helperByServer = new Map<T, McpLaunchHelper>();
  const assignHelpers = (nativeRelay?: string): McpLaunchHelper[] => {
    helperByServer.clear();
    return proxiedServers.map((server) => {
      const helper = launchHelper(server, options, nativeRelay, nativeExtended);
      helperByServer.set(server, helper);
      return helper;
    });
  };

  let command = process.execPath;
  let workerDirectory = helpersDir!;
  const baseEnv = process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
  if (location.kind === "wsl") {
    const wslNativeSrc = wslNativeMcpRelayBinaryPath(helpersDir);
    const wslCanTryNative =
      Boolean(wslNativeSrc) && (await resolveDistroArch(location.distro)) === "x64";
    const wslNativeRel = "mcp-filter/poracode-mcp-relay";
    let stagedWithNative = false;
    if (wslCanTryNative && wslNativeSrc) {
      const tentative = assignHelpers(wslNativeRel);
      if (tentative.some((helper) => helper.kind === "native")) {
        const jsSources = resolveJsHelperSources(tentative, helpersDir);
        const deployed = await deployFilesToWslTempBase(
          location.distro,
          `poracode-mcp-filter-${process.pid}`,
          [
            { src: wslNativeSrc, relDest: wslNativeRel },
            ...jsSources.map((source) => ({
              src: source.path,
              relDest: `mcp-filter/${source.name}`,
            })),
          ],
        );
        if (!deployed) throw new Error("Poracode MCP launch helper could not be deployed to WSL.");
        const linuxNativePath = `${deployed.linuxBaseDir}/${wslNativeRel}`;
        if (
          await markDistroBinaryExecutable(
            location.distro,
            linuxNativePath,
            ...((deployed.filesWritten ?? 0) > 0 ? [{ force: true }] : []),
          )
        ) {
          for (const [srv, helper] of helperByServer) {
            if (helper.kind === "native") {
              helperByServer.set(srv, { ...helper, path: linuxNativePath });
            }
          }
          if (jsSources.length > 0) {
            const node = await resolveNodeForDistro(location.distro);
            command = node.nodePath;
          }
          workerDirectory = `${deployed.linuxBaseDir}/mcp-filter`;
          stagedWithNative = true;
        }
      }
    }
    if (!stagedWithNative) {
      const fallbackHelpers = assignHelpers(undefined);
      const jsSources = resolveJsHelperSources(fallbackHelpers, helpersDir);
      const node = await resolveNodeForDistro(location.distro);
      const deployed = await deployFilesToWslTempBase(
        location.distro,
        `poracode-mcp-filter-${process.pid}`,
        jsSources.map((source) => ({ src: source.path, relDest: `mcp-filter/${source.name}` })),
      );
      if (!deployed) throw new Error("Poracode MCP launch helper could not be deployed to WSL.");
      command = node.nodePath;
      workerDirectory = `${deployed.linuxBaseDir}/mcp-filter`;
    }
  } else {
    const helpers = assignHelpers(nativeRelayPath(helpersDir));
    resolveJsHelperSources(helpers, helpersDir);
  }

  return servers.map((server) => {
    const helper = helperByServer.get(server);
    if (!helper) return server;
    const { directTransport, ...relayed } = server;
    // Let the native connection owner expand values and apply its reserved
    // environment policy before a schema-only wrapper starts the server.
    const inheritedServerStdioEnv =
      options.omitInvalidSchemaPatterns &&
      !requiresFiltering(server, options) &&
      server.transport.type === "stdio"
        ? server.transport.env
        : {};
    if (helper.kind === "native") {
      const transport: McpTransport = {
        type: "stdio",
        command: helper.path,
        args: [] as string[],
        env: {
          ...inheritedServerStdioEnv,
          ...helper.env,
        },
        cwd: location.kind === "wsl" ? location.linuxPath : location.path,
      };
      helperRelayTransports.add(transport);
      return {
        ...relayed,
        ...(directTransport && options.omitInvalidSchemaPatterns !== true
          ? { directTransport }
          : {}),
        transport,
      } as T;
    }
    const transport: McpTransport = {
      type: "stdio",
      command,
      args: [
        location.kind === "wsl"
          ? `${workerDirectory}/${helper.name}`
          : join(workerDirectory, helper.name),
      ],
      env: {
        ...inheritedServerStdioEnv,
        ...baseEnv,
        ...helper.env,
      },
      ...(location.kind === "wsl" ? { cwd: location.linuxPath } : { cwd: location.path }),
    };
    helperRelayTransports.add(transport);
    return {
      ...relayed,
      // A direct connection would bypass schema normalization.
      ...(directTransport && options.omitInvalidSchemaPatterns !== true ? { directTransport } : {}),
      transport,
    } as T;
  });
}
