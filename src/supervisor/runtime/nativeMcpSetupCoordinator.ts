import type {
  ApplyNativeMcpSetupPayload,
  McpServer,
  NativeMcpSetupPayload,
  NativeMcpSetupStatus,
} from "@/shared/contracts";
import type { AgentAdapter } from "../agents/base";
import { digest, NativeMcpInstallation } from "../mcp/nativeSetup/installation";

/** No startup/launch side effects. Only explicit settings RPCs write native configuration. */
export class NativeMcpSetupCoordinator {
  constructor(
    private readonly adapters: ReadonlyMap<string, AgentAdapter>,
    private readonly baseDir: string,
    private readonly readServers: () => readonly McpServer[],
  ) {}
  private installation(input: NativeMcpSetupPayload) {
    const ctx =
      input.env.kind === "wsl"
        ? { envKind: "wsl" as const, wslDistro: input.env.distro, baseDir: this.baseDir }
        : {
            envKind: process.platform === "win32" ? ("windows" as const) : ("posix" as const),
            baseDir: this.baseDir,
          };
    const config = this.adapters.get(input.agentKind)?.nativeMcpConfig?.(ctx);
    return config ? new NativeMcpInstallation(config, this.baseDir) : undefined;
  }
  private inspect(input: NativeMcpSetupPayload) {
    const installation = this.installation(input);
    if (!installation) return undefined;
    const snapshot = installation.snapshot();
    const servers = this.readServers();
    return { installation, snapshot, servers };
  }
  private describe(
    state: NonNullable<ReturnType<NativeMcpSetupCoordinator["inspect"]>>,
  ): NativeMcpSetupStatus {
    const { installation, snapshot, servers } = state;
    return {
      supported: true,
      configPath: installation.config.path,
      revision: digest(snapshot.revision + JSON.stringify(servers)),
      installedNames: snapshot.owned,
      modifiedNames: snapshot.modified,
      candidates: servers.map((server) => {
        // JSON parsers and ownership validation cannot preserve this key reliably.
        let eligible = server.enabled && server.name !== "__proto__";
        try {
          installation.config.entry(server);
        } catch {
          eligible = false;
        }
        // Repeated names/IDs cannot be mapped unambiguously to native definitions.
        if (
          servers.filter((other) => other.name === server.name || other.id === server.id).length > 1
        )
          eligible = false;
        return {
          id: server.id,
          name: server.name,
          target:
            server.transport.type === "stdio"
              ? server.transport.command
              : new URL(server.transport.url).origin,
          eligible,
          conflict:
            Object.hasOwn(snapshot.entries, server.name) && !snapshot.owned.includes(server.name),
          installed: snapshot.owned.includes(server.name),
        };
      }),
    };
  }
  getStatus(input: NativeMcpSetupPayload): NativeMcpSetupStatus {
    const empty = { candidates: [], installedNames: [], modifiedNames: [] };
    try {
      const state = this.inspect(input);
      return state ? this.describe(state) : { supported: false, ...empty };
    } catch {
      return { supported: true, issue: "invalid-config", ...empty };
    }
  }
  apply(input: ApplyNativeMcpSetupPayload): NativeMcpSetupStatus {
    // All work is synchronous through commit; calls from renderer windows cannot interleave.
    const state = this.inspect(input);
    if (!state) throw new Error("Native MCP setup is unavailable");
    const { installation, snapshot, servers } = state;
    const status = this.describe(state);
    if (status.revision !== input.revision)
      throw new Error("Native MCP setup changed or is unavailable; refresh before retrying");
    if (!input.installIds.length && !input.removeNames.length) return status;
    const additions = Object.fromEntries(
      input.installIds.map((id) => {
        const candidate = status.candidates.find((entry) => entry.id === id);
        const server = servers.find((entry) => entry.id === id);
        if (!server || !candidate?.eligible || candidate.conflict)
          throw new Error("Native MCP server cannot be installed");
        return [server.name, installation.config.entry(server)];
      }),
    );
    if (
      input.removeNames.some(
        (name) => !status.installedNames.includes(name) || Object.hasOwn(additions, name),
      )
    )
      throw new Error("Native MCP removal is not owned or conflicts with installation");
    installation.apply(snapshot.revision, additions, input.removeNames);
    return this.getStatus(input);
  }
}
