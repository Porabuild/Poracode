/**
 * Live Antigravity 3.8 Flash background-launch vs wait/poll tool-call shapes.
 *
 * The harness backgrounds a command with `WaitMsBeforeAsync` plus a
 * running-in-background `toolAction`/`toolSummary`. Wait/sleep polls use the
 * same delay field but an action/summary of "waiting for … task". Parsing
 * stays in this provider module so shared ACP code never sees those fields.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TASK_NUM_RE = /task-\d+/i;
const CONTIGUOUS_TASK_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/task-\d+/i;
const WAIT_FOR_TASK_RE = /\bwait(?:ing)?\s+for\b/i;
const BACKGROUND_WORD_RE = /\bbackground\b/i;

export function readFlashLaunchFields(rawInput: unknown): {
  waitMsBeforeAsync?: number;
  action: string;
  summary: string;
  commandLine: string;
} {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return { action: "", summary: "", commandLine: "" };
  }
  const record = rawInput as Record<string, unknown>;
  const waitMsBeforeAsync =
    typeof record.WaitMsBeforeAsync === "number" && Number.isFinite(record.WaitMsBeforeAsync)
      ? record.WaitMsBeforeAsync
      : undefined;
  return {
    ...(waitMsBeforeAsync !== undefined ? { waitMsBeforeAsync } : {}),
    action: typeof record.toolAction === "string" ? record.toolAction : "",
    summary: typeof record.toolSummary === "string" ? record.toolSummary : "",
    commandLine: typeof record.CommandLine === "string" ? record.CommandLine : "",
  };
}

/** Sleep/poll tool whose only job is to wait on already-backgrounded work. */
export function isWaitingForBackgroundTask(rawInput: unknown): boolean {
  const fields = readFlashLaunchFields(rawInput);
  return WAIT_FOR_TASK_RE.test(`${fields.action} ${fields.summary}`);
}

/**
 * Harness launched this command as background work. Requires both the async
 * delay field and a running-in-background action/summary — not every
 * `WaitMsBeforeAsync` value (wait/sleep polls also set it).
 */
export function isFlashBackgroundLaunch(rawInput: unknown): boolean {
  if (isWaitingForBackgroundTask(rawInput)) return false;
  const fields = readFlashLaunchFields(rawInput);
  if (fields.waitMsBeforeAsync === undefined) return false;
  return BACKGROUND_WORD_RE.test(`${fields.action} ${fields.summary}`);
}

/**
 * Pull `uuid/task-N` (or a bare `task-N`) from a tool-call update: locations
 * log path, rawInput, content, or a contiguous id string.
 */
export function extractFlashBackgroundTaskId(source: unknown): string | undefined {
  const texts = collectStrings(source);
  for (const text of texts) {
    const contiguous = text.match(CONTIGUOUS_TASK_ID_RE);
    if (contiguous) return contiguous[0];
  }
  for (const text of texts) {
    const uuid = text.match(UUID_RE);
    const task = text.match(TASK_NUM_RE);
    if (uuid && task) return `${uuid[0]}/${task[0]}`;
  }
  for (const text of texts) {
    const task = text.match(TASK_NUM_RE);
    if (task) return task[0];
  }
  return undefined;
}

/** True when ACP completed the tool with real command output, not a launch receipt. */
export function hasFlashNativeCommandOutput(rawOutput: unknown): boolean {
  if (typeof rawOutput === "string") {
    return rawOutput.trim().length > 0 && !BACKGROUND_WORD_RE.test(rawOutput);
  }
  if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) return false;
  const record = rawOutput as Record<string, unknown>;
  for (const key of ["combinedOutput", "formatted_output", "output"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return true;
  }
  return false;
}

function collectStrings(source: unknown): string[] {
  if (typeof source === "string") return [source];
  if (!source || typeof source !== "object") return [];
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    for (const entry of Object.values(value as Record<string, unknown>)) visit(entry);
  };
  visit(source);
  return out;
}
