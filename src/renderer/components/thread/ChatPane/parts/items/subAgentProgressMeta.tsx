import { Fragment } from "react";
import type { ToolCallProgress } from "@/shared/contracts";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { formatTokenCount } from "@/renderer/components/thread/formatTokenCount";
import { formatBracketParamHints, stripBracketParams } from "@/shared/modelLabels";

export type SubAgentProgressPartKind = "model" | "tokens" | "live" | "steps";

export interface SubAgentProgressPart {
  kind: SubAgentProgressPartKind;
  label: string;
}

export function hasSubAgentProgressMeta(progress: ToolCallProgress | undefined): boolean {
  return buildSubAgentProgressParts({ progress }).length > 0;
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
  const tokenLabel = formatSubAgentTokenLabel(progress?.tokens);
  if (tokenLabel) parts.push({ kind: "tokens", label: tokenLabel });
  const normalizedLiveLabel = liveLabel?.trim();
  if (normalizedLiveLabel) parts.push({ kind: "live", label: normalizedLiveLabel });
  if (includeStepCount && stepCount !== undefined) {
    parts.push({ kind: "steps", label: formatSubAgentStepLabel(stepCount) });
  }
  return parts;
}

export function SubAgentProgressMeta({
  progress,
  liveLabel,
  stepCount,
  includeStepCount = false,
  leadingSeparator = false,
  showLoader = false,
  className = "",
  liveMaxClassName = "max-w-[24ch]",
  loaderClassName = "text-[color:var(--muted)]",
}: {
  progress: ToolCallProgress | undefined;
  liveLabel?: string | undefined;
  stepCount?: number | undefined;
  includeStepCount?: boolean;
  leadingSeparator?: boolean;
  showLoader?: boolean;
  className?: string;
  liveMaxClassName?: string;
  loaderClassName?: string;
}) {
  const parts = buildSubAgentProgressParts({ progress, liveLabel, stepCount, includeStepCount });
  if (parts.length === 0 && !showLoader) return null;
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
      {showLoader ? <PixelLoader size="xxs" className={loaderClassName} /> : null}
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
