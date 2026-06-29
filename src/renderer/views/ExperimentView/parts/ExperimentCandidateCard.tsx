import { useShallow } from "zustand/shallow";
import { useLingui } from "@lingui/react/macro";
import { Crown, ExternalLink, GitMerge, Loader2 } from "lucide-react";
import type { ExperimentCandidate } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import { getStatusTone, type StatusTone } from "@/renderer/components/providers";
import { threadRuntimeStatusLabel } from "@/renderer/components/thread/ThreadHeaderStatus";
import { useGitStore } from "@/renderer/state/gitStore";
import { useThread } from "@/renderer/state/useThread";

const TONE_DOT_CLASS: Record<StatusTone, string> = {
  working: "bg-warning",
  attention: "bg-warning",
  active: "bg-success",
  finished: "bg-success",
  error: "bg-danger",
  done: "bg-muted-foreground/40",
  inactive: "bg-muted-foreground/40",
};

export function ExperimentCandidateCard(props: {
  candidate: ExperimentCandidate;
  isCrowned: boolean;
  isWinner: boolean;
  crownRationale?: string;
  crownSource?: "ai" | "user";
  decided: boolean;
  onOpen: () => void;
  onCrown: () => void;
  onMerge: () => void;
}) {
  const { candidate, isCrowned, isWinner, crownRationale, crownSource, decided } = props;
  const { t } = useLingui();
  const thread = useThread(candidate.threadId);
  const statusLabel = thread ? threadRuntimeStatusLabel(thread, t) : t`Idle`;
  const statusTone = thread ? getStatusTone(thread) : "inactive";
  const spinning = thread?.status === "launching" || thread?.status === "working";
  const busy = isThreadTurnActive(thread?.status ?? "inactive");

  const stats = useGitStore(
    useShallow((s) => {
      const st = s.worktreeStatuses[candidate.worktreePath];
      if (!st) return null;
      const files = new Set([...st.staged, ...st.unstaged].map((f) => f.path)).size;
      return { insertions: st.totalInsertions, deletions: st.totalDeletions, files };
    }),
  );

  const label = candidate.agentLabel ?? candidate.agentKind;

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors ${
        isWinner
          ? "border-amber-400/70 bg-amber-400/5"
          : isCrowned
            ? "border-amber-400/40 bg-amber-400/[0.03]"
            : "border-[var(--hairline)] bg-[var(--surface,transparent)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {(isCrowned || isWinner) && (
              <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Crowned" />
            )}
            <span className="truncate text-sm font-medium">{label}</span>
          </div>
          {candidate.model && (
            <span className="block truncate text-xs text-muted">{candidate.model}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          {spinning ? (
            <Loader2 className="size-3 animate-spin text-warning" />
          ) : (
            <span className={`size-2 rounded-full ${TONE_DOT_CLASS[statusTone]}`} />
          )}
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        {stats ? (
          <>
            <span className="font-mono text-success">+{stats.insertions}</span>
            <span className="font-mono text-danger">−{stats.deletions}</span>
            <span className="text-muted">
              {stats.files} {stats.files === 1 ? "file" : "files"}
            </span>
          </>
        ) : (
          <span className="text-muted">{busy ? "Computing changes…" : "No changes yet"}</span>
        )}
        <span className="ml-auto truncate font-mono text-[11px] text-muted/70">
          {candidate.worktreeBranch}
        </span>
      </div>

      {isCrowned && crownRationale && (
        <div className="rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-medium">{crownSource === "user" ? "Your pick" : "AI judge"}:</span>{" "}
          {crownRationale}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2">
        <button
          type="button"
          onClick={props.onOpen}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] px-2 py-1 text-xs transition-colors hover:bg-[var(--row-hover)]"
        >
          <ExternalLink className="size-3" />
          Open
        </button>
        {!decided && (
          <button
            type="button"
            onClick={props.onCrown}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              isCrowned
                ? "text-amber-600 dark:text-amber-400"
                : "border border-[var(--hairline)] hover:bg-[var(--row-hover)]"
            }`}
          >
            <Crown className="size-3" />
            {isCrowned ? "Crowned" : "Crown"}
          </button>
        )}
        {!decided && (
          <button
            type="button"
            onClick={props.onMerge}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <GitMerge className="size-3" />
            Merge winner
          </button>
        )}
        {isWinner && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <GitMerge className="size-3" />
            Merged
          </span>
        )}
      </div>
    </div>
  );
}
