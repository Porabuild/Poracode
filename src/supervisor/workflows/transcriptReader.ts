import { readdir, readFile } from "node:fs/promises";
import type {
  ProjectLocation,
  WorkflowAgent,
  WorkflowAgentState,
  WorkflowPhase,
  WorkflowRun,
  WorkflowRunStatus,
} from "@/shared/contracts";
import { listSessionDir, readSessionFileText } from "../agents/base";

/**
 * The on-disk manifest at `<projectSessionDir>/workflows/<runId>.json` carries
 * a single `workflowProgress` event log alongside summary fields. Agents and
 * phases come in as separate event types; we fold them into a phases→agents
 * tree here so the renderer can drive the 3-pane viewer directly.
 *
 * Manifests are written incrementally for in-progress runs, so callers MUST
 * be tolerant of missing/extra fields — we silently drop records we can't
 * parse rather than failing the whole read.
 */
export interface ReadWorkflowRunInput {
  manifestPath: string;
  /** Optional — when provided, used to compute in-flight agent counts before the manifest is written. */
  transcriptDir?: string;
  location: ProjectLocation;
}

export async function readWorkflowRun(input: ReadWorkflowRunInput): Promise<WorkflowRun | null> {
  let raw: string | null = null;
  try {
    raw = await readManifestBytes(input);
  } catch (err) {
    // ENOENT is normal during the first few seconds after launch: the
    // workflow runtime writes the manifest lazily (sometimes only on the
    // first progress event, sometimes only at completion). Fall through to
    // the transcript-dir fallback below.
    if (!isNotFoundError(err)) throw err;
  }

  if (raw !== null) {
    const parsed = JSON.parse(raw) as unknown;
    return parseWorkflowManifest(parsed, input.manifestPath);
  }

  // Manifest missing — synthesize a partial run from the transcript dir so
  // the row shows live progress before the manifest is written. We prefer
  // `journal.jsonl` (one event per agent transition) when it exists, since
  // it distinguishes started-but-running from finished. Otherwise fall back
  // to counting `agent-<id>.meta.json` files (each agent gets one as soon
  // as it begins).
  if (input.transcriptDir) {
    const journalAgents = await readJournalAgents(input);
    if (journalAgents.size > 0) {
      return synthesizeInFlightRun(input.manifestPath, [...journalAgents.values()]);
    }
    const metaIds = await listStartedAgentIds(input);
    if (metaIds.length > 0) {
      return synthesizeInFlightRun(
        input.manifestPath,
        metaIds.map((id) => ({ agentId: id, state: "running" as const })),
      );
    }
  }
  return null;
}

interface JournalAgent {
  agentId: string;
  state: WorkflowAgentState;
}

async function readJournalAgents(input: ReadWorkflowRunInput): Promise<Map<string, JournalAgent>> {
  const dirPath =
    input.location.kind === "wsl"
      ? manifestUncPath(input.location.uncPath, input.location.linuxPath, input.transcriptDir!)
      : input.transcriptDir!;
  const journalPath = joinPath(dirPath, "journal.jsonl");
  let raw: string;
  try {
    if (input.location.kind === "ssh") {
      const text = await readSessionFileText(input.location, journalPath);
      if (text === undefined) return new Map();
      raw = text;
    } else {
      raw = await readFile(journalPath, "utf8");
    }
  } catch (err) {
    if (isNotFoundError(err)) return new Map();
    throw err;
  }
  // The journal is append-only and one JSON object per line. Later events
  // for the same agentId overwrite earlier ones, so a `result` event
  // replaces the prior `started`. Malformed lines are skipped.
  const byId = new Map<string, JournalAgent>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object") continue;
    const obj = record as Record<string, unknown>;
    const agentId = typeof obj.agentId === "string" ? obj.agentId : null;
    const type = typeof obj.type === "string" ? obj.type : null;
    if (!agentId || !type) continue;
    if (type === "started") {
      if (!byId.has(agentId)) byId.set(agentId, { agentId, state: "running" });
    } else if (type === "result") {
      byId.set(agentId, { agentId, state: "done" });
    } else if (type === "error" || type === "failed") {
      byId.set(agentId, { agentId, state: "failed" });
    }
  }
  return byId;
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/u, "");
  return `${trimmed}${sep}${name}`;
}

