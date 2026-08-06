import { stripAnsi } from "@/shared/ansi";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import {
  detectTerminalStatusFromHints,
  type SyncConfigFromTerminalStateInput,
  type TerminalStatusHint,
} from "../base";

const ANTIGRAVITY_STRONG = [
  {
    re: /✋\s+Action Required/i,
    status: "needs_reply" as const,
    attention: "needs_reply" as const,
  },
  { re: /Enter to select/i, status: "needs_reply" as const, attention: "needs_reply" as const },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?/i,
    status: "needs_approval" as const,
    attention: "needs_approval" as const,
  },
  {
    re: /^[^\S\r\n]*[⣷⣯⣟⡿⢿⣻⣽⣾](?:\s|$)/m,
    status: "working" as const,
    attention: "working" as const,
  },
  { re: /✦\s+Working|⚙\s+Working/i, status: "working" as const, attention: "working" as const },
  { re: /\(esc to cancel/i, status: "working" as const, attention: "working" as const },
  { re: /◇\s+Ready/i, status: "idle" as const, attention: "none" as const },
];

const ANTIGRAVITY_FALLBACK_IDLE = [
  { re: /^\s*>\s*$/m, status: "idle" as const, attention: "none" as const },
  { re: /\?\s+for shortcuts/i, status: "idle" as const, attention: "none" as const },
];

interface AntigravityStatusLineState {
  model: string;
  effort?: string;
  mode?: "default" | "accept-edits" | "plan";
}

type AntigravityConfigCapabilities = Pick<AgentCapability, "models" | "modelEfforts">;

function modelForStatusSegment(
  segment: string,
  capabilities: AntigravityConfigCapabilities,
): string | undefined {
  const normalized = segment.trim().toLowerCase();
  return capabilities.models.find((model) => {
    const values = [model.id, model.label].filter((value): value is string => Boolean(value));
    return values.some((value) => {
      const candidate = value.toLowerCase();
      return normalized === candidate || normalized.startsWith(`${candidate} (`);
    });
  })?.id;
}

/** Parse Agy's built-in `mode · Model · effort` status line. */
export function detectAntigravityStatusLineState(
  text: string,
  capabilities: AntigravityConfigCapabilities,
): AntigravityStatusLineState | null {
  // The built-in status line is always in the terminal footer. Restrict the
  // scan to the tail so similarly formatted conversation text cannot rewrite
  // the thread configuration.
  const lines = stripAnsi(text)
    .split(/[\r\n]+/)
    .slice(-6);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const segments = lines[index]
      ?.split(/\s+·\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (!segments || segments.length === 0) continue;

    const modelIndex = segments.findIndex((segment) =>
      modelForStatusSegment(segment, capabilities),
    );
    if (modelIndex === -1) continue;
    const model = modelForStatusSegment(segments[modelIndex]!, capabilities);
    if (!model) continue;

    const allowedEfforts = capabilities.modelEfforts?.[model] ?? [];
    const effortSegment = segments
      .slice(modelIndex + 1)
      .find((segment) =>
        allowedEfforts.some((effort) => effort.toLowerCase() === segment.toLowerCase()),
      );
    const effort = allowedEfforts.find(
      (candidate) => candidate.toLowerCase() === effortSegment?.toLowerCase(),
    );

    const prefix = segments.slice(0, modelIndex).map((segment) => segment.toLowerCase());
    const mode = prefix.includes("plan")
      ? "plan"
      : prefix.includes("accept-edits")
        ? "accept-edits"
        : modelIndex === 0
          ? "default"
          : undefined;

    return { model, ...(effort ? { effort } : {}), ...(mode ? { mode } : {}) };
  }
  return null;
}

export function detectAntigravityTerminalStatus(
  text: string,
  capabilities?: AntigravityConfigCapabilities,
): TerminalStatusHint | null {
  const hint = detectTerminalStatusFromHints(text, ANTIGRAVITY_STRONG, ANTIGRAVITY_FALLBACK_IDLE);
  if (!hint || !capabilities) return hint;

  const state = detectAntigravityStatusLineState(text, capabilities);
  if (!state) return hint;
  hint.model = state.model;
  if (state.effort) hint.effort = state.effort;
  if (state.mode) {
    hint.planMode = state.mode === "plan";
    hint.approvalPolicy = state.mode === "accept-edits" ? "accept-edits" : "default";
  }
  return hint;
}

export function syncAntigravityConfigFromTerminalState(
  input: SyncConfigFromTerminalStateInput,
  capabilities: AntigravityConfigCapabilities,
): ThreadConfig | undefined {
  let next: ThreadConfig | undefined;
  const update = (patch: Partial<ThreadConfig>) => {
    next = { ...(next ?? input.config), ...patch };
  };

  if (input.hint.model && input.hint.model !== input.config.model) {
    update({ model: input.hint.model });
    if ((capabilities.modelEfforts?.[input.hint.model] ?? []).length === 0) {
      update({ effort: undefined });
    }
  }
  if (input.hint.effort && input.hint.effort !== input.config.effort) {
    update({ effort: input.hint.effort });
  }

  if (Object.hasOwn(input.hint, "planMode")) {
    if (input.hint.planMode && input.config.mode !== "plan") {
      update({ mode: "plan" });
    } else if (!input.hint.planMode && input.config.mode === "plan") {
      update({ mode: undefined });
    }
  }

  if (input.hint.approvalPolicy) {
    const currentPolicy = input.config.approvalPolicy ?? "default";
    if (input.hint.approvalPolicy !== currentPolicy) {
      update({ approvalPolicy: input.hint.approvalPolicy });
    }
  }

  return next;
}
