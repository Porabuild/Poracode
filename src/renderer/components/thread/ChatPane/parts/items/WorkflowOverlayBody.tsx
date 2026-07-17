import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Bot, Check, CircleAlert } from "lucide-react";
import type {
  ProjectLocation,
  WorkflowAgent,
  WorkflowAgentState,
  WorkflowPhase,
  WorkflowRun,
  WorkflowRunStatus,
} from "@/shared/contracts";
import { LightballTabs, type LightballTab } from "@/renderer/components/common/LightballTabs";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { ThreadDockRow } from "@/renderer/components/thread/ThreadDockUI";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import { useWorkflowRun } from "@/renderer/state/useWorkflowRun";
import { WorkflowAgentChat } from "./WorkflowAgentChat";
import type { WorkflowInfo } from "./workflowDisplay";

/**
 * 3-pane workflow viewer:
 *   header (name + summary + totals) → phases tabs → agents list → agent detail.
 *
 * Data comes from `<sessionDir>/workflows/<runId>.json`, which the workflow
 * runtime updates incrementally while the run is in flight. We poll while
 * the parent tool item is still running (1.5s) and stop once it completes.
 */

interface WorkflowOverlayBodyProps {
  itemId: string;
  workflow: WorkflowInfo;
  isRunning: boolean;
  projectLocation: ProjectLocation | undefined;
}

export function WorkflowOverlayBody({
  itemId,
  workflow,
  isRunning,
  projectLocation,
}: WorkflowOverlayBodyProps) {
  // isRunning unused now — the shared store polls until the manifest reports
  // a terminal status, regardless of what the parent SDK item reports.
  void isRunning;
  const { t } = useLingui();
  const { run, error } = useWorkflowRun(
    workflow.manifestPath ? itemId : null,
    workflow.manifestPath ?? null,
    projectLocation ?? null,
    workflow.transcriptDir ?? null,
    true,
  );

  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  const displayRun = run ? applyWorkflowPlan(run, workflow) : null;
  const phases = displayRun?.phases ?? phasesFromInfo(workflow);
  const resolvedActivePhase = activePhase ?? phases[0]?.title ?? null;
  const phase = phases.find((p) => p.title === resolvedActivePhase) ?? phases[0] ?? emptyPhase();

  const unphased = displayRun?.unphasedAgents ?? [];
  const columnAgents = phases.length === 0 ? unphased : phase.agents;
  const showUnphasedAtTop = !run && phase.agents.length === 0 && unphased.length === 0;

  const selectedAgent = activeAgentId
    ? (columnAgents.find((a) => a.agentId === activeAgentId) ??
      findAgentById(phases, unphased, activeAgentId))
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowToolbar
        phases={phases}
        activeTitle={resolvedActivePhase}
        onSelectPhase={(title) => {
          setActivePhase(title);
          setActiveAgentId(null);
        }}
        run={displayRun}
        error={error}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <AgentsColumn
          agents={columnAgents}
          phaseTitle={phase.title}
          activeAgentId={activeAgentId}
          onSelect={setActiveAgentId}
          loading={!run && !error && !!workflow.manifestPath}
          emptyHint={
            showUnphasedAtTop
              ? t`Waiting for workflow to spawn agents…`
              : phases.length === 0
                ? t`No phases yet.`
                : t`No agents in this phase.`
          }
        />
        <AgentDetail
          agent={selectedAgent}
          phaseTitle={selectedAgent?.phaseTitle ?? phase.title}
          transcriptDir={workflow.transcriptDir}
          location={projectLocation}
        />
      </div>
      {unphased.length > 0 && phases.length > 0 ? (
        <UnphasedAgents agents={unphased} onSelect={setActiveAgentId} />
      ) : null}
    </div>
  );
}

/**
 * Single toolbar that combines phase tabs (left) and run-level stats (right).
 * Originally two stacked rows separated by thin borders — the stack read as
 * "ugly 3-line header" alongside the Shell title, so we collapsed it into one
 * line with no internal divider. The single border below this row separates
 * the toolbar from the agents/detail grid.
 */
