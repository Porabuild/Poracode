import { useState } from "react";
import { Crown, FlaskConical, Loader2, Trash2, X } from "lucide-react";
import { useAppStore } from "@/renderer/state/appStore";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import {
  crownExperiment,
  discardExperiment,
  mergeExperimentWinner,
  setManualCrown,
} from "@/renderer/actions/experimentActions";
import { openThreadStandalone } from "@/renderer/actions/threadActions";
import { HomeView } from "@/renderer/views/HomeView";
import { ExperimentCandidateCard } from "./parts/ExperimentCandidateCard";

export function ExperimentView(props: { experimentId: string }) {
  const experiment = useAppStore((s) => s.experiments[props.experimentId]);
  const [crowning, setCrowning] = useState(false);

  // The experiment was discarded/never existed — fall back to home rather than
  // a blank pane (e.g. after reload of a stale persisted view).
  if (!experiment) {
    return <HomeView />;
  }
  // Capture a non-null binding so closures below narrow correctly.
  const exp = experiment;

  const candidates = exp.candidates;
  const decided = exp.winnerThreadId !== undefined;
  const crownThreadId = exp.crown?.threadId;

  async function handleCrown() {
    setCrowning(true);
    try {
      await crownExperiment(exp.id);
    } finally {
      setCrowning(false);
    }
  }

  function openCandidate(threadId: string) {
    // Open just this candidate full-screen, ignoring its experiment group, so it
    // doesn't pull every sibling into a split. The board stays reachable from
    // the sidebar.
    openThreadStandalone(threadId);
  }

  async function handleMerge(threadId: string) {
    const winner = candidates.find((c) => c.threadId === threadId);
    const loserCount = candidates.length - 1;
    const ok = window.confirm(
      `Merge ${winner?.agentLabel ?? "this candidate"}'s changes into ${
        exp.baseBranch ?? "the base branch"
      }` + (loserCount > 0 ? ` and discard the other ${loserCount}?` : "?"),
    );
    if (!ok) return;
    await mergeExperimentWinner(exp.id, threadId);
  }

  async function handleDiscard() {
    const ok = window.confirm(
      "Discard this experiment? All candidate worktrees and branches will be removed.",
    );
    if (!ok) return;
    await discardExperiment(exp.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className={`lightcode-content-over-drag-region ${macosTrafficLightPadClass} flex h-[env(titlebar-area-height,32px)] shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-2`}
      >
        <FlaskConical className="size-3.5 shrink-0 text-muted" />
        <span className="truncate text-xs font-medium">{exp.title}</span>
        <span className="shrink-0 rounded-full bg-[var(--row-hover)] px-1.5 py-0.5 text-[10px] text-muted">
          {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!decided && (
            <button
              type="button"
              onClick={handleCrown}
              disabled={crowning || candidates.length < 2}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] px-2 py-0.5 text-xs transition-colors hover:bg-[var(--row-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              title="Let an AI judge pre-select the best diff"
            >
              {crowning ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Crown className="size-3" />
              )}
              {crowning ? "Judging…" : "Crown with AI"}
            </button>
          )}
          <button
            type="button"
            onClick={handleDiscard}
            aria-label="Discard experiment"
            className="rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-rose-500"
            title="Discard experiment"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close experiment"
            className="rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
            onClick={() => useAppStore.getState().closeExperiment()}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="rounded-lg border border-[var(--hairline)] bg-[var(--row-hover)]/30 p-3">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Prompt
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{exp.prompt}</p>
            {exp.baseBranch && (
              <div className="mt-2 text-xs text-muted">
                Forked from <span className="font-mono">{exp.baseBranch}</span>
              </div>
            )}
          </div>

          {decided && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Winner merged. The other candidates were archived.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {candidates.map((candidate) => (
              <ExperimentCandidateCard
                key={candidate.threadId}
                candidate={candidate}
                isCrowned={crownThreadId === candidate.threadId}
                isWinner={exp.winnerThreadId === candidate.threadId}
                {...(exp.crown?.rationale ? { crownRationale: exp.crown.rationale } : {})}
                {...(exp.crown?.source ? { crownSource: exp.crown.source } : {})}
                decided={decided}
                onOpen={() => openCandidate(candidate.threadId)}
                onCrown={() => setManualCrown(exp.id, candidate.threadId)}
                onMerge={() => void handleMerge(candidate.threadId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
