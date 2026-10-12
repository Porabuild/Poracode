import type { AgentCapability } from "@/shared/contracts";
import { lookupProviderRegistration } from "./providerRegistry";

type PrimaryModelChoices = (capabilities: AgentCapability) => readonly string[];
const primaryChoices = new Map<string, PrimaryModelChoices>();

/**
 * Provider-owned workflow choices shown before the ordinary model inventory.
 * Returns exact accepted row IDs in display order; the picker intersects these
 * with its filtered, projected rows. No extra selection authority is created.
 * This registration is renderer-only metadata, never persisted or serialized.
 */
export function registerPrimaryModelChoices(kind: string, resolve: PrimaryModelChoices) {
  primaryChoices.set(kind, resolve);
}

export function primaryModelChoices(
  kind: string,
  capabilities: AgentCapability,
): readonly string[] {
  return lookupProviderRegistration(primaryChoices, kind)?.(capabilities) ?? [];
}
