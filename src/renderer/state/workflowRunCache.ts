import type { ProjectLocation, WorkflowAgent, WorkflowRun } from "@/shared/contracts";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";

export interface WorkflowRunSource {
  manifestPath: string;
  transcriptDir: string | undefined;
  location: ProjectLocation;
}

export interface WorkflowRunEntry {
  manifestPath: string;
  run: WorkflowRun | null;
  loading: boolean;
  error: string | null;
}

// Only inactive summaries count toward these limits. Active viewers keep all
// their evidence; the backend remains the authority for refetching evicted data.
const MAX_IDLE_ENTRIES = 32;
const MAX_IDLE_ESTIMATED_BYTES = 1024 * 1024;

/** Remove reconstructible chats without mutating a published/bridge snapshot. */
export function withoutWorkflowAgentChats(run: WorkflowRun | null): WorkflowRun | null {
  if (!run) return run;
  const strip = (agents: WorkflowAgent[]): WorkflowAgent[] => {
    if (!agents.some((agent) => agent.chat !== undefined)) return agents;
    return agents.map((agent) => {
      if (agent.chat === undefined) return agent;
      const next = { ...agent };
      delete next.chat;
      return next;
    });
  };
  let changed = false;
  const phases = run.phases.map((phase) => {
    const agents = strip(phase.agents);
    if (agents === phase.agents) return phase;
    changed = true;
    return { ...phase, agents };
  });
  const unphasedAgents = strip(run.unphasedAgents);
  return changed || unphasedAgents !== run.unphasedAgents
    ? { ...run, phases, unphasedAgents }
    : run;
}

/**
 * LRU bookkeeping holds source identities and estimates, never a second run
 * snapshot. The charge includes keys/metadata and the immutable summary graph;
 * it is a logical estimate, not measured heap or physical memory usage.
 */
export class IdleWorkflowRunCache {
  private readonly entries = new Map<string, { source: WorkflowRunSource; bytes: number }>();
  private estimatedBytes = 0;

  take(itemId: string): WorkflowRunSource | undefined {
    const entry = this.entries.get(itemId);
    if (!entry) return undefined;
    this.entries.delete(itemId);
    this.estimatedBytes -= entry.bytes;
    return entry.source;
  }

  retain(itemId: string, source: WorkflowRunSource, entry: WorkflowRunEntry): string[] {
    this.take(itemId);
    const bytes = estimateCacheValueBytes(entry) + estimateCacheValueBytes({ itemId, source });
    if (bytes > MAX_IDLE_ESTIMATED_BYTES) return [itemId];
    this.entries.set(itemId, { source, bytes });
    this.estimatedBytes += bytes;
    const evicted: string[] = [];
    while (this.entries.size > MAX_IDLE_ENTRIES || this.estimatedBytes > MAX_IDLE_ESTIMATED_BYTES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.take(oldest);
      evicted.push(oldest);
    }
    return evicted;
  }
}
