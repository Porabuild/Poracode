import type { ToolCallPayload } from "@/shared/contracts";

export interface WorkflowPhase {
  title: string;
  detail?: string;
}

export interface WorkflowInfo {
  description?: string;
  phases: WorkflowPhase[];
  runId?: string;
  /** Directory holding the per-agent jsonl transcripts. */
  transcriptDir?: string;
  /** Absolute path to `<sessionDir>/workflows/<runId>.json`, derived from transcriptDir + runId. */
  manifestPath?: string;
}

function readScript(payload: ToolCallPayload): string {
  const args = payload.args;
  if (args && typeof args === "object" && "script" in args) {
    const script = (args as Record<string, unknown>).script;
    if (typeof script === "string") return script;
  }
  return "";
}

function readArgString(payload: ToolCallPayload, key: string): string | undefined {
  const args = payload.args;
  if (args && typeof args === "object" && key in args) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readResultText(payload: ToolCallPayload): string {
  return typeof payload.result === "string" ? payload.result : "";
}

/** Extract `key: '<value>'` from a JS object literal (first match wins). */
function matchMetaString(script: string, key: string): string | undefined {
  const re = new RegExp(`${key}\\s*:\\s*(['"\`])((?:\\\\.|[^\\\\])*?)\\1`);
  return re.exec(script)?.[2]?.trim() || undefined;
}

function parsePhases(script: string): WorkflowPhase[] {
  const block = /phases\s*:\s*\[([\s\S]*?)\]/.exec(script);
  if (!block?.[1]) return [];
  const phases: WorkflowPhase[] = [];
  const re =
    /\{\s*title\s*:\s*(['"`])(.*?)\1(?:\s*,\s*detail\s*:\s*(['"`])((?:\\.|[^\\])*?)\3)?\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block[1])) !== null) {
    const title = match[2]?.trim();
    if (!title) continue;
    const detail = match[4]?.trim();
    phases.push(detail ? { title, detail } : { title });
  }
  return phases;
}

/**
 * Derive a human-readable view of a `Workflow` tool call. The provider payload
 * carries the orchestration script in `args.script`, a live description in
 * `progress.description`, and a launch-confirmation blob in `result`. We surface
 * the description and the planned phases, and drop the launch plumbing.
 */
export function parseWorkflowInfo(payload: ToolCallPayload): WorkflowInfo {
  const script = readScript(payload);
  const result = readResultText(payload);

  const description =
    payload.progress?.description?.trim() ||
    /(?:^|\n)Summary:\s*(.+)/.exec(result)?.[1]?.trim() ||
    matchMetaString(script, "description") ||
    readArgString(payload, "description") ||
    undefined;

  const runId = /(?:^|\n)Run ID:\s*(\S+)/.exec(result)?.[1]?.trim();
  const transcriptDir = /(?:^|\n)Transcript dir:\s*(.+)/.exec(result)?.[1]?.trim();
  const manifestPath =
    transcriptDir && runId ? deriveManifestPath(transcriptDir, runId) : undefined;
  const phases = parsePhases(script);

  return {
    phases,
    ...(description ? { description } : {}),
    ...(runId ? { runId } : {}),
    ...(transcriptDir ? { transcriptDir } : {}),
    ...(manifestPath ? { manifestPath } : {}),
  };
}

/**
 * Workflow runtime writes the per-agent JSONLs under
 * `<sessionDir>/subagents/workflows/<runId>/` and the summary manifest under
 * `<sessionDir>/workflows/<runId>.json`. Map the former path (which the tool
 * surfaces in its result) to the latter.
 */
function deriveManifestPath(transcriptDir: string, runId: string): string | undefined {
  const normalized = transcriptDir.replace(/[\\/]+$/u, "");
  const re = /(.*?)([\\/])subagents[\\/]workflows[\\/][^\\/]+$/u;
  const match = re.exec(normalized);
  if (!match) return undefined;
  const sessionDir = match[1];
  const sep = match[2];
  if (!sessionDir || !sep) return undefined;
  return `${sessionDir}${sep}workflows${sep}${runId}.json`;
}
