/**
 * Devin ACP session-mode mapping.
 *
 * Devin's live 3000.11.3 ACP session advertises a five-value mode config
 * option (`accept-edits`/Code, `smart`, `ask`, `plan`, `bypass`/Bypass
 * Permissions — confirmed in tmp/devin/acp-contracts.md §3), while stored
 * Poracode configs carry the CLI's aliases (`normal`/`auto`,
 * `dangerous`/`yolo`/`bypass`) and the shared canonical policies
 * (`default`, `never`, `auto_edit`, `autopilot`).
 *
 * The legacy GUI default was a forced `bypass`; that default is preserved,
 * but an explicit stored selection (Ask, Code, Smart, Plan, …) is now sent
 * verbatim instead of being coerced back to Bypass. An explicit policy whose
 * id the session does not offer resolves to nothing so the agent keeps its
 * own mode — a permission level is never silently substituted.
 */

import type { ThreadConfig } from "@/shared/contracts";
import { resolveAcpMode } from "../../acp/sessionConfig";

export const DEVIN_ACP_MODE_IDS = ["accept-edits", "smart", "ask", "plan", "bypass"] as const;

export type DevinAcpModeId = (typeof DEVIN_ACP_MODE_IDS)[number];

/**
 * Stored policy ids each negotiated mode honors, including every alias the
 * CLI parser accepts and the shared canonical mappings written back by
 * `applyAcpModeUpdateToConfig` (Code round-trips as `accept-edits`/`default`).
 */
const DEVIN_MODE_ALIASES: Record<DevinAcpModeId, readonly string[]> = {
  "accept-edits": [
    "accept-edits",
    "accept_edits",
    "acceptedits",
    "auto_edit",
    "autoedit",
    "default",
    "code",
  ],
  smart: ["smart", "normal", "auto"],
  ask: ["ask"],
  plan: ["plan"],
  bypass: ["bypass", "never", "yolo", "dangerous", "autopilot", "bypass-permissions"],
};

function pickAvailable(
  available: Map<string, string>,
  aliases: readonly string[],
): string | undefined {
  for (const alias of aliases) {
    const match = available.get(alias);
    if (match) return match;
  }
  return undefined;
}

/**
 * Resolve the ACP mode id for a turn from the session's advertised ids.
 *
 * Falls back through: explicit stored policy (exact negotiated id only) →
 * legacy GUI Bypass default → the shared generic mapper (agent/default/code).
 */
export function resolveDevinAcpMode(
  config: ThreadConfig,
  availableModeIds: readonly string[],
): string | undefined {
  const available = new Map(
    availableModeIds.map((modeId) => [modeId.toLowerCase(), modeId] as const),
  );
  // Plan intent never degrades to a permission default: if the negotiated
  // list has no plan id the agent keeps its own mode.
  if (config.mode === "plan") {
    return (
      pickAvailable(available, DEVIN_MODE_ALIASES.plan) ??
      resolveAcpMode(config, [...availableModeIds])
    );
  }
  const policy = config.approvalPolicy?.toLowerCase();
  if (policy) {
    for (const modeId of DEVIN_ACP_MODE_IDS) {
      if (!DEVIN_MODE_ALIASES[modeId].includes(policy)) continue;
      // The stored selection maps to exactly one negotiated permission level.
      // If Devin stops offering it, keeping the agent's own mode is safer
      // than silently choosing a different level.
      return pickAvailable(available, DEVIN_MODE_ALIASES[modeId]);
    }
  }
  const bypass = pickAvailable(available, DEVIN_MODE_ALIASES.bypass);
  if (bypass) return bypass;
  // Devin's own documented default (Code) before the generic agent fallback.
  const code = pickAvailable(available, DEVIN_MODE_ALIASES["accept-edits"]);
  if (code) return code;
  return resolveAcpMode(config, [...availableModeIds]);
}
