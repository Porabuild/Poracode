import type { ToolCallPayload } from "@/shared/contracts";

export interface WorkflowPhase {
  title: string;
  detail?: string;
}

export interface WorkflowPlannedAgent {
  label: string;
  phaseTitle?: string;
  model?: string;
}

export interface WorkflowInfo {
  description?: string;
  phases: WorkflowPhase[];
  plannedAgents: WorkflowPlannedAgent[];
  /**
   * Agents observed live via the run's progress descriptions ("Phase: label"),
   * in first-seen (start) order. Used to name journal-synthesized agents while
   * the run is in flight; the completed manifest supersedes them.
   */
  liveAgents: WorkflowPlannedAgent[];
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

function parsePlannedAgents(script: string): WorkflowPlannedAgent[] {
  const arrays = parseConstObjectArrays(script);
  const agents: WorkflowPlannedAgent[] = [];
  const re =
    /pipeline\s*\(\s*(\w+)\s*,\s*(\w+)\s*=>\s*agent\([\s\S]*?\{\s*([\s\S]*?label\s*:[\s\S]*?)\}\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(script)) !== null) {
    const arrayName = match[1];
    const alias = match[2];
    const options = match[3];
    if (!arrayName || !alias || !options) continue;
    const items = arrays.get(arrayName);
    if (!items) continue;
    const labelExpr = matchOptionExpression(options, "label");
    if (!labelExpr) continue;
    const phaseTitle = matchOptionString(options, "phase");
    const model = matchOptionString(options, "model");
    for (const item of items) {
      const label = evaluateLabelExpression(labelExpr, alias, item);
      if (!label) continue;
      agents.push({
        label,
        ...(phaseTitle ? { phaseTitle } : {}),
        ...(model ? { model } : {}),
      });
    }
  }
  return agents;
}

interface ScriptArrayItem {
  key?: string;
  title?: string;
  model?: string;
}

function parseConstObjectArrays(script: string): Map<string, ScriptArrayItem[]> {
  const arrays = new Map<string, ScriptArrayItem[]>();
  const re = /const\s+(\w+)\s*=\s*\[([\s\S]*?)\]\s*(?:\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(script)) !== null) {
    const name = match[1];
    const block = match[2];
    if (!name || !block) continue;
    const items: ScriptArrayItem[] = [];
    const objectRe = /\{([\s\S]*?)\}/g;
    let objectMatch: RegExpExecArray | null;
    while ((objectMatch = objectRe.exec(block)) !== null) {
      const object = objectMatch[1];
      if (!object) continue;
      const key = matchObjectString(object, "key");
      const title = matchObjectString(object, "title");
      const model = matchObjectString(object, "model");
      if (key || title || model) {
        items.push({
          ...(key ? { key } : {}),
          ...(title ? { title } : {}),
          ...(model ? { model } : {}),
        });
      }
    }
    if (items.length > 0) arrays.set(name, items);
  }
  return arrays;
}

function matchObjectString(object: string, key: string): string | undefined {
  const re = new RegExp(`${key}\\s*:\\s*(['"\`])((?:\\\\.|[^\\\\])*?)\\1`);
  return re.exec(object)?.[2]?.trim() || undefined;
}

function matchOptionString(options: string, key: string): string | undefined {
  return matchObjectString(options, key);
}

function matchOptionExpression(options: string, key: string): string | undefined {
  const re = new RegExp(`${key}\\s*:\\s*([^,\\n}]+(?:\\s*\\+\\s*[^,\\n}]+)*)`);
  return re.exec(options)?.[1]?.trim() || undefined;
}