async function listStartedAgentIds(input: ReadWorkflowRunInput): Promise<string[]> {
  const dirPath =
    input.location.kind === "wsl"
      ? manifestUncPath(input.location.uncPath, input.location.linuxPath, input.transcriptDir!)
      : input.transcriptDir!;
  let entries: string[];
  try {
    if (input.location.kind === "ssh") {
      const result = await listSessionDir(input.location, dirPath);
      entries = result?.map((entry) => entry.name) ?? [];
    } else {
      entries = await readdir(dirPath);
    }
  } catch (err) {
    if (isNotFoundError(err)) return [];
    throw err;
  }
  const ids: string[] = [];
  for (const name of entries) {
    const match = /^agent-([^.]+)\.meta\.json$/.exec(name);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}

function synthesizeInFlightRun(
  manifestPath: string,
  records: ReadonlyArray<{ agentId: string; state: WorkflowAgentState }>,
): WorkflowRun {
  const agents: WorkflowAgent[] = records.map(({ agentId, state }) => ({
    agentId,
    // We don't have labels yet — they live in the agent JSONL or the
    // (eventual) manifest. Use the id as a placeholder; the renderer
    // strips the `agent:` style prefixes when a phase tab is active.
    label: agentId,
    state,
  }));
  return {
    runId: deriveRunIdFromPath(manifestPath) ?? "",
    status: "running",
    agentCount: agents.length,
    phases: [],
    unphasedAgents: agents,
  };
}

function deriveRunIdFromPath(manifestPath: string): string | undefined {
  const match = /([^\\/]+)\.json$/.exec(manifestPath);
  return match?.[1];
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "ENOENT") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /ENOENT|no such file/i.test(message);
}

