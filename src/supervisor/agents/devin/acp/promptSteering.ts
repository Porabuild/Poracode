import type { PromptResponse } from "@agentclientprotocol/sdk";

import type { AcpPromptSteering } from "../../acp/promptSteering";
import { record } from "../acpRecord";

/**
 * Devin's non-interrupting steering declaration, negotiated at `initialize`.
 * The agent advertises `agentCapabilities._meta['cognition.ai/midTurnPrompts']`;
 * installed 3000.11.234 accepts a plain concurrent `session/prompt` mid-turn
 * with no steering marker, answering both calls when the turn ends.
 */
export const DEVIN_ACP_PROMPT_STEERING: AcpPromptSteering = {
  isSupported: (initialize) =>
    record(initialize.agentCapabilities?._meta)["cognition.ai/midTurnPrompts"] === true,
  requestMeta: {},
  repliesInNewAssistantItem: true,
};

/**
 * Replies folded into one native turn repeat the same `cognition.ai/userMessageId`
 * and usage, so the shared ledger dedups them into one sample. A missing or
 * malformed id preserves the per-turn/per-steer fallback.
 */
export function devinAcpPromptUsageSampleId(response: PromptResponse): string | undefined {
  const id = record(response._meta)["cognition.ai/userMessageId"];
  return typeof id === "string" && id.trim().length > 0 && id.length <= 200
    ? `native:${id}`
    : undefined;
}
