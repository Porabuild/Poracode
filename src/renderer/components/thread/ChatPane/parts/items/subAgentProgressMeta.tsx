import { Fragment } from "react";
import type { ToolCallProgress } from "@/shared/contracts";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import {
  formatBracketParamHints,
  formatReasoningLabel,
  stripBracketParams,
} from "@/shared/modelLabels";

export type SubAgentProgressPartKind = "model" | "effort" | "tokens" | "live" | "steps";

export interface SubAgentProgressPart {
  kind: SubAgentProgressPartKind;
  label: string;
}

export function hasSubAgentProgressMeta(progress: ToolCallProgress | undefined): boolean {
  return buildSubAgentProgressParts({ progress }).length > 0;
}

export function readSubAgentLiveLabel(
  progress: ToolCallProgress | undefined,
  title: string,
): string | undefined {
  const label = (progress?.lastToolName ?? progress?.description)?.trim();
  if (!label) return undefined;
  const normalizedLabel = label.toLocaleLowerCase();
  const normalizedTitle = title.trim().toLocaleLowerCase();
  return normalizedTitle === normalizedLabel || normalizedTitle.endsWith(`: ${normalizedLabel}`)
    ? undefined
    : label;
}

export function buildSubAgentProgressParts(args: {
  progress: ToolCallProgress | undefined;
  liveLabel?: string | undefined;
  stepCount?: number | undefined;
  includeStepCount?: boolean;
}): SubAgentProgressPart[] {
  const { progress, liveLabel, stepCount, includeStepCount = false } = args;
  const parts: SubAgentProgressPart[] = [];
  const modelLabel = formatSubAgentModelLabel(progress?.model);
  if (modelLabel) parts.push({ kind: "model", label: modelLabel });
  const effortLabel = formatSubAgentEffortLabel(progress?.effort);
  if (effortLabel) parts.push({ kind: "effort", label: effortLabel });
  const tokenLabel = formatSubAgentTokenLabel(progress?.tokens);
  if (tokenLabel) parts.push({ kind: "tokens", label: tokenLabel });
  const normalizedLiveLabel = liveLabel?.trim();
  if (normalizedLiveLabel) parts.push({ kind: "live", label: normalizedLiveLabel });
  if (includeStepCount && stepCount !== undefined) {
    parts.push({ kind: "steps", label: formatSubAgentStepLabel(stepCount) });
  }
  return parts;
}

export interface SubAgentRowText {
  title: string;
  meta?: string;
}

/** Split a `name — route` agent title into its name and route-meta parts. */
export function splitAgentTitleMeta(title: string): SubAgentRowText {
  const separator = " — ";
  const separatorIndex = title.indexOf(separator);
  if (separatorIndex > 0) {
    const name = title.slice(0, separatorIndex).trim();
    const meta = title.slice(separatorIndex + separator.length).trim();
    if (name && meta) return { title: name, meta };
  }
  return { title };
}

/**
 * Two-line text for a delegated-agent dock row: the task/agent name on the
 * first line and the agent/model metadata (plus live progress) as a muted
 * second line. Crossagent titles encode their route after ` — `
 * (`task — Provider · Model · Effort`); a name-only Crossagent row is the
 * route itself (`Provider · Model`). Native subagent rows take their meta
 * from the agent type and the reported model/effort instead.
 */
export function buildSubAgentRowText(args: {
  rowTitle: string;
  /** The row title came from the tool's `description` arg (prose, not a route). */
  titleIsDescription: boolean;
  isCrossagent: boolean;
  subAgentType?: string | undefined;
  progress: ToolCallProgress | undefined;
  liveLabel?: string | undefined;
  stepCount?: number | undefined;
  isRunning: boolean;
}): SubAgentRowText {
  const { rowTitle, titleIsDescription, isCrossagent, subAgentType, progress, isRunning } = args;
  let title = rowTitle;
  let routeMeta: string | undefined;
  // A description is prose — only route-encoded titles split on the dash.
  if (isCrossagent || !titleIsDescription) {
    const split = splitAgentTitleMeta(rowTitle);
    title = split.title;
    routeMeta = split.meta;
    if (!routeMeta && isCrossagent && !titleIsDescription) {
      const dotIndex = rowTitle.indexOf(" · ");
      if (dotIndex > 0) {
        const name = rowTitle.slice(0, dotIndex).trim();
        const meta = rowTitle.slice(dotIndex + " · ".length).trim();
        if (name && meta) {
          title = name;
          routeMeta = meta;
        }
      }
    }
  }

  const progressParts = buildSubAgentProgressParts({
    progress,
    ...(isRunning && args.liveLabel ? { liveLabel: args.liveLabel } : {}),
    ...(args.stepCount !== undefined ? { stepCount: args.stepCount } : {}),
    includeStepCount: isRunning,
  });
  const parts: string[] = [];
  const pushPart = (part: string | undefined) => {
    const value = part?.trim();
    if (!value) return;
    const normalized = value.toLocaleLowerCase();
    // Skip a part the title or an earlier part already shows as its own
    // delimited segment (the agent type in `Agent Resume (Explore): …`, the
    // effort inside a `Provider · Model · High` route).
    const alreadyShown = (text: string) =>
      text.split(/[·:()—]/).some((segment) => segment.trim().toLocaleLowerCase() === normalized);
    if (alreadyShown(title) || parts.some(alreadyShown)) return;
    parts.push(value);
  };

  if (routeMeta) {
    pushPart(routeMeta);
  } else {
    pushPart(subAgentType);
    for (const part of progressParts) {
      if (part.kind === "model" || part.kind === "effort") pushPart(part.label);
    }
  }
  // The route already names the provider/model/effort; tokens, the live tool,
  // and the step count stay useful on either shape.
  for (const part of progressParts) {
    if (part.kind === "tokens" || part.kind === "live" || part.kind === "steps") {
      pushPart(part.label);
    }
  }

  return parts.length > 0 ? { title, meta: parts.join(" · ") } : { title };
}

