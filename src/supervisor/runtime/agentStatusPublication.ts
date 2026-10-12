import {
  agentStatusSchema,
  type AgentKind,
  type AgentStatus,
  type AgentStatusesResponse,
} from "@/shared/contracts";

export interface AgentStatusTarget {
  kind: AgentKind;
  envKind: "windows" | "posix" | "wsl";
  envDistro?: string;
}

export interface AgentStatusPublicationTicket {
  readonly epoch: number;
  readonly id: number;
  readonly targets: ReadonlyMap<string, AgentStatusTarget>;
}

function targetKey(target: Pick<AgentStatus, "kind" | "envKind" | "envDistro">): string {
  // Older valid native cache rows can omit envKind. They still represent the
  // same native target, rather than an extra row beside its live replacement.
  const envKind = target.envKind ?? (process.platform === "win32" ? "windows" : "posix");
  return JSON.stringify([target.kind, envKind, target.envDistro ?? null]);
}

/**
 * In-memory ownership for detection publications. Reserve targets before a
 * job waits in the probe queue: only the latest request for each target may
 * publish. An accepted snapshot remains last-known while that target refreshes;
 * registry invalidation/full refresh retires the entire view instead.
 *
 * Maps contain target identities, not a history of jobs. Persistence is allowed
 * only when every latest requested target has completed, never for a partial
 * native/WSL sweep or while a newer scoped request is queued.
 */
export class AgentStatusPublication {
  private epoch = 0;
  private sequence = 0;
  private readonly owners = new Map<string, number>();
  private readonly completed = new Map<string, number>();
  private readonly ready = new Map<string, AgentStatus | null>();
  private ignoreCache = false;

  begin(targets: readonly AgentStatusTarget[]): AgentStatusPublicationTicket {
    const id = ++this.sequence;
    const byKey = new Map(targets.map((target) => [targetKey(target), target]));
    for (const key of byKey.keys()) {
      this.owners.set(key, id);
      this.completed.delete(key);
    }
    return { epoch: this.epoch, id, targets: byKey };
  }

  invalidate(): void {
    this.epoch++;
    this.owners.clear();
    this.completed.clear();
    this.ready.clear();
    // Best-effort unlink must not let a stale readable cache become current.
    this.ignoreCache = true;
  }

  owns(ticket: AgentStatusPublicationTicket, target: AgentStatusTarget): boolean {
    const key = targetKey(target);
    return (
      ticket.epoch === this.epoch && ticket.targets.has(key) && this.owners.get(key) === ticket.id
    );
  }

  isActive(ticket: AgentStatusPublicationTicket): boolean {
    return (
      ticket.epoch === this.epoch &&
      (ticket.targets.size === 0 ||
        [...ticket.targets.values()].some((target) => this.owns(ticket, target)))
    );
  }

  accept(
    ticket: AgentStatusPublicationTicket,
    target: AgentStatusTarget,
    status: unknown,
  ): AgentStatus | undefined {
    if (!this.owns(ticket, target)) return undefined;
    const key = targetKey(target);
    const parsed = agentStatusSchema.safeParse(status);
    if (!parsed.success || targetKey(parsed.data) !== key) {
      // Invalid completed data is no verdict, rather than permission to keep
      // advertising this target's old capabilities from the baseline cache.
      this.ready.set(key, null);
      return undefined;
    }
    const snapshot = structuredClone(parsed.data);
    this.ready.set(key, snapshot);
    // Event handlers and adapters must not acquire the retained snapshot.
    return structuredClone(snapshot);
  }

  complete(ticket: AgentStatusPublicationTicket): void {
    for (const [key, target] of ticket.targets) {
      if (this.owns(ticket, target)) this.completed.set(key, ticket.id);
    }
  }

  canPersist(ticket: AgentStatusPublicationTicket): boolean {
    return (
      this.isActive(ticket) &&
      [...this.owners].every(([key, owner]) => this.completed.get(key) === owner)
    );
  }

  persisted(ticket: AgentStatusPublicationTicket): void {
    if (!this.canPersist(ticket)) return;
    this.ignoreCache = false;
    // Once the complete view is durable, the valid cache is the last-known
    // source again. Retain live snapshots only during detection/write failure.
    this.ready.clear();
  }

  view(baseline: AgentStatusesResponse, wslDistros?: readonly string[]): AgentStatusesResponse {
    const byKey = new Map<string, AgentStatus>();
    if (!this.ignoreCache) {
      for (const status of [...baseline.windows, ...baseline.wsl]) {
        byKey.set(targetKey(status), status);
      }
    }
    for (const [key, status] of this.ready) {
      if (status === null) byKey.delete(key);
      else byKey.set(key, status);
    }
    const statuses = structuredClone([...byKey.values()]);
    const distros = wslDistros === undefined ? undefined : new Set(wslDistros);
    return {
      windows: statuses.filter((status) => status.envKind !== "wsl"),
      wsl: statuses.filter(
        (status) =>
          status.envKind === "wsl" &&
          (distros === undefined ||
            (status.envDistro !== undefined && distros.has(status.envDistro))),
      ),
      // A cold partial view does not finish renderer startup discovery. A
      // valid complete baseline remains usable while live rows replace it.
      fromCache: !this.ignoreCache && baseline.fromCache,
    };
  }
}