function WorkflowToolbar({
  phases,
  activeTitle,
  onSelectPhase,
  run,
  error,
}: {
  phases: WorkflowPhase[];
  activeTitle: string | null;
  onSelectPhase: (title: string) => void;
  run: WorkflowRun | null;
  error: string | null;
}) {
  const { t } = useLingui();
  const status = run?.status ?? "unknown";
  const completed = run ? countCompletedAgents(run) : 0;
  const total = run?.agentCount ?? 0;
  const tokens = run?.totalTokens;
  const tools = run?.totalToolCalls;
  const duration = run?.durationMs;

  const statParts: string[] = [];
  if (total > 0) statParts.push(`${completed}/${total} agents`);
  if (duration !== undefined) statParts.push(formatDuration(duration));
  if (tokens !== undefined) statParts.push(`${formatTokenCount(tokens)} tok`);
  if (tools !== undefined) statParts.push(`${tools} tools`);

  const hasStats = statParts.length > 0 || status !== "unknown";
  if (phases.length === 0 && !hasStats && !error) return null;

  const phaseTabs: ReadonlyArray<LightballTab<string>> = phases.map((phase) => {
    const phaseDone = phase.agents.filter(isAgentDone).length;
    const phaseTotal = phase.agents.length;
    const tab: LightballTab<string> = { id: phase.title, label: phase.title };
    if (phaseTotal > 0) {
      tab.trailing = (
        <span className="tabular-nums opacity-70">
          {phaseDone}/{phaseTotal}
        </span>
      );
    }
    return tab;
  });

  return (
    <div className="shrink-0 border-b border-[color:var(--border)]">
      <div className="flex min-w-0 items-center gap-2 px-3 py-1">
        {phaseTabs.length > 0 && activeTitle ? (
          <LightballTabs
            tabs={phaseTabs}
            active={activeTitle}
            onChange={onSelectPhase}
            ariaLabel={t`Workflow phases`}
            shape="rounded"
            transparent
          />
        ) : null}
        <div className="flex-1" />
        {hasStats ? (
          <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-[length:var(--lc-chat-font-size-meta)] tabular-nums text-foreground-muted">
            {statParts.map((part, i) => (
              <span key={`stat-${i}-${part}`}>
                {i > 0 ? <span className="pr-1.5 opacity-50">·</span> : null}
                {part}
              </span>
            ))}
            <StatusBadge status={status} />
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 px-3 pb-1 text-[length:var(--lc-chat-font-size-meta)] text-danger">
          <CircleAlert className="size-3 shrink-0" /> {error}
        </p>
      ) : null}
    </div>
  );
}

