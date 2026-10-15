import { isDeepStrictEqual } from "node:util";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base";
import { buildClaudeMcpServers } from "../userMcp";

type McpServers = ReturnType<typeof buildClaudeMcpServers>;

/** Keep live MCP updates ordered and scoped to the SDK query that owns them. */
export class ClaudeSdkMcpServers {
  private readonly applied = new WeakMap<Query, McpServers>();
  private readonly pending = new WeakMap<Query, Promise<void>>();
  private readonly failed = new WeakMap<Query, string[]>();

  constructor(private readonly resolve: CreateStructuredSessionInput["resolveMcpServersForTurn"]) {}

  initialize(query: Query, servers: McpServers): void {
    this.applied.set(query, servers);
  }

  sync(query: Query, config: ThreadConfig, isCurrent: () => boolean): Promise<void> {
    const resolve = this.resolve;
    if (!resolve) return Promise.resolve();
    const update = (this.pending.get(query) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (!isCurrent()) return;
        const servers = buildClaudeMcpServers(await resolve(config, isCurrent));
        if (!isCurrent() || isDeepStrictEqual(this.applied.get(query), servers)) return;
        // A failed control request can still partially change the native set.
        // Never treat the previous snapshot as authoritative after sending it.
        this.applied.delete(query);
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
        this.applied.set(query, servers);
      });
    this.pending.set(query, update);
    return update;
  }
}
