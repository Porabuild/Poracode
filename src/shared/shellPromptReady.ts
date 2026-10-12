import { extractOscEventsFromPtyStream } from "./osc";

/** Quiet period after ordinary prompt text before a command may be written. */
export const SHELL_QUIET_READY_MS = 250;

/**
 * How long to keep waiting after a terminal-identity query. Login shells
 * (fish in particular) emit Primary Device Attribute / cursor queries before
 * the prompt, and a command written into that handshake is eaten or runs
 * before the shell's PATH is ready.
 */
export const SHELL_QUERY_FALLBACK_MS = 12_000;

export interface ShellPromptGate {
  /** Feed one PTY chunk. `"ready"` means a prompt-end marker was seen. */
  push(chunk: string): "ready" | "pending";
  /** How long to wait for more output before treating a quiet shell as ready. */
  delayMs(): number;
  reset(): void;
}

const QUERY_TOKENS = ["\u001B[0c", "\u001B[6n"] as const;

/** True when a device-attribute or cursor query is still the tail of `buffer`. */
function queryIsUnanswered(buffer: string): boolean {
  let queryAt = -1;
  let tokenLength = 0;
  for (const token of QUERY_TOKENS) {
    const at = buffer.lastIndexOf(token);
    if (at > queryAt) {
      queryAt = at;
      tokenLength = token.length;
    }
  }
  if (queryAt < 0) return false;
  return buffer.slice(queryAt + tokenLength).trim().length === 0;
}

/**
 * Decides when an interactive login shell will accept a command line.
 *
 * Prompt-end (OSC 133 / 633 `B`) is ready immediately. A device-attribute or
 * cursor-position query holds the command until the prompt arrives, or until
 * {@link SHELL_QUERY_FALLBACK_MS} of quiet. Anything else is ready after
 * {@link SHELL_QUIET_READY_MS} of quiet, which covers shells that only print
 * a `$ ` / `PS>` prompt.
 */
export function createShellPromptGate(): ShellPromptGate {
  let carry = "";
  let buffer = "";
  let delay = SHELL_QUIET_READY_MS;

  return {
    push(chunk) {
      buffer = `${buffer}${chunk}`.slice(-2048);
      const extracted = extractOscEventsFromPtyStream(carry, chunk);
      carry = extracted.carryOut;
      if (
        extracted.shell.some(
          (event) => (event.code === 133 || event.code === 633) && event.kind === "prompt-end",
        )
      ) {
        return "ready";
      }
      // A query holds the command only while it is still the end of the
      // stream. The prompt that follows must not inherit the long delay.
      delay = queryIsUnanswered(buffer) ? SHELL_QUERY_FALLBACK_MS : SHELL_QUIET_READY_MS;
      return "pending";
    },
    delayMs() {
      return delay;
    },
    reset() {
      carry = "";
      buffer = "";
      delay = SHELL_QUIET_READY_MS;
    },
  };
}
