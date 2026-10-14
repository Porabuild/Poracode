import type { SessionNotification } from "@agentclientprotocol/sdk";

export type RichToolProfile = "light" | "heavy" | "bursty";
export const TOOL_PROFILES: Readonly<
  Record<
    RichToolProfile,
    {
      everyTicks: number;
      batch: number;
      outputBytes: number;
    }
  >
>;
export const TOOL_CASES: readonly string[];
export interface RichToolStats {
  revision: number;
  imageClass: string;
  started: number;
  completed: number;
  failed: number;
  updates: number;
  imageBlocks: number;
  childTools: number;
  childMessages: number;
  byCase: Record<string, { started: number; completed: number }>;
  pending: number;
}
/** Synthetic tool results only; no real file, command, provider or delegation execution. */
export function createRichToolWorkload(
  emit: (update: SessionNotification["update"]) => void,
  slot: number,
): {
  stats: RichToolStats;
  tick(profile: RichToolProfile, maxCalls?: number, imageClass?: "standard" | "pressure"): void;
  /** Advance existing completions only; starts no new tools and preserves their result status. */
  drain(): void;
  cancel(): void;
};