export function SubAgentProgressMeta({
  progress,
  liveLabel,
  stepCount,
  includeStepCount = false,
  leadingSeparator = false,
  className = "",
  liveMaxClassName = "max-w-[24ch]",
}: {
  progress: ToolCallProgress | undefined;
  liveLabel?: string | undefined;
  stepCount?: number | undefined;
  includeStepCount?: boolean;
  leadingSeparator?: boolean;
  className?: string;
  liveMaxClassName?: string;
}) {
  const parts = buildSubAgentProgressParts({ progress, liveLabel, stepCount, includeStepCount });
  if (parts.length === 0) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 tabular-nums ${className}`}>
      {leadingSeparator && parts.length > 0 ? <span className="shrink-0 opacity-60">·</span> : null}
      {parts.map((part, index) => (
        <Fragment key={`${part.kind}-${index}`}>
          {index > 0 ? <span className="shrink-0 opacity-60">·</span> : null}
          <span
            className={part.kind === "live" ? `${liveMaxClassName} min-w-0 truncate` : "shrink-0"}
            title={part.kind === "live" ? part.label : undefined}
          >
            {part.label}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export function formatSubAgentModelLabel(model: string | undefined): string | undefined {
  const raw = model?.trim();
  if (!raw) return undefined;
  const base = stripBracketParams(raw).trim();
  if (!base) return undefined;
  const label = formatKnownModelId(base) ?? formatGenericModelLabel(base);
  const hints = raw.includes("[") ? formatBracketParamHints(raw) : undefined;
  return hints ? `${label} · ${hints}` : label;
}

export function formatSubAgentEffortLabel(effort: string | undefined): string | undefined {
  const raw = effort?.trim();
  return raw ? formatReasoningLabel(raw) : undefined;
}

function formatSubAgentTokenLabel(tokens: number | undefined): string | undefined {
  if (tokens === undefined || tokens <= 0) return undefined;
  return `${formatTokenCount(tokens)} tok`;
}

function formatSubAgentStepLabel(stepCount: number): string {
  return `${stepCount} step${stepCount === 1 ? "" : "s"}`;
}

function formatKnownModelId(modelId: string): string | undefined {
  const claudeShort = /^(opus|sonnet|haiku)$/i.exec(modelId);
  if (claudeShort) return capitalizeSegment(claudeShort[1]!);

  // Optional trailing -YYYYMMDD: assistant messages report the dated release
  // id (e.g. claude-opus-4-8-20250915); the pill shows just "Opus 4.8".
  const claudeRelease = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-\d{8})?$/i.exec(modelId);
  if (claudeRelease) {
    return `${capitalizeSegment(claudeRelease[1]!)} ${claudeRelease[2]}.${claudeRelease[3]}`;
  }

  const gpt = /^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano|codex|spark|max))?$/i.exec(modelId);
  if (gpt) {
    const suffix = gpt[2] ? ` ${capitalizeSegment(gpt[2])}` : "";
    return `GPT-${gpt[1]}${suffix}`;
  }

  return undefined;
}

function formatGenericModelLabel(modelId: string): string {
  return modelId
    .split(/[-_/\s]+/g)
    .filter(Boolean)
    .map(formatModelSegment)
    .join(" ");
}

function formatModelSegment(segment: string): string {
  if (/^gpt$/i.test(segment)) return "GPT";
  if (/^llm$/i.test(segment)) return "LLM";
  if (/^ai$/i.test(segment)) return "AI";
  return capitalizeSegment(segment);
}

function capitalizeSegment(segment: string): string {
  return segment.length <= 1 ? segment : segment[0]!.toUpperCase() + segment.slice(1);
}
