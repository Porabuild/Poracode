import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dbGetProject, dbGetThread, dbGetThreads } from "@/host/db/projectsThreads";
import { setMemoryThreadDeleteHook } from "@/host/db/memoryDeleteHook";
import {
  dbCountMemoryEntries,
  dbCountOpenSuggestions,
  dbCountPendingCandidates,
  dbDeleteMemoryEntry,
  dbDeleteMemorySpool,
  dbGetMemoryDreamRun,
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
  if (!settings.learning || settings.deletePolicy === "never") return;
  const state = dbGetMemoryThreadState(threadId);
  if (state.mode === "incognito" || state.mode === "recall") return;
  const thread = dbGetThread(threadId);
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
    undo: JSON.stringify({ restore: outcome.restore, createdIds: outcome.createdIds }),
    undone: false,
  });
  dbSetMemoryMeta("lastDreamAt", now);
  return { report: outcome.report, runId };
}

function undoDream(runId: string): { ok: boolean } {
  const run = dbGetMemoryDreamRun(runId);
  if (!run || run.undone || !run.undo) return { ok: false };
  const snapshot = JSON.parse(run.undo) as { restore?: MemoryEntry[]; createdIds?: string[] };
  for (const id of snapshot.createdIds ?? []) dbDeleteMemoryEntry(id);
  for (const entry of snapshot.restore ?? []) dbUpsertMemoryEntry(entry);
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
  writeFileSync(file, input.body.endsWith("\n") ? input.body : `${input.body}\n`, "utf8");
  return file;
}

export async function runMemoryCapturePass(
  nowMs = Date.now(),
): Promise<{ captured: number; spooled: number }> {
  const settings = readMemorySettings();
  let captured = 0;
  let spooled = 0;
  if (settings.learning) {
    for (const spool of dbListMemorySpool()) {
      await ingestText({
        text: spool.text,
        threadId: spool.threadId,
        projectId: spool.projectId,
        nowMs,
      });
      dbDeleteMemorySpool(spool.id);
      spooled += 1;
    }
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
    observations: [...deterministic, ...modelObservations],
    threadId: input.threadId,
    projectId: input.projectId,
    now: new Date(input.nowMs).toISOString(),
  });
}

export function memorySearch(query: string, projectId?: string): MemoryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches = dbListMemoryEntries(projectId).filter((entry) =>
    `${entry.summary}\n${entry.body}\n${entry.quote ?? ""}`.toLowerCase().includes(needle),
  );
  const at = new Date().toISOString();
  for (const entry of matches.slice(0, 8)) dbTouchMemoryUsage(entry.id, at);
  return matches.slice(0, 8);
}
