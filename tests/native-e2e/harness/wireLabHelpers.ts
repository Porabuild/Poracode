import { loadScriptJournal } from "./durableScripts.ts";
import type { CheckpointFixtureId, FaultFixtureId } from "./controlFixtures.ts";

export function normalizeLabBasePath(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLead = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLead.replace(/\/+$/, "");
}

export function pairingTokenFromUrl(pairingUrl: string): string {
  const url = new URL(pairingUrl);
  const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!token) throw new Error("Pairing URL is missing a token fragment.");
  return token;
}

export function replayDurableScriptEntries(
  journalPath: string,
  actions: {
    clearFaults(): void;
    activateFault(id: FaultFixtureId): void;
    applyCheckpoint(id: CheckpointFixtureId): void;
  },
): void {
  for (const entry of loadScriptJournal(journalPath).entries) {
    if (entry.kind === "clear") {
      actions.clearFaults();
    } else if (entry.kind === "fault") {
      actions.activateFault(entry.id);
    } else {
      actions.applyCheckpoint(entry.id);
    }
  }
}
