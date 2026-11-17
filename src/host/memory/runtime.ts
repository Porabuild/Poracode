import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { dbGetProject, dbGetThread } from "@/host/db/projectsThreads";
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
  dbListPendingCandidates,
  dbListThreadsWithPendingMemoryItems,
  dbMarkMemoryDreamUndone,
  dbMemoryMeta,
  dbReadMemoryTranscript,
  dbSetCandidateStatus,
  dbSetMemoryThreadState,
  dbSpoolMemoryCapture,
  dbTouchMemoryEntries,
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
import {
  dreamMemories,
  listScopedMemoryEntriesForProject,
  rememberObservations,
  userMemoryEntry,
} from "./apply";
import {
  MEMORY_DREAM_PROMPT,
  MEMORY_EXTRACT_PROMPT,
  observationsFromUserLines,
  parseDreamConsolidation,
  parseModelObservations,
  redactSecrets,
  renderMemoryPromptWithIds,
  transcriptFromItems,
} from "./logic";
import { readMemorySettings } from "./settingsReader";
import { exportMemorySyncState, mergeMemorySyncState } from "./sync";

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

export function getMemoryModelCaller(): MemoryModelCaller | undefined {
  return modelCaller;
}

export function spoolThreadBeforeDelete(threadId: string): void {
  const settings = readMemorySettings();
  if (!settings.enabled || !settings.learning || settings.deletePolicy !== "spool") return;
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

export function prepareLaunchMemory(
  threadId: string | undefined,
  projectId: string | undefined,
): { instructions: string; entryIds: string[] } | undefined {
  const settings = readMemorySettings();
  if (!settings.enabled) return undefined;
  if (threadId) {
    const mode = dbGetMemoryThreadState(threadId).mode;
    if (mode === "incognito") return undefined;
  }
  const entries = listScopedMemoryEntriesForProject(projectId);
  const rendered = renderMemoryPromptWithIds(entries, settings, Date.now());
  return rendered ? { instructions: rendered.prompt, entryIds: rendered.entryIds } : undefined;
}

export function recordMemoryUsage(entryIds: readonly string[]): void {
  dbTouchMemoryEntries(entryIds, new Date().toISOString());
}

export async function handleMemoryCommand(payload: MemoryCommandPayload): Promise<unknown> {
  const command = memoryCommandPayloadSchema.parse(payload);
  const now = new Date().toISOString();
  switch (command.action) {
    case "status":
      return memoryStatus(command.threadId, command.projectId);
    case "list":
      return command.projectId
        ? listScopedMemoryEntriesForProject(command.projectId)
        : dbListMemoryEntries();
    case "save": {
      const entry = userMemoryEntry({
        ...(command.entry.id ? { id: command.entry.id } : {}),
        scope: command.entry.scope,
        projectId: command.entry.projectId ?? null,
        repoKey: command.entry.repoKey ?? null,
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
      dbDeleteMemoryEntry(command.id, now, true);
      return { ok: true };
    case "thread-mode":
      dbSetMemoryThreadState({ threadId: command.threadId, mode: command.mode, updatedAt: now });
      return { mode: command.mode };
    case "dream":
      return runDream(now, true);
    case "undo":
      return undoDream(command.runId);
    case "suggestions":
      return dbListMemorySuggestions(command.projectId);
    case "suggestion":
      return decideSuggestion(command, now);
    case "sync-export": {
      const settings = readMemorySettings();
      if (!settings.enabled || !settings.syncEnabled) return { entries: [], tombstones: [] };
      return exportMemorySyncState(command.projectRepoKeys);
    }
    case "sync-merge": {
      const settings = readMemorySettings();
      if (!settings.enabled || !settings.syncEnabled) {
        return { synced: false, changed: false, state: { entries: [], tombstones: [] } };
      }
      const merged = mergeMemorySyncState(command.state, command.projectRepoKeys);
      return { synced: true, ...merged };
    }
  }
}

function memoryStatus(threadId: string | undefined, projectId: string | undefined): MemoryStatus {
  const settings = readMemorySettings();
  const dream = dbLatestMemoryDream();
  const mode: MemoryThreadMode | null = threadId ? dbGetMemoryThreadState(threadId).mode : null;
  const entryCount = projectId
    ? listScopedMemoryEntriesForProject(projectId).length
    : dbCountMemoryEntries();
  return {
    enabled: settings.enabled,
    learning: settings.learning,
    syncEnabled: settings.syncEnabled,
    captureTiming: settings.captureTiming,
    pendingCandidates: dbCountPendingCandidates(),
    entryCount,
    suggestionCount: dbCountOpenSuggestions(),
    lastDreamAt: dream.finishedAt,
    lastDreamSummary: dream.report,
    lastDreamRunId: dream.id,
    lastDreamCounts: dream.counts,
    threadMode: mode,
  };
}

async function runDream(now: string, manual = false): Promise<{ report: string; runId: string }> {
  const settings = readMemorySettings();
  let consolidated: ReturnType<typeof parseModelObservations> = [];
  let retireIds: string[] = [];
  const pending = dbListPendingCandidates();
  const existingEntries = dbListMemoryEntries();
  if (modelCaller && (pending.length > 0 || (manual && existingEntries.length >= 2))) {
    try {
      const existing = existingEntries.slice(0, 30).map((entry) => ({
        id: entry.id,
        scope: entry.scope,
        projectId: entry.projectId,
        repoKey: entry.repoKey ?? null,
        category: entry.category,
        summary: redactSecrets(entry.summary).slice(0, 220),
        polarity: entry.polarity,
        lockedByUser: entry.lockedByUser,
        pinned: entry.pinned,
      }));
      const candidates = pending.slice(0, 60).map((item) => ({
        scope: item.scope,
        projectId: item.projectId,
        category: item.category,
        statement: redactSecrets(item.statement).slice(0, 220),
        polarity: item.polarity,
        confidence: item.confidence,
        explicit: item.explicit,
      }));
      const candidateProjectId =
        pending
          .map((item) => item.projectId)
          .find((id): id is string => Boolean(id && dbGetProject(id))) ??
        existingEntries
          .map((entry) => entry.projectId)
          .find((id): id is string => Boolean(id && dbGetProject(id))) ??
        null;
      const raw = await modelCaller.complete({
        projectId: candidateProjectId,
        purpose: "dream",
        prompt: `${MEMORY_DREAM_PROMPT}\n\nExisting:\n${JSON.stringify(existing)}\n\nPending:\n${JSON.stringify(candidates)}`,
      });
      const parsed = parseDreamConsolidation(raw);
      consolidated = parsed.observations;
      retireIds = parsed.retireIds.filter((id) => existing.some((entry) => entry.id === id));
    } catch (error) {
      console.error("[memory] dream model skipped:", error);
    }
  }
  const outcome = dreamMemories(settings, now, consolidated, retireIds);
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
  const now = new Date().toISOString();
  const changedAfterDream = (updatedAt: string | undefined, locked: boolean | undefined) =>
    locked === true && updatedAt !== undefined && updatedAt > run.startedAt;
  for (const id of snapshot.createdIds ?? []) {
    const current = dbGetMemoryEntry(id);
    if (changedAfterDream(current?.updatedAt, current?.lockedByUser)) continue;
    dbDeleteMemoryEntry(id, now, true);
  }
  for (const entry of snapshot.restore ?? []) {
    const current = dbGetMemoryEntry(entry.id);
    if (changedAfterDream(current?.updatedAt, current?.lockedByUser)) continue;
    dbUpsertMemoryEntry({ ...entry, updatedAt: now });
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
  if (!settings.enabled || !settings.learning) return { captured: 0, spooled: 0 };
  let captured = 0;
  let spooled = 0;
  for (const spool of dbListMemorySpool()) {
    if (settings.deletePolicy === "spool") {
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
  const cutoffRaw = dbMemoryMeta("captureCutoffAt");
  const cutoffMs = cutoffRaw ? Date.parse(cutoffRaw) : Number.NaN;
  const maxBatch = modelCaller ? 5 : 25;
  for (const threadId of dbListThreadsWithPendingMemoryItems()) {
    if (captured >= maxBatch) break;
    const thread = dbGetThread(threadId);
    if (!thread || thread.parentThreadId) continue;
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
    if (Number.isFinite(cutoffMs)) {
      const activityAt = Date.parse(thread.lastTurnEndedAt ?? thread.updatedAt);
      if (Number.isFinite(activityAt) && activityAt < cutoffMs) {
        const items = dbReadMemoryTranscript(thread.id, state.cursor);
        if (items.length > 0) {
          dbSetMemoryThreadState({
            threadId: thread.id,
            cursor: items[items.length - 1]!.position,
            updatedAt: new Date(nowMs).toISOString(),
          });
        }
        continue;
      }
    }
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
  const userText = input.text
    .split(/\n+/)
    .map((line) => /^user:\s*(.*)$/i.exec(line.trim())?.[1]?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const singleCrispRule =
    deterministic.length === 1 && userText.length <= 140 && !/[.!?]\s+\S/.test(userText);
  let observations = deterministic;
  if (modelCaller !== undefined && userText.length >= 16 && !singleCrispRule) {
    try {
      const raw = await modelCaller.complete({
        projectId: input.projectId,
        purpose: "capture",
        prompt: `${MEMORY_EXTRACT_PROMPT}\n\n${input.text}`,
      });
      observations = parseModelObservations(raw);
    } catch (error) {
      console.error("[memory] model capture skipped:", error);
    }
  }
  rememberObservations({
    observations: observations.map((observation) => ({
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
  const rows = listScopedMemoryEntriesForProject(projectId);
  const matches = rows.filter((entry) =>
    `${entry.summary}\n${entry.body}\n${entry.quote ?? ""}`.toLowerCase().includes(needle),
  );
  const top = matches.slice(0, 8);
  dbTouchMemoryEntries(
    top.map((entry) => entry.id),
    new Date().toISOString(),
  );
  return top;
}