function evaluateLabelExpression(
  expression: string,
  alias: string,
  item: ScriptArrayItem,
): string | undefined {
  const templateMatch = /^`([\s\S]*)`$/.exec(expression.trim());
  if (templateMatch?.[1]) {
    const value = templateMatch[1].replace(/\$\{([^}]+)\}/g, (_match, rawExpr: string) => {
      return evaluateLabelPart(rawExpr.trim(), alias, item) ?? "";
    });
    return value.trim() || undefined;
  }

  const parts = expression.split(/\s*\+\s*/);
  const value = parts.map((part) => evaluateLabelPart(part.trim(), alias, item)).join("");
  return value.trim() || undefined;
}

function evaluateLabelPart(part: string, alias: string, item: ScriptArrayItem): string | undefined {
  const literal = /^(['"`])([\s\S]*)\1$/.exec(part);
  if (literal?.[2] !== undefined) return literal[2];
  if (part === `${alias}.key`) return item.key;
  if (part === `${alias}.title`) return item.title;
  if (part === `${alias}.model`) return item.model;
  return undefined;
}

/**
 * Derive a human-readable view of a `Workflow` tool call. The provider mapper
 * normalizes the SDK's structured `WorkflowOutput` onto `payload.workflow`
 * (runId, transcriptDir, summary) — the durable source, since the launch
 * tool_result text is swallowed by the background-task keepalive. The
 * result-text regexes remain as a fallback for threads persisted before the
 * structured field existed. The stable workflow summary wins over the live
 * `progress.description` (the currently running agent's label) so the title
 * doesn't end up as the last agent that happened to run.
 */
export function parseWorkflowInfo(payload: ToolCallPayload): WorkflowInfo {
  const script = readScript(payload);
  const result = readResultText(payload);
  const structured = payload.workflow;

  const description =
    structured?.summary?.trim() ||
    payload.progress?.description?.trim() ||
    /(?:^|\n)Summary:\s*(.+)/.exec(result)?.[1]?.trim() ||
    matchMetaString(script, "description") ||
    readArgString(payload, "description") ||
    undefined;

  const runId = structured?.runId ?? /(?:^|\n)Run ID:\s*(\S+)/.exec(result)?.[1]?.trim();
  const transcriptDir =
    structured?.transcriptDir ?? /(?:^|\n)Transcript dir:\s*(.+)/.exec(result)?.[1]?.trim();
  const manifestPath =
    transcriptDir && runId ? deriveManifestPath(transcriptDir, runId) : undefined;
  const phases = parsePhases(script);
  const plannedAgents = parsePlannedAgents(script);
  const liveAgents =
    plannedAgents.length > 0 ? [] : parseLiveAgents(structured?.liveDescriptions, phases);

  return {
    phases,
    plannedAgents,
    liveAgents,
    ...(description ? { description } : {}),
    ...(runId ? { runId } : {}),
    ...(transcriptDir ? { transcriptDir } : {}),
    ...(manifestPath ? { manifestPath } : {}),
  };
}

/**
 * Parse live agent observations out of the run's progress descriptions. The
 * workflow runtime updates the task description to "<phase>: <agent label>"
 * as each agent starts, so a description whose prefix (before the first colon)
 * matches a declared phase title is an agent-start observation. Anything else
 * (overall task description, log() narration) is ignored — mislabeling an
 * agent is worse than showing its id.
 */
function parseLiveAgents(
  liveDescriptions: readonly string[] | undefined,
  phases: readonly WorkflowPhase[],
): WorkflowPlannedAgent[] {
  if (!liveDescriptions?.length || phases.length === 0) return [];
  const titles = new Map(phases.map((phase) => [phase.title.toLowerCase(), phase.title]));
  const agents: WorkflowPlannedAgent[] = [];
  const seenLabels = new Set<string>();
  for (const description of liveDescriptions) {
    const match = /^([^:]+):\s*(.+)$/.exec(description);
    const phaseTitle = match?.[1] ? titles.get(match[1].trim().toLowerCase()) : undefined;
    const label = match?.[2]?.trim();
    if (!phaseTitle || !label) continue;
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    agents.push({ label, phaseTitle });
  }
  return agents;
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
