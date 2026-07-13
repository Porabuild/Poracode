import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { AuthState, PromptSegment, SessionRef } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";

/**
 * Default segment formatter: file segments become `@path`, text segments pass through.
 * Used when an adapter doesn't implement `formatPromptSegments`.
 */
export function shortenHomePath(p: string): string {
  const normalized = p.replaceAll("\\", "/");
  const homeNorm = homedir().replaceAll("\\", "/");
  if (normalized.startsWith(homeNorm + "/")) {
    return "~" + normalized.slice(homeNorm.length);
  }
  // Also shorten Linux home paths for WSL sessions
  return normalized.replace(/^\/home\/[^/]+\//, "~/").replace(/^\/root\//, "~/");
}

export function defaultFormatPromptSegments(segments: PromptSegment[]): string {
  const attachments = segments.filter((s) => s.kind === "attachment");
  const rest = segments.filter((s) => s.kind !== "attachment");
  const attachmentLines = attachments.map((s) => `@${shortenHomePath(s.path)}`).join(" ");
  const restStr = rest.map(inlinePromptSegmentText).join("");
  return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
}

export function detectAuthFile(filePath: string): AuthState {
  return existsSync(filePath) ? "authenticated" : "missing";
}

export function createKnownSessionRef(sessionId?: string): SessionRef {
  return {
    providerSessionId: sessionId ?? randomUUID(),
    discoveredAt: new Date().toISOString(),
  };
}
