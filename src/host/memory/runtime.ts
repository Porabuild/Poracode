import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dbGetProject, dbGetThread, dbGetThreads } from "@/host/db/projectsThreads";
import { setMemoryThreadDeleteHook } from "@/host/db/memoryDeleteHook";
import {
  dbCountMemoryEntries,
  dbCountOpenSuggestions,
  dbCountPendingCandidates,
  dbDeleteMemoryEntry,
  dbDeleteMemorySuggestion,
  dbDeleteMemorySpool,
  dbGetMemoryDreamRun,
  dbGetMemoryEntry,
  dbGetMemorySuggestion,
  dbSetMemoryMeta,
  dbGetMemoryThreadState,
  dbInsertMemoryDreamRun,
  dbLatestMemoryDream,
  dbListMemoryEntries,
  dbListMemorySpool,
  dbListMemorySuggestions,
  dbMarkMemoryDreamUndone,
  dbReadMemoryTranscript,
  dbSetCandidateStatus,
  dbSetMemoryThreadState,
  dbSpoolMemoryCapture,
  dbTouchMemoryUsage,
  dbUpsertMemoryEntry,
  dbUpsertMemorySuggestion,
} from "@/host/db/memoryStore";
import { isValidSkillName } from "@/shared/contracts/skill";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  memoryCommandPayloadSchema,
  memorySettleMs,
  type MemoryCommandPayload,
  type MemoryEntry,
  type MemoryStatus,
  type MemoryThreadMode,
} from "@/shared/memory";
import { dreamMemories, rememberObservations, userMemoryEntry } from "./apply";
import {
  MEMORY_EXTRACT_PROMPT,
  observationsFromUserLines,
  parseModelObservations,
  redactSecrets,
  renderMemoryPrompt,
  transcriptFromItems,
} from "./logic";
import { readMemorySettings } from "./settingsReader";

export interface MemoryModelCaller {
  complete(input: {
    projectId: string | null;
    purpose: "capture" | "dream";
    prompt: string;
  }): Promise<string>;
}

let modelCaller: MemoryModelCaller | undefined;

export function setMemoryModelCaller(caller: MemoryModelCaller | undefined): void {
  modelCaller = caller;
}

export function spoolThreadBeforeDelete(threadId: string): void {
  const settings = readMemorySettings();
  if (!settings.learning || settings.deletePolicy !== "spool") return;
  const thread = dbGetThread(threadId);
  if (thread?.parentThreadId) return;
  const state = dbGetMemoryThreadState(threadId);
  if (state.mode === "incognito" || state.mode === "recall") return;
  const text = transcriptFromItems(dbReadMemoryTranscript(threadId, state.cursor));
  if (text.length < 8) return;
  dbSpoolMemoryCapture({
    threadId,
    projectId: thread?.projectId ?? null,
    text,
    createdAt: new Date().toISOString(),
  });
}

export function installMemoryDeleteHook(): void {
  setMemoryThreadDeleteHook(spoolThreadBeforeDelete);
}

export function launchMemoryInstructions(
  threadId: string | undefined,
  projectId: string | undefined,
): string | undefined {
  const settings = readMemorySettings();
  if (!settings.enabled) return undefined;
  if (threadId) {
    const mode = dbGetMemoryThreadState(threadId).mode;
    if (mode === "incognito") return undefined;
  }
  const entries = dbListMemoryEntries(projectId);
  return renderMemoryPrompt(entries, settings, Date.now());
}

export async function handleMemoryCommand(payload: MemoryCommandPayload): Promise<unknown> {
  const command = memoryCommandPayloadSchema.parse(payload);
  const now = new Date().toISOString();
  switch (command.action) {
    case "status":
      return memoryStatus(command.threadId);
    case "list":
      return dbListMemoryEntries(command.projectId);
    case "save": {
      const entry = userMemoryEntry({
        ...(command.entry.id ? { id: command.entry.id } : {}),
        scope: command.entry.scope,
        projectId: command.entry.projectId ?? null,
        category: command.entry.category,
        summary: command.entry.summary,
        body: command.entry.body,
        polarity: command.entry.polarity,
        pinned: command.entry.pinned,
        quote: command.entry.quote ?? null,
        now,
      });
      if (entry.summary.length === 0) throw new Error("Memory text is empty.");
      dbUpsertMemoryEntry(entry);
      return entry;
    }
    case "delete":
      dbDeleteMemoryEntry(command.id);
      return { ok: true };
    case "thread-mode":
      dbSetMemoryThreadState({ threadId: command.threadId, mode: command.mode, updatedAt: now });
      return { mode: command.mode };
    case "dream":
      return runDream(now);
    case "undo":
      return undoDream(command.runId);
    case "suggestions":
      return dbListMemorySuggestions(command.projectId);
    case "suggestion":
      return decideSuggestion(command, now);
    default:
      return { ok: false };
  }
}