async function readManifestBytes(input: ReadWorkflowRunInput): Promise<string> {
  if (input.location.kind === "wsl") {
    // Manifests live under ~/.claude/, which is outside the project root, so
    // the WSL bridge's project-scoped fs/read rejects them. Read via the
    // \\wsl.localhost UNC path instead — derived from the project's uncPath
    // by stripping the linuxPath tail, then re-appending the manifest path
    // with linux slashes flipped to backslashes.
    const uncPath = manifestUncPath(
      input.location.uncPath,
      input.location.linuxPath,
      input.manifestPath,
    );
    return readFile(uncPath, "utf8");
  }
  if (input.location.kind === "ssh") {
    const text = await readSessionFileText(input.location, input.manifestPath);
    if (text === undefined) {
      const error = new Error(
        `ENOENT: no such file, open '${input.manifestPath}'`,
      ) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return text;
  }
  return readFile(input.manifestPath, "utf8");
}

/**
 * Derive a Windows UNC path for an arbitrary path inside a WSL distro by
 * stripping the project's `linuxPath` tail from its `uncPath`, then appending
 * the target `linuxAbsolutePath` with `/` flipped to `\`.
 *
 * Examples (Ubuntu distro):
 *   uncPath  = \\wsl.localhost\Ubuntu\home\me\proj
 *   linux    = /home/me/proj
 *   target   = /home/me/.claude/projects/x/y/workflows/wf_X.json
 *   result   = \\wsl.localhost\Ubuntu\home\me\.claude\projects\x\y\workflows\wf_X.json
 */
export function manifestUncPath(
  uncPath: string,
  linuxPath: string,
  linuxAbsolutePath: string,
): string {
  if (!linuxAbsolutePath.startsWith("/")) {
    throw new Error(`workflows: expected absolute linux path, got '${linuxAbsolutePath}'`);
  }
  const linuxAsWindows = linuxPath.replace(/\//g, "\\");
  if (!uncPath.endsWith(linuxAsWindows)) {
    throw new Error(
      `workflows: uncPath '${uncPath}' does not end with translated linuxPath '${linuxAsWindows}'`,
    );
  }
  const wslRoot = uncPath.slice(0, uncPath.length - linuxAsWindows.length);
  const target = linuxAbsolutePath.replace(/\//g, "\\");
  return `${wslRoot}${target}`;
}

/**
 * Pure parser for the manifest JSON. Exported for unit tests so we can feed
 * fixture objects without going through disk.
 */
export function parseWorkflowManifest(raw: unknown, sourcePath?: string): WorkflowRun {
  if (!raw || typeof raw !== "object") {
    throw new Error(`workflows: manifest is not an object${sourcePath ? ` (${sourcePath})` : ""}`);
  }
  const obj = raw as Record<string, unknown>;

  const declaredPhases = readDeclaredPhases(obj.phases);
  const progressEvents = readProgressEvents(obj.workflowProgress);

  const phaseByTitle = new Map<string, MutablePhase>();
  const phases: MutablePhase[] = declaredPhases.map((phase) => {
    const next: MutablePhase = { title: phase.title, agents: [] };
    if (phase.detail) next.detail = phase.detail;
    phaseByTitle.set(phase.title, next);
    return next;
  });
  const phaseByIndex = new Map<number, MutablePhase>();
  let currentPhase: MutablePhase | undefined;
  const unphasedAgents: WorkflowAgent[] = [];

  for (const event of progressEvents) {
    if (event.kind === "phase") {
      const existing = phaseByTitle.get(event.title);
      let phase: MutablePhase;
      if (existing) {
        phase = existing;
      } else {
        phase = { title: event.title, agents: [] };
        if (event.detail) phase.detail = event.detail;
        phaseByTitle.set(event.title, phase);
        phases.push(phase);
      }
      if (typeof event.index === "number") phaseByIndex.set(event.index, phase);
      currentPhase = phase;
      continue;
    }
    const agent = event.agent;
    const target =
      (typeof agent.phaseIndex === "number" ? phaseByIndex.get(agent.phaseIndex) : undefined) ??
      (agent.phaseTitle ? phaseByTitle.get(agent.phaseTitle) : undefined) ??
      currentPhase;
    if (target) {
      target.agents.push(agent);
    } else {
      unphasedAgents.push(agent);
    }
  }

  const agentCount = readNumber(obj.agentCount) ?? countAgents(phases, unphasedAgents);

  const run: WorkflowRun = {
    runId: readString(obj.runId) ?? sourcePath ?? "",
    status: readRunStatus(obj.status),
    agentCount,
    phases: phases.map(finalizePhase),
    unphasedAgents,
  };

  setStringField(run, "taskId", obj.taskId);
  setStringField(run, "workflowName", obj.workflowName);
  setStringField(run, "summary", obj.summary);
  setStringField(run, "defaultModel", obj.defaultModel);
  setStringField(run, "scriptPath", obj.scriptPath);
  setNumberField(run, "startTime", obj.startTime);
  setNumberField(run, "durationMs", obj.durationMs);
  setNumberField(run, "totalTokens", obj.totalTokens);
  setNumberField(run, "totalToolCalls", obj.totalToolCalls);

  return run;
}

interface MutablePhase {
  title: string;
  detail?: string;
  agents: WorkflowAgent[];
}

interface DeclaredPhase {
  title: string;
  detail?: string;
}

type ProgressEvent =
  | { kind: "phase"; title: string; detail?: string; index?: number }
  | { kind: "agent"; agent: WorkflowAgent };

function readDeclaredPhases(raw: unknown): DeclaredPhase[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclaredPhase[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const title = readString(obj.title);
    if (!title) continue;
    const detail = readString(obj.detail);
    out.push(detail ? { title, detail } : { title });
  }
  return out;
}

function readProgressEvents(raw: unknown): ProgressEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ProgressEvent[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const type = readString(obj.type);
    if (type === "workflow_phase") {
      const title = readString(obj.title);
      if (!title) continue;
      const event: ProgressEvent = { kind: "phase", title };
      const detail = readString(obj.detail);
      if (detail) event.detail = detail;
      const index = readNumber(obj.index);
      if (index !== undefined) event.index = index;
      out.push(event);
      continue;
    }
    if (type === "workflow_agent") {
      const agent = readAgentRecord(obj);
      if (agent) out.push({ kind: "agent", agent });
    }
  }
  return out;
}

function readAgentRecord(obj: Record<string, unknown>): WorkflowAgent | null {
  const agentId = readString(obj.agentId);
  const label = readString(obj.label);
  if (!agentId || !label) return null;
  const out: WorkflowAgent = { agentId, label };
  setStringField(out, "model", obj.model);
  setStringField(out, "phaseTitle", obj.phaseTitle);
  setStringField(out, "lastToolName", obj.lastToolName);
  setStringField(out, "promptPreview", obj.promptPreview);
  setStringField(out, "resultPreview", obj.resultPreview);
  setNumberField(out, "phaseIndex", obj.phaseIndex);
  setNumberField(out, "startedAt", obj.startedAt);
  setNumberField(out, "queuedAt", obj.queuedAt);
  setNumberField(out, "lastProgressAt", obj.lastProgressAt);
  setNumberField(out, "durationMs", obj.durationMs);
  setNumberField(out, "tokens", obj.tokens);
  setNumberField(out, "toolCalls", obj.toolCalls);
  setNumberField(out, "attempt", obj.attempt);
  const state = readAgentState(obj.state);
  if (state) out.state = state;
  return out;
}

function readAgentState(raw: unknown): WorkflowAgentState | undefined {
  if (typeof raw !== "string") return undefined;
  switch (raw) {
    case "queued":
    case "running":
    case "done":
    case "failed":
    case "cancelled":
      return raw;
    default:
      return undefined;
  }
}

function readRunStatus(raw: unknown): WorkflowRunStatus {
  if (typeof raw !== "string") return "unknown";
  switch (raw) {
    case "running":
    case "completed":
    case "failed":
    case "cancelled":
      return raw;
    default:
      return "unknown";
  }
}

function finalizePhase(phase: MutablePhase): WorkflowPhase {
  const out: WorkflowPhase = { title: phase.title, agents: phase.agents };
  if (phase.detail) out.detail = phase.detail;
  return out;
}

function countAgents(phases: MutablePhase[], unphased: WorkflowAgent[]): number {
  let total = unphased.length;
  for (const phase of phases) total += phase.agents.length;
  return total;
}

function readString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function readNumber(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function setStringField<T, K extends keyof T>(target: T, key: K, raw: unknown): void {
  const value = readString(raw);
  if (value !== undefined) (target as Record<string, unknown>)[key as string] = value;
}

function setNumberField<T, K extends keyof T>(target: T, key: K, raw: unknown): void {
  const value = readNumber(raw);
  if (value !== undefined) (target as Record<string, unknown>)[key as string] = value;
}
