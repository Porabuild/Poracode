/**
 * Codex app-server advisory notifications → canonical `warning` events.
 *
 * `warning`, `configWarning`, `deprecationNotice`, `guardianWarning`, and
 * `model/rerouted` carry user-facing guidance that is not a turn failure.
 * They reuse the canonical warning event rather than `error`, which would
 * pause queued follow-ups. All but the generic `warning` are presented as
 * notices; the generic one stays hidden because Codex repeats some of them
 * (e.g. the skills-budget warning) in every session.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import type { CodexMapperState } from "../canonicalMappingState";

const CODEX_ADVISORY_METHODS = new Set([
  "warning",
  "configWarning",
  "deprecationNotice",
  "guardianWarning",
  "model/rerouted",
]);

/** Advisories hidden from the user (the event is still emitted for logs/clients). */
const CODEX_HIDDEN_ADVISORY_METHODS = new Set(["warning"]);

export function isCodexAdvisoryNotification(method: string): boolean {
  return CODEX_ADVISORY_METHODS.has(method);
}

function readText(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** `summary` plus optional `details` (config/deprecation notices). */
function summaryWithDetails(params: Record<string, unknown> | undefined): string | undefined {
  const summary = readText(params, "summary");
  if (!summary) return undefined;
  const details = readText(params, "details");
  const path = readText(params, "path");
  return [summary, details, path].filter(Boolean).join("\n\n");
}

function readAdvisoryMessage(
  method: string,
  params: Record<string, unknown> | undefined,
): string | undefined {
  switch (method) {
    case "warning":
    case "guardianWarning":
      return readText(params, "message");
    case "configWarning":
    case "deprecationNotice":
      return summaryWithDetails(params);
    case "model/rerouted": {
      const fromModel = readText(params, "fromModel");
      const toModel = readText(params, "toModel");
      return fromModel && toModel ? msg("codex.modelRerouted", { fromModel, toModel }) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Map one advisory notification. Identical advisories are surfaced once per
 * mapper (session): Codex repeats some of them on every turn (e.g. the
 * skills-budget `warning`), and a per-turn repeat would only add noise.
 */
export function mapCodexAdvisoryNotification(
  method: string,
  params: Record<string, unknown> | undefined,
  state: CodexMapperState,
): RuntimeEvent[] {
  const message = readAdvisoryMessage(method, params);
  if (!message) return [];
  const key = `${method}|${message}`;
  if (state.surfacedAdvisories.has(key)) return [];
  state.surfacedAdvisories.add(key);
  return [
    {
      type: "warning",
      threadId: state.threadId,
      message,
      ...(CODEX_HIDDEN_ADVISORY_METHODS.has(method) ? {} : { presentation: "notice" as const }),
    },
  ];
}
