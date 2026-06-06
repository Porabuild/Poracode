import { readdir, readFile } from "node:fs/promises";
import type {
  ProjectLocation,
  WorkflowAgent,
  WorkflowAgentChatEntry,
  WorkflowAgentState,
  WorkflowPhase,
  WorkflowRun,
  WorkflowRunStatus,
} from "@/shared/contracts";

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
  includeAgentChats?: boolean;
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
    const run = parseWorkflowManifest(parsed, input.manifestPath);
    return input.includeAgentChats && input.transcriptDir
      ? mergeTranscriptAgents(run, await readTranscriptAgents(input))
      : run;
  }

  // Manifest missing — synthesize a partial run from the transcript dir so
  // the row shows live progress before the manifest is written. We prefer
  // `journal.jsonl` (one event per agent transition) when it exists, since
  // it distinguishes started-but-running from finished. Otherwise fall back
  // to counting `agent-<id>.meta.json` files (each agent gets one as soon
  // as it begins).
  if (input.transcriptDir) {
    const journalAgents = await readJournalAgents(input);
    if (input.includeAgentChats) {
      const transcriptAgents = await readTranscriptAgents(input);
      if (journalAgents.size > 0 || transcriptAgents.size > 0) {
        return synthesizeInFlightRun(input.manifestPath, [
          ...mergeJournalAndTranscriptAgents(journalAgents, transcriptAgents).values(),
        ]);
      }
    }
    if (journalAgents.size > 0) {
      return synthesizeInFlightRun(input.manifestPath, [
        ...journalAgentsToWorkflowAgents(journalAgents).values(),
      ]);
    }
    const metaIds = await listStartedAgentIds(input);
    if (metaIds.length > 0) {
      return synthesizeInFlightRun(
        input.manifestPath,
        metaIds.map((id) => ({ agentId: id, label: id, state: "running" as const })),
      );
    }
  }
  return null;
}

interface JournalAgent {
  agentId: string;
  state: WorkflowAgentState;
  resultPreview?: string;
}

async function readJournalAgents(input: ReadWorkflowRunInput): Promise<Map<string, JournalAgent>> {
  const dirPath = transcriptDirPath(input);
  const journalPath = joinPath(dirPath, "journal.jsonl");
  let raw: string;
  try {
    raw = await readFile(journalPath, "utf8");
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
      const resultPreview = stringifyUnknown(obj.result);
      byId.set(
        agentId,
        resultPreview ? { agentId, state: "done", resultPreview } : { agentId, state: "done" },
      );
    } else if (type === "error" || type === "failed") {
      byId.set(agentId, { agentId, state: "failed" });
    }
  }
  return byId;
}

async function readTranscriptAgents(
  input: ReadWorkflowRunInput,
): Promise<Map<string, WorkflowAgent>> {
  const dirPath = transcriptDirPath(input);
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch (err) {
    if (isNotFoundError(err)) return new Map();
    throw err;
  }

  const agents = new Map<string, WorkflowAgent>();
  for (const name of entries) {
    const match = /^agent-([^.]+)\.jsonl$/.exec(name);
    const agentId = match?.[1];
    if (!agentId) continue;
    let raw: string;
    try {
      raw = await readFile(joinPath(dirPath, name), "utf8");
    } catch (err) {
      if (isNotFoundError(err)) continue;
      throw err;
    }
    agents.set(agentId, parseAgentJsonl(agentId, raw));
  }
  return agents;
}

function journalAgentsToWorkflowAgents(
  journalAgents: ReadonlyMap<string, JournalAgent>,
): Map<string, WorkflowAgent> {
  const out = new Map<string, WorkflowAgent>();
  for (const [agentId, agent] of journalAgents) {
    const workflowAgent: WorkflowAgent = {
      agentId,
      label: agentId,
      state: agent.state,
    };
    if (agent.resultPreview) workflowAgent.resultPreview = agent.resultPreview;
    out.set(agentId, workflowAgent);
  }
  return out;
}

function mergeJournalAndTranscriptAgents(
  journalAgents: ReadonlyMap<string, JournalAgent>,
  transcriptAgents: ReadonlyMap<string, WorkflowAgent>,
): Map<string, WorkflowAgent> {
  const out = journalAgentsToWorkflowAgents(journalAgents);
  for (const [agentId, transcriptAgent] of transcriptAgents) {
    const journalAgent = out.get(agentId);
    out.set(
      agentId,
      journalAgent ? mergeAgentRecords(journalAgent, transcriptAgent) : transcriptAgent,
    );
  }
  return out;
}

