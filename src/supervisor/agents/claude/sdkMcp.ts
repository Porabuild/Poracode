import { isDeepStrictEqual } from "node:util";
import type { Query, resolveSettings } from "@anthropic-ai/claude-agent-sdk";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base";
import { buildClaudeMcpServers } from "../userMcp";

type McpServers = ReturnType<typeof buildClaudeMcpServers>;

/** Late registration needs native ToolSearch to discover tools on the first turn. */
export async function canDeferClaudeMcpConnections(
  location: ProjectLocation,
  model: string,
  env: Readonly<Record<string, string | undefined>>,
  readSettings: typeof resolveSettings,
): Promise<boolean> {
  // The SDK settings reader runs on the host, not in WSL or a profile's home.
  if (location.kind === "wsl" || env.CLAUDE_CONFIG_DIR) return false;
  if (
    !/^(?:(?:haiku|sonnet|opus|fable)(?:\[[^\]]+\])?|claude-(?:haiku|sonnet|opus|fable)-(?:[4-9]|\d{2,})(?:[-.].*)?)$/i.test(
      model,
    )
  )
    return false;
  const supportsSearch = (values: Readonly<Record<string, string | undefined>>) =>
    !values.CLAUDE_CONFIG_DIR &&
    (values.ENABLE_TOOL_SEARCH === undefined ||
      ["", "auto", "true"].includes(values.ENABLE_TOOL_SEARCH.toLowerCase())) &&
    !Object.entries(values).some(
      ([key, value]) =>
        value &&
        (key === "ANTHROPIC_BASE_URL" ||
          key === "ANTHROPIC_MODEL" ||
          /^ANTHROPIC_DEFAULT_.*_MODEL$/.test(key) ||
          /^CLAUDE_CODE_USE_(?:BEDROCK|VERTEX|FOUNDRY|MANTLE|ANTHROPIC_AWS)$/.test(key)),
    );
  if (!supportsSearch(env)) return false;
  try {
    const { effective } = await readSettings({
      cwd: location.path,
      settingSources: ["user", "project", "local"],
    });
    // policyHelper is resolved by the CLI itself, outside this SDK reader.
    if (effective.policyHelper || !supportsSearch(effective.env ?? {})) return false;
    return ![...(effective.permissions?.deny ?? []), ...(effective.permissions?.ask ?? [])].some(
      (rule) => rule === "*" || /^ToolSearch(?:\(|$)/.test(rule),
    );
  } catch {
    return false;
  }
}

/** Keep live MCP updates ordered and scoped to the SDK query that owns them. */
export class ClaudeSdkMcpServers {
  private readonly applied = new WeakMap<Query, McpServers>();
  private readonly pending = new WeakMap<Query, Promise<void>>();
  private readonly failed = new WeakMap<Query, string[]>();
  private readonly deferred = new WeakMap<Query, McpServers>();
  private readonly backgroundConnections = new WeakMap<Query, Promise<void>>();

  constructor(private readonly resolve: CreateStructuredSessionInput["resolveMcpServersForTurn"]) {}

  initialize(query: Query, servers: McpServers): void {
    this.applied.set(query, servers);
  }

  deferUntilReady(query: Query, servers: McpServers): void {
    // Unchanged turns may proceed while the initial connection is pending.
    this.initialize(query, servers);
    if (Object.keys(servers).length > 0) this.deferred.set(query, servers);
  }

  connectDeferred(query: Query, isCurrent: () => boolean): Promise<void> {
    const servers = this.deferred.get(query);
    this.deferred.delete(query);
    if (!servers || !isCurrent()) return Promise.resolve();
    return this.connectInBackground(query, servers, isCurrent);
  }

  private connectInBackground(
    query: Query,
    servers: McpServers,
    isCurrent: () => boolean,
  ): Promise<void> {
    const pending = this.backgroundConnections.get(query);
    if (pending) return pending;
    const connection = this.apply(query, servers, isCurrent)
      .catch(() => {
        // Optional startup connections must not fail an unrelated chat turn.
        if (isCurrent()) this.failed.set(query, Object.keys(servers));
      })
      .finally(() => this.backgroundConnections.delete(query));
    this.backgroundConnections.set(query, connection);
    return connection;
  }

  sync(query: Query, config: ThreadConfig, isCurrent: () => boolean): Promise<void> {
    const resolve = this.resolve;
    if (!resolve) return Promise.resolve();
    const update = (this.pending.get(query) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (!isCurrent()) return;
        const servers = buildClaudeMcpServers(await resolve(config, isCurrent));
        if (!isCurrent()) return;
        if (isDeepStrictEqual(this.applied.get(query), servers)) {
          if (this.failed.get(query)?.length) {
            void this.connectInBackground(query, servers, isCurrent);
          }
          return;
        }
        this.deferred.delete(query);
        // A late initial connection must not restore servers disabled by a turn.
        await this.backgroundConnections.get(query);
        if (!isCurrent()) return;
        // A failed control request can still partially change the native set.
        // Never treat the previous snapshot as authoritative after sending it.
        this.applied.delete(query);
        await this.apply(query, servers, isCurrent);
        if (isCurrent()) this.applied.set(query, servers);
      });
    this.pending.set(query, update);
    return update;
  }

  private async apply(query: Query, servers: McpServers, isCurrent: () => boolean): Promise<void> {
    if (!isCurrent()) return;
    const result = await query.setMcpServers(servers);
    const previouslyFailed = this.failed.get(query) ?? [];
    const failed = new Set([
      ...Object.keys(result.errors),
      ...previouslyFailed.filter((name) => name in servers),
    ]);
    // The CLI retains an unchanged, failed connection without retrying it
    // on setMcpServers. Redial failures still requested by this turn.
    try {
      for (const name of previouslyFailed) {
        if (!isCurrent()) return;
        if (!(name in servers) || Object.hasOwn(result.errors, name)) continue;
        try {
          await query.reconnectMcpServer(name);
          failed.delete(name);
        } catch {
          failed.add(name);
        }
      }
    } finally {
      this.failed.set(query, [...failed]);
    }
    if (failed.size > 0) {
      throw new Error(`Could not connect MCP servers: ${[...failed].join(", ")}`);
    }
  }
}