function AgentsColumn({
  agents,
  phaseTitle,
  activeAgentId,
  onSelect,
  loading,
  emptyHint,
}: {
  agents: WorkflowAgent[];
  phaseTitle: string;
  activeAgentId: string | null;
  onSelect: (agentId: string) => void;
  loading: boolean;
  emptyHint: string;
}) {
  const { t } = useLingui();
  return (
    <div className="min-h-0 overflow-y-auto border-r border-[color:var(--border)] [scrollbar-gutter:stable]">
      {agents.length === 0 ? (
        <p className="px-3 py-3 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          {loading ? t`Loading…` : emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col">
          {agents.map((agent) => (
            <AgentRow
              key={agent.agentId}
              agent={agent}
              phaseTitle={phaseTitle}
              isActive={agent.agentId === activeAgentId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentRow({
  agent,
  phaseTitle,
  isActive,
  onSelect,
}: {
  agent: WorkflowAgent;
  phaseTitle: string;
  isActive: boolean;
  onSelect: (agentId: string) => void;
}) {
  const done = isAgentDone(agent);
  const labelDisplay = stripPhasePrefix(agent.label, phaseTitle);
  const stats: string[] = [];
  if (agent.model) stats.push(formatModel(agent.model));
  if (agent.tokens !== undefined) stats.push(`${formatTokenCount(agent.tokens)} tok`);
  if (agent.toolCalls !== undefined) stats.push(`${agent.toolCalls} tools`);
  if (done && agent.durationMs !== undefined) stats.push(formatDuration(agent.durationMs));
  return (
    <ThreadDockRow
      isActive={isActive}
      isDone={done}
      title={agent.label}
      onClick={() => onSelect(agent.agentId)}
    >
      <AgentStateIcon state={agent.state} />
      <code className="min-w-0 flex-1 truncate font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground">
        {labelDisplay}
      </code>
      {stats.length > 0 ? (
        <span className="shrink-0 tabular-nums text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          {stats.join(" · ")}
        </span>
      ) : null}
    </ThreadDockRow>
  );
}

function AgentDetail({
  agent,
  phaseTitle,
  transcriptDir,
  location,
}: {
  agent: WorkflowAgent | null;
  phaseTitle: string;
  transcriptDir: string | undefined;
  location: ProjectLocation | undefined;
}) {
  if (!agent) {
    return (
      <div className="hidden min-h-0 overflow-y-auto px-3 py-3 sm:block">
        <p className="text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <Trans>Select an agent to see its prompt and outcome.</Trans>
        </p>
      </div>
    );
  }
  const labelDisplay = stripPhasePrefix(agent.label, phaseTitle);
  return (
    <div className="min-h-0 overflow-y-auto px-3 py-3 [scrollbar-gutter:stable]">
      <div className="flex items-center gap-2 pb-2">
        <Bot className="size-3.5 shrink-0 text-foreground-muted" />
        <code className="min-w-0 flex-1 truncate font-mono text-[length:var(--lc-chat-font-size-command)] font-medium text-foreground">
          {labelDisplay}
        </code>
        <AgentStateIcon state={agent.state} />
      </div>
      <p className="text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        {[
          agent.model,
          agent.tokens !== undefined ? `${formatTokenCount(agent.tokens)} tok` : null,
          agent.toolCalls !== undefined ? `${agent.toolCalls} tool calls` : null,
          agent.durationMs !== undefined ? formatDuration(agent.durationMs) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {agent.lastToolName ? (
        <p className="pt-1 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <Trans>
            Last tool: <span className="font-mono">{agent.lastToolName}</span>
          </Trans>
        </p>
      ) : null}
      {transcriptDir && location ? (
        <div className="pt-3">
          <WorkflowAgentChat
            transcriptDir={transcriptDir}
            agentId={agent.agentId}
            agentFinished={isAgentDone(agent)}
            location={location}
            fallback={<AgentDetailFallback agent={agent} />}
          />
        </div>
      ) : (
        <AgentDetailFallback agent={agent} />
      )}
    </div>
  );
}

/**
 * Pre-transcript rendering of an agent's prompt/outcome/chat from the manifest
 * previews. Shown until the transcript-backed chat timeline has entries (or
 * when the transcript location isn't available at all).
 */
function AgentDetailFallback({ agent }: { agent: WorkflowAgent }) {
  return (
    <>
      {agent.promptPreview ? (
        <section className="pt-3">
          <h3 className="pb-1 text-[length:var(--lc-chat-font-size-meta)] font-medium text-foreground">
            <Trans>Prompt</Trans>
          </h3>
          <pre className="whitespace-pre-wrap break-words rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1.5 font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground/90">
            {agent.promptPreview}
          </pre>
        </section>
      ) : null}
      {agent.resultPreview ? (
        <section className="pt-3">
          <h3 className="pb-1 text-[length:var(--lc-chat-font-size-meta)] font-medium text-foreground">
            <Trans>Outcome</Trans>
          </h3>
          <pre className="whitespace-pre-wrap break-words rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1.5 font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground/90">
            {agent.resultPreview}
          </pre>
        </section>
      ) : null}
      {agent.chat?.length ? (
        <section className="pt-3">
          <h3 className="pb-1 text-[length:var(--lc-chat-font-size-meta)] font-medium text-foreground">
            <Trans>Chat</Trans>
          </h3>
          <ol className="flex flex-col gap-2">
            {agent.chat.map((entry, index) => (
              <li
                key={`${index}-${entry.timestamp ?? ""}-${entry.title ?? entry.role}`}
                className="rounded border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1.5"
              >
                <div className="flex min-w-0 items-baseline gap-2 pb-1 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
                  <span className="shrink-0 font-medium capitalize">{entry.role}</span>
                  {entry.title ? (
                    <span className="min-w-0 truncate font-mono">{entry.title}</span>
                  ) : null}
                  {entry.timestamp ? (
                    <span className="ml-auto shrink-0 tabular-nums opacity-70">
                      {formatChatTimestamp(entry.timestamp)}
                    </span>
                  ) : null}
                </div>
                {entry.text ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[length:var(--lc-chat-font-size-meta)] text-foreground/90">
                    {entry.text}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function UnphasedAgents({
  agents,
  onSelect,
}: {
  agents: WorkflowAgent[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="shrink-0 border-t border-dashed border-[color:var(--border)] px-3 py-1 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
      <span className="pr-2 font-medium">
        <Trans>Unphased:</Trans>
      </span>
      {agents.map((agent) => (
        <button
          type="button"
          key={agent.agentId}
          onClick={() => onSelect(agent.agentId)}
          className="mr-2 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-foreground/5"
        >
          <AgentStateIcon state={agent.state} />
          <code className="font-mono">{agent.label}</code>
        </button>
      ))}
    </div>
  );
}

function AgentStateIcon({ state }: { state: WorkflowAgentState | undefined }) {
  const { t } = useLingui();
  if (state === "done") {
    return <Check aria-label={t`done`} className="size-3 shrink-0 text-foreground-muted" />;
  }
  if (state === "failed" || state === "cancelled") {
    return <CircleAlert aria-label={state} className="size-3 shrink-0 text-danger" />;
  }
  return (
    <span className="inline-flex size-3 shrink-0 items-center justify-center">
      <PixelLoader size="xxs" className="text-foreground-muted" />
    </span>
  );
}

function StatusBadge({ status }: { status: WorkflowRunStatus }) {
  const { t } = useLingui();
  const label =
    status === "running"
      ? t`running`
      : status === "completed"
        ? t`done`
        : status === "failed"
          ? t`failed`
          : status === "cancelled"
            ? t`cancelled`
            : null;
  if (!label) return null;
  const className =
    status === "failed" || status === "cancelled"
      ? "text-danger"
      : status === "running"
        ? "text-foreground"
        : "text-foreground-muted";
  return <span className={`pl-1 ${className}`}>· {label}</span>;
}

function phasesFromInfo(info: WorkflowInfo): WorkflowPhase[] {
  return info.phases.map((phase) => {
    const out: WorkflowPhase = { title: phase.title, agents: [] };
    if (phase.detail) out.detail = phase.detail;
    return out;
  });
}

function applyWorkflowPlan(run: WorkflowRun, workflow: WorkflowInfo): WorkflowRun {
  // Statically planned agents (parsed from the script) win; otherwise fall
  // back to live observations from the run's progress descriptions. Both are
  // in agent-start order, matching the journal order of `unphasedAgents`.
  const plan = workflow.plannedAgents.length > 0 ? workflow.plannedAgents : workflow.liveAgents;
  if (run.phases.length > 0 || plan.length === 0) return run;

  const phases = phasesFromInfo(workflow);
  const phaseByTitle = new Map(phases.map((phase) => [phase.title, phase]));
  const unphasedAgents: WorkflowAgent[] = [];
  const agents = run.unphasedAgents.map((agent, index) => {
    const planned = plan[index];
    if (!planned) return agent;
    const merged: WorkflowAgent = {
      ...agent,
      // A synthesized in-flight agent is labeled with its raw id; only then is
      // the positional pairing an improvement. A real label (from the manifest
      // or transcript inference) is more trustworthy than order-based pairing.
      label: agent.label === agent.agentId ? planned.label : agent.label,
      ...(planned.phaseTitle && !agent.phaseTitle ? { phaseTitle: planned.phaseTitle } : {}),
      ...(planned.model && !agent.model ? { model: planned.model } : {}),
    };
    const targetTitle = merged.phaseTitle;
    if (targetTitle) {
      const target = phaseByTitle.get(targetTitle);
      if (target) {
        target.agents.push(merged);
        return null;
      }
    }
    return merged;
  });

  for (const agent of agents) {
    if (agent) unphasedAgents.push(agent);
  }

  return { ...run, phases, unphasedAgents };
}

function emptyPhase(): WorkflowPhase {
  return { title: "", agents: [] };
}

function countCompletedAgents(run: WorkflowRun): number {
  let total = 0;
  for (const phase of run.phases) total += phase.agents.filter(isAgentDone).length;
  for (const agent of run.unphasedAgents) if (isAgentDone(agent)) total += 1;
  return total;
}

function findAgentById(
  phases: WorkflowPhase[],
  unphased: WorkflowAgent[],
  agentId: string,
): WorkflowAgent | null {
  for (const phase of phases) {
    const agent = phase.agents.find((entry) => entry.agentId === agentId);
    if (agent) return agent;
  }
  return unphased.find((entry) => entry.agentId === agentId) ?? null;
}

function isAgentDone(agent: WorkflowAgent): boolean {
  return agent.state === "done" || agent.state === "failed" || agent.state === "cancelled";
}

/**
 * Strip the phase prefix from an agent label. Workflow scripts conventionally
 * name agents `<phase>:<detail>` (e.g. `verify:security`); inside a phase tab
 * the prefix is redundant since the active phase is already shown above. We
 * only strip when the prefix matches the active phase title (case-insensitive)
 * to avoid over-trimming labels that happen to contain a colon.
 */
function stripPhasePrefix(label: string, phaseTitle: string): string {
  if (!phaseTitle) return label;
  const prefix = `${phaseTitle.toLowerCase()}:`;
  if (label.toLowerCase().startsWith(prefix)) {
    const rest = label.slice(prefix.length).trim();
    return rest.length > 0 ? rest : label;
  }
  return label;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function formatModel(model: string): string {
  return model.replace(/^claude-/u, "").replace(/\[([^\]]+)\]/u, " · $1");
}

function formatChatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