function mergeTranscriptAgents(
  run: WorkflowRun,
  transcriptAgents: ReadonlyMap<string, WorkflowAgent>,
): WorkflowRun {
  if (transcriptAgents.size === 0) return run;
  return {
    ...run,
    phases: run.phases.map((phase) => ({
      ...phase,
      agents: phase.agents.map((agent) => {
        const transcriptAgent = transcriptAgents.get(agent.agentId);
        return transcriptAgent ? mergeAgentRecords(agent, transcriptAgent) : agent;
      }),
    })),
    unphasedAgents: run.unphasedAgents.map((agent) => {
      const transcriptAgent = transcriptAgents.get(agent.agentId);
      return transcriptAgent ? mergeAgentRecords(agent, transcriptAgent) : agent;
    }),
  };
}

function mergeAgentRecords(primary: WorkflowAgent, fallback: WorkflowAgent): WorkflowAgent {
  const out: WorkflowAgent = { ...fallback, ...primary };
  if (primary.label === primary.agentId && fallback.label !== fallback.agentId) {
    out.label = fallback.label;
  }
  if (fallback.chat) out.chat = fallback.chat;
  return out;
}

function parseAgentJsonl(agentId: string, raw: string): WorkflowAgent {
  const chat: WorkflowAgentChatEntry[] = [];
  let model: string | undefined;
  let promptText: string | undefined;
  let resultText: string | undefined;
  let lastToolName: string | undefined;
  let startedAt: number | undefined;
  let lastProgressAt: number | undefined;
  let tokens = 0;
  let toolCalls = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const obj = readObject(record);
    if (!obj) continue;
    const timestamp = readString(obj.timestamp);
    const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
    if (Number.isFinite(timestampMs)) {
      startedAt ??= timestampMs;
      lastProgressAt = timestampMs;
    }

    const message = readObject(obj.message);
    const type = readString(obj.type);
    if (!message || (type !== "user" && type !== "assistant")) continue;

    if (type === "assistant") {
      const messageModel = readString(message.model);
      if (messageModel) model = messageModel;
      tokens += readUsageTokens(message.usage);
    }

    for (const parsed of parseChatEntries(message.content, type, timestamp)) {
      chat.push(parsed.entry);
      if (parsed.kind === "text" && parsed.entry.text) {
        if (type === "user") {
          promptText ??= parsed.entry.text;
        } else {
          resultText = parsed.entry.text;
        }
      }
      if (parsed.kind === "tool_use") {
        toolCalls += 1;
        if (parsed.entry.title) lastToolName = parsed.entry.title;
        if (parsed.entry.title === "StructuredOutput" && parsed.entry.text) {
          resultText = parsed.entry.text;
        }
      }
    }
  }

  const inferred = promptText ? inferAgentMetadata(promptText) : null;
  const agent: WorkflowAgent = {
    agentId,
    label: inferred?.label ?? agentId,
    state: "running",
  };
  if (inferred?.phaseTitle) agent.phaseTitle = inferred.phaseTitle;
  if (model) agent.model = model;
  if (startedAt !== undefined) agent.startedAt = startedAt;
  if (lastProgressAt !== undefined) agent.lastProgressAt = lastProgressAt;
  if (tokens > 0) agent.tokens = tokens;
  if (toolCalls > 0) agent.toolCalls = toolCalls;
  if (lastToolName) agent.lastToolName = lastToolName;
  if (promptText) agent.promptPreview = previewText(promptText);
  if (resultText) agent.resultPreview = previewText(resultText);
  if (chat.length > 0) agent.chat = chat;
  return agent;
}

function inferAgentMetadata(
  promptText: string,
): Pick<WorkflowAgent, "label" | "phaseTitle"> | null {
  const quotedReviewer = /^You are the "([^"]+)" reviewer\b/i.exec(promptText);
  if (quotedReviewer?.[1]) {
    return { label: `review:${slugLabel(quotedReviewer[1])}`, phaseTitle: "Review" };
  }

  if (/^Adversarially verify\b/i.test(promptText)) {
    const finding = /Finding:\s*"([^"]+)"/i.exec(promptText)?.[1];
    const labelPart = finding ? slugLabel(finding) : "finding";
    return { label: `verify:${labelPart}`, phaseTitle: "Verify" };
  }

  if (/A reviewer claims this issue\b/i.test(promptText)) {
    const title = /^Title:\s*(.+)$/im.exec(promptText)?.[1]?.trim();
    const labelPart = title ? slugLabel(title) : "finding";
    return { label: `verify:${labelPart}`, phaseTitle: "Verify" };
  }

  if (/^You are reviewing\b/i.test(promptText)) {
    const reviewKey = inferReviewKey(promptText);
    return {
      label: reviewKey ? `review:${reviewKey}` : "review",
      phaseTitle: "Review",
    };
  }

  return null;
}