function memoryStatus(threadId: string | undefined): MemoryStatus {
  const settings = readMemorySettings();
  const dream = dbLatestMemoryDream();
  const mode: MemoryThreadMode | null = threadId ? dbGetMemoryThreadState(threadId).mode : null;
  return {
    enabled: settings.enabled,
    learning: settings.learning,
    captureTiming: settings.captureTiming,
    pendingCandidates: dbCountPendingCandidates(),
    entryCount: dbCountMemoryEntries(),
    suggestionCount: dbCountOpenSuggestions(),
    lastDreamAt: dream.finishedAt,
    lastDreamSummary: dream.report,
    threadMode: mode,
  };
}

async function runDream(now: string): Promise<{ report: string; runId: string }> {
  const settings = readMemorySettings();
  const outcome = dreamMemories(settings, now);
  const runId = randomUUID();
  dbInsertMemoryDreamRun({
    id: runId,
    startedAt: now,
    finishedAt: now,
    report: outcome.report,
    undo: JSON.stringify({
      restore: outcome.restore,
      createdIds: outcome.createdIds,
      suggestionIds: outcome.suggestionIds,
      candidateIds: outcome.candidateIds,
    }),
    undone: false,
  });
  dbSetMemoryMeta("lastDreamAt", now);
  return { report: outcome.report, runId };
}

function undoDream(runId: string): { ok: boolean } {
  const run = dbGetMemoryDreamRun(runId);
  if (!run || run.undone || !run.undo) return { ok: false };
  const snapshot = JSON.parse(run.undo) as {
    restore?: MemoryEntry[];
    createdIds?: string[];
    suggestionIds?: string[];
    candidateIds?: string[];
  };
  const changedAfterDream = (updatedAt: string | undefined, locked: boolean | undefined) =>
    locked === true && updatedAt !== undefined && updatedAt > run.startedAt;
  for (const id of snapshot.createdIds ?? []) {
    const current = dbGetMemoryEntry(id);
    if (changedAfterDream(current?.updatedAt, current?.lockedByUser)) continue;
    dbDeleteMemoryEntry(id);
  }
  for (const entry of snapshot.restore ?? []) {
    const current = dbGetMemoryEntry(entry.id);
    if (changedAfterDream(current?.updatedAt, current?.lockedByUser)) continue;
    dbUpsertMemoryEntry(entry);
  }
  for (const id of snapshot.suggestionIds ?? []) dbDeleteMemorySuggestion(id);
  for (const id of snapshot.candidateIds ?? []) dbSetCandidateStatus(id, "pending");
  dbMarkMemoryDreamUndone(runId);
  return { ok: true };
}

function decideSuggestion(
  command: Extract<MemoryCommandPayload, { action: "suggestion" }>,
  now: string,
): { ok: boolean; path?: string } {
  const suggestion = dbGetMemorySuggestion(command.id);
  if (!suggestion) return { ok: false };
  if (command.decision === "dismiss") {
    dbUpsertMemorySuggestion({ ...suggestion, status: "dismissed", updatedAt: now });
    return { ok: true };
  }
  const name = command.name ?? suggestion.name;
  if (!isValidSkillName(name))
    throw new Error("Skill name must use lowercase letters, numbers, and hyphens.");
  const scope = command.scope ?? suggestion.scope;
  const availability = command.availability ?? suggestion.availability;
  const projectId = command.projectId === undefined ? suggestion.projectId : command.projectId;
  const body = command.body ?? suggestion.body;
  const description = command.description ?? suggestion.description;
  const path = writeSkillFile({ name, body, scope, availability, projectId });
  dbUpsertMemorySuggestion({
    ...suggestion,
    name,
    description,
    body,
    scope,
    availability,
    projectId,
    status: "approved",
    updatedAt: now,
  });
  return { ok: true, path };
}

function writeSkillFile(input: {
  name: string;
  body: string;
  scope: "global" | "project";
  availability: "shared" | "poracode";
  projectId: string | null;
}): string {
  const folder = input.availability === "shared" ? ".agents" : ".poracode";
  let root = join(homedir(), folder, "skills", input.name);
  if (input.scope === "project") {
    if (!input.projectId || isHomeProjectId(input.projectId)) {
      throw new Error("Pick a project for a project skill.");
    }
    const project = dbGetProject(input.projectId);
    if (!project) throw new Error("Project not found.");
    const base = project.location.kind === "wsl" ? project.location.uncPath : project.location.path;
    root = join(base, folder, "skills", input.name);
  }
  mkdirSync(root, { recursive: true });
  const file = join(root, "SKILL.md");
  if (existsSync(file)) throw new Error("A skill with this name already exists.");
  const body = alignSkillFrontmatter(input.body, input.name);
  writeFileSync(file, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return file;
}

function alignSkillFrontmatter(body: string, name: string): string {
  return body.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_match, open, matter, close) => {
    const next = /^name:.*$/m.test(matter)
      ? matter.replace(/^name:.*$/m, `name: ${name}`)
      : `name: ${name}\n${matter}`;
    return `${open}${next}${close}`;
  });
}

