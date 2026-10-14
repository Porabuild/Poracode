import { normalizeCrossagentTags, type CrossagentRankSource } from "@/shared/crossagentRanking";
import { MAX_CROSSAGENT_SELECTION_VALUE_LENGTH } from "@/shared/settings";
import type { ResolvedSpawnAttempt } from "./spawnPlan";
import type {
  ExplicitSpawnAgentSelection,
  SpawnAgentRequest,
  SubagentAttemptResult,
  SubagentRunStatus,
} from "./types";

/** Dispatch-only metadata supplied by selection resolution, never by tool arguments. */
export interface DispatchSelectionProvenance {
  source: CrossagentRankSource | "explicit" | "continuation";
  rankSource?: CrossagentRankSource;
  explicitFields?: ExplicitSpawnAgentSelection["explicitFields"];
  matchedTags?: readonly string[];
  /** Routes are identified by their normalized tag set, not an invented ID. */
  routeTags?: readonly string[];
}

export interface DispatchProvenance {
  selection: DispatchSelectionProvenance;
  fallbackSource: "none" | "saved-route" | "per-call";
  retryModeSource: "default" | "saved-route" | "per-call";
}

interface TraceSelection {
  provider: string;
  model: string;
  effort?: string;
  fast: boolean;
}

export interface DispatchTraceSnapshot {
  selection: DispatchSelectionProvenance & { primary: TraceSelection };
  fallbackPolicy: {
    source: DispatchProvenance["fallbackSource"];
    retryModeSource: DispatchProvenance["retryModeSource"];
    retryMode: "startup" | "any-failure";
    entries: TraceSelection[];
  };
}

export interface SubagentDispatchTrace extends DispatchTraceSnapshot {
  attempts: Array<
    TraceSelection & {
      index: number;
      status: SubagentRunStatus;
      reason?: "startup-failure" | "execution-failure" | "cancelled";
    }
  >;
}

// Match the public selection limit and existing maximum of three fallbacks.
const MAX_TRACE_ATTEMPTS = 4;

function boundedValue(value: string): string {
  // eslint-disable-next-line no-control-regex -- selection identifiers must not carry control characters into diagnostic reads.
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, "");
  return sanitized.slice(0, MAX_CROSSAGENT_SELECTION_VALUE_LENGTH);
}

function traceSelection(attempt: ResolvedSpawnAttempt): TraceSelection {
  return {
    provider: boundedValue(attempt.provider),
    model: boundedValue(attempt.model),
    ...(attempt.config.effort ? { effort: boundedValue(attempt.config.effort) } : {}),
    fast: attempt.config.fast === true,
  };
}

/** Copy only public selection metadata, after the complete spawn plan is validated. */
export function snapshotDispatchTrace(
  request: SpawnAgentRequest,
  attempts: readonly ResolvedSpawnAttempt[],
  retryMode: "startup" | "any-failure",
): DispatchTraceSnapshot {
  const provenance = request.dispatchProvenance;
  const selection = provenance?.selection;
  const explicit = selection?.explicitFields;
  return {
    selection: {
      source: selection?.source ?? "explicit",
      ...(selection?.rankSource ? { rankSource: selection.rankSource } : {}),
      ...(explicit
        ? {
            explicitFields: {
              provider: explicit.provider === true,
              model: explicit.model === true,
              effort: explicit.effort === true,
              fast: explicit.fast === true,
            },
          }
        : {}),
      ...(selection?.matchedTags
        ? { matchedTags: normalizeCrossagentTags(selection.matchedTags) }
        : {}),
      ...(selection?.routeTags ? { routeTags: normalizeCrossagentTags(selection.routeTags) } : {}),
      primary: traceSelection(attempts[0]!),
    },
    fallbackPolicy: {
      source: provenance?.fallbackSource ?? (request.fallbacks !== undefined ? "per-call" : "none"),
      retryModeSource:
        provenance?.retryModeSource ?? (request.retryMode !== undefined ? "per-call" : "default"),
      retryMode,
      entries: attempts.slice(1, MAX_TRACE_ATTEMPTS).map(traceSelection),
    },
  };
}

/** Fresh bounded projection from retained provenance and existing attempt outcomes. */
export function readDispatchTrace(
  snapshot: DispatchTraceSnapshot,
  results: readonly SubagentAttemptResult[],
  attemptIndex: number,
  status: SubagentRunStatus,
): SubagentDispatchTrace {
  const selections = [snapshot.selection.primary, ...snapshot.fallbackPolicy.entries];
  return {
    selection: {
      ...snapshot.selection,
      ...(snapshot.selection.explicitFields
        ? { explicitFields: { ...snapshot.selection.explicitFields } }
        : {}),
      ...(snapshot.selection.matchedTags
        ? { matchedTags: [...snapshot.selection.matchedTags] }
        : {}),
      ...(snapshot.selection.routeTags ? { routeTags: [...snapshot.selection.routeTags] } : {}),
      primary: { ...snapshot.selection.primary },
    },
    fallbackPolicy: {
      ...snapshot.fallbackPolicy,
      entries: snapshot.fallbackPolicy.entries.map((entry) => ({ ...entry })),
    },
    attempts: selections
      .slice(0, Math.min(attemptIndex + 1, MAX_TRACE_ATTEMPTS))
      .map((entry, index) => {
        const result = results.find((candidate) => candidate.attempt === index + 1);
        const outcome = result?.status ?? status;
        return {
          ...entry,
          index: index + 1,
          status: outcome,
          ...(outcome === "failed"
            ? {
                reason:
                  result?.may_have_side_effects === true
                    ? ("execution-failure" as const)
                    : ("startup-failure" as const),
              }
            : {}),
          ...(outcome === "cancelled" ? { reason: "cancelled" as const } : {}),
        };
      }),
  };
}