function inferReviewKey(promptText: string): string | null {
  if (/Focus ONLY on correctness bugs\b/i.test(promptText)) return "correctness";
  if (/Focus on React\/state issues\b/i.test(promptText)) return "react-state";
  if (/Focus on data-contract and parsing robustness\b/i.test(promptText)) return "parsing-ipc";
  if (/Assess whether the new\/changed tests actually cover\b/i.test(promptText)) return "tests";

  const focus = /^Focus:\s*(.+)$/im.exec(promptText)?.[1];
  if (!focus) return null;
  if (/logic bugs|incorrect parsing|off-by-one|async races/i.test(focus)) return "correctness";
  if (/shared contract|IPC schema|workflowTranscript|schemas\.ts/i.test(focus)) {
    return "contracts";
  }
  if (/renderer state|workflowRunStore|useWorkflowRun|stale closures/i.test(focus)) {
    return "react-state";
  }
  if (/test coverage|new\/changed tests|untested/i.test(focus)) return "tests";
  return slugLabel(focus);
}

interface ParsedChatEntry {
  kind: "text" | "tool_use" | "tool_result";
  entry: WorkflowAgentChatEntry;
}

function parseChatEntries(
  raw: unknown,
  role: "user" | "assistant",
  timestamp: string | undefined,
): ParsedChatEntry[] {
  if (typeof raw === "string") {
    const entry: WorkflowAgentChatEntry = { role, text: raw };
    if (timestamp) entry.timestamp = timestamp;
    return [{ kind: "text", entry }];
  }
  if (!Array.isArray(raw)) return [];

  const entries: ParsedChatEntry[] = [];
  for (const part of raw) {
    const obj = readObject(part);
    if (!obj) continue;
    const type = readString(obj.type);
    if (type === "text") {
      const text = readString(obj.text);
      if (!text) continue;
      const entry: WorkflowAgentChatEntry = { role, text };
      if (timestamp) entry.timestamp = timestamp;
      entries.push({ kind: "text", entry });
      continue;
    }
    if (type === "tool_use") {
      const entry: WorkflowAgentChatEntry = { role: "tool" };
      const name = readString(obj.name);
      const text = stringifyUnknown(obj.input);
      if (name) entry.title = name;
      if (text) entry.text = text;
      if (timestamp) entry.timestamp = timestamp;
      entries.push({ kind: "tool_use", entry });
      continue;
    }
    if (type === "tool_result") {
      const entry: WorkflowAgentChatEntry = { role: "tool", title: "Tool result" };
      const text = stringifyUnknown(obj.content);
      if (text) entry.text = text;
      if (timestamp) entry.timestamp = timestamp;
      entries.push({ kind: "tool_result", entry });
    }
  }
  return entries;
}

function transcriptDirPath(input: ReadWorkflowRunInput): string {
  if (!input.transcriptDir) throw new Error("workflows: transcriptDir is required");
  return input.location.kind === "wsl"
    ? manifestUncPath(input.location.uncPath, input.location.linuxPath, input.transcriptDir)
    : input.transcriptDir;
}

function readObject(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function readUsageTokens(raw: unknown): number {
  const obj = readObject(raw);
  if (!obj) return 0;
  return (
    (readNumber(obj.input_tokens) ?? 0) +
    (readNumber(obj.output_tokens) ?? 0) +
    (readNumber(obj.cache_creation_input_tokens) ?? 0) +
    (readNumber(obj.cache_read_input_tokens) ?? 0)
  );
}

function previewText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 1000 ? `${trimmed.slice(0, 1000)}...` : trimmed;
}

function stringifyUnknown(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[\\/]+$/u, "");
  return `${trimmed}${sep}${name}`;
}

function slugLabel(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function listStartedAgentIds(input: ReadWorkflowRunInput): Promise<string[]> {
  const dirPath = transcriptDirPath(input);
  let entries: string[];
  try {
    entries = await readdir(dirPath);
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
  records: ReadonlyArray<WorkflowAgent>,
): WorkflowRun {
  const phases: WorkflowPhase[] = [];
  const phaseByTitle = new Map<string, WorkflowPhase>();
  const unphasedAgents: WorkflowAgent[] = [];
  for (const agent of records) {
    if (!agent.phaseTitle) {
      unphasedAgents.push(agent);
      continue;
    }
    let phase = phaseByTitle.get(agent.phaseTitle);
    if (!phase) {
      phase = { title: agent.phaseTitle, agents: [] };
      phaseByTitle.set(agent.phaseTitle, phase);
      phases.push(phase);
    }
    phase.agents.push(agent);
  }
  return {
    runId: deriveRunIdFromPath(manifestPath) ?? "",
    status: "running",
    agentCount: records.length,
    phases,
    unphasedAgents,
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
  applyRunTerminalState(run);

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

function applyRunTerminalState(run: WorkflowRun): void {
  if (run.status !== "cancelled") return;
  for (const phase of run.phases) {
    for (const agent of phase.agents) {
      if (!isAgentTerminal(agent.state)) agent.state = "cancelled";
    }
  }
  for (const agent of run.unphasedAgents) {
    if (!isAgentTerminal(agent.state)) agent.state = "cancelled";
  }
}

function isAgentTerminal(state: WorkflowAgentState | undefined): boolean {
  return state === "done" || state === "failed" || state === "cancelled";
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
    case "progress":
      return "running";
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
    case "killed":
      return "cancelled";
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