let captureFlight: Promise<{ captured: number; spooled: number }> | null = null;

export async function runMemoryCapturePass(
  nowMs = Date.now(),
): Promise<{ captured: number; spooled: number }> {
  if (captureFlight) return captureFlight;
  captureFlight = captureOnce(nowMs).finally(() => {
    captureFlight = null;
  });
  return captureFlight;
}

async function captureOnce(nowMs: number): Promise<{ captured: number; spooled: number }> {
  const settings = readMemorySettings();
  let captured = 0;
  let spooled = 0;
  for (const spool of dbListMemorySpool()) {
    if (settings.learning && settings.deletePolicy === "spool") {
      await ingestText({
        text: spool.text,
        threadId: spool.threadId,
        projectId: spool.projectId,
        nowMs,
      });
      spooled += 1;
    }
    dbDeleteMemorySpool(spool.id);
  }
  const settle = memorySettleMs(settings);
  for (const thread of dbGetThreads()) {
    if (!settings.learning) break;
    if (thread.parentThreadId) continue;
    const state = dbGetMemoryThreadState(thread.id);
    if (state.mode !== "learn") continue;
    if (state.nextAttemptAt && Date.parse(state.nextAttemptAt) > nowMs) continue;
    const closed =
      thread.done ||
      thread.archived ||
      thread.status === "idle" ||
      thread.status === "finished" ||
      thread.status === "inactive";
    if (!closed) continue;
    if (settle !== null && !thread.done && !thread.archived) {
      const ended = thread.lastTurnEndedAt ? Date.parse(thread.lastTurnEndedAt) : Number.NaN;
      if (!Number.isFinite(ended) || nowMs - ended < settle) continue;
    }
    if (settle === null && !thread.done && !thread.archived) continue;
    const items = dbReadMemoryTranscript(thread.id, state.cursor);
    if (items.length === 0) continue;
    const text = transcriptFromItems(items);
    const cursor = items[items.length - 1]!.position;
    if (text.length < 8) {
      dbSetMemoryThreadState({
        threadId: thread.id,
        cursor,
        updatedAt: new Date(nowMs).toISOString(),
      });
      continue;
    }
    try {
      await ingestText({ text, threadId: thread.id, projectId: thread.projectId, nowMs });
      dbSetMemoryThreadState({
        threadId: thread.id,
        cursor,
        nextAttemptAt: null,
        updatedAt: new Date(nowMs).toISOString(),
      });
      captured += 1;
    } catch (error) {
      console.error("[memory] capture failed:", error);
      dbSetMemoryThreadState({
        threadId: thread.id,
        nextAttemptAt: new Date(nowMs + 10 * 60_000).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      });
    }
  }
  return { captured, spooled };
}

async function ingestText(input: {
  text: string;
  threadId: string | null;
  projectId: string | null;
  nowMs: number;
}): Promise<void> {
  const deterministic = observationsFromUserLines(input.text);
  let modelObservations: ReturnType<typeof observationsFromUserLines> = [];
  if (modelCaller && input.text.length > 400) {
    try {
      const raw = await modelCaller.complete({
        projectId: input.projectId,
        purpose: "capture",
        prompt: `${MEMORY_EXTRACT_PROMPT}\n\n${input.text}`,
      });
      modelObservations = parseModelObservations(raw);
    } catch (error) {
      console.error("[memory] model capture skipped:", error);
    }
  }
  rememberObservations({
    observations: [...deterministic, ...modelObservations].map((observation) => ({
      ...observation,
      statement: redactSecrets(observation.statement),
      quote: observation.quote ? redactSecrets(observation.quote) : null,
    })),
    threadId: input.threadId,
    projectId: input.projectId,
    now: new Date(input.nowMs).toISOString(),
  });
}

export function memorySearch(query: string, projectId?: string): MemoryEntry[] {
  if (!readMemorySettings().enabled) return [];
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const rows = projectId
    ? dbListMemoryEntries(projectId)
    : dbListMemoryEntries().filter((entry) => entry.scope === "global");
  const matches = rows.filter((entry) =>
    `${entry.summary}\n${entry.body}\n${entry.quote ?? ""}`.toLowerCase().includes(needle),
  );
  const at = new Date().toISOString();
  for (const entry of matches.slice(0, 8)) dbTouchMemoryUsage(entry.id, at);
  return matches.slice(0, 8);
}
