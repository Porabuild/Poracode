import { closeSync, fstatSync, openSync } from "node:fs";
import { isatty } from "node:tty";

const WINDOWS_CONSOLE_INPUT = String.raw`\\.\CONIN$`;

export interface InteractiveConsoleOptions {
  readonly platform?: NodeJS.Platform;
  readonly stdinIsTTY?: boolean;
  readonly stdoutIsTTY?: boolean;
  readonly stdinIsCharacterDevice?: () => boolean;
  readonly openConsoleInput?: () => number | undefined;
  readonly closeDescriptor?: (descriptor: number) => void;
}

/**
 * Resolves the stdin an interactive TUI should use: `"inherit"` when stdin is
 * already a terminal, a reopened console-input descriptor (caller closes it),
 * or `undefined` when this invocation is not interactive.
 *
 * The desktop-provided CLI runs the GUI-subsystem Electron executable as Node.
 * On Windows that process reattaches stdout/stderr to the calling console but
 * leaves stdin on NUL, so `process.stdin.isTTY` is false at an interactive
 * prompt and a child inheriting it gets NUL too. NUL is a character device;
 * piped or redirected input is a pipe or file and stays non-interactive.
 */
export function resolveInteractiveStdin(
  options: InteractiveConsoleOptions = {},
): "inherit" | number | undefined {
  const stdinIsTTY = options.stdinIsTTY ?? process.stdin.isTTY === true;
  const stdoutIsTTY = options.stdoutIsTTY ?? process.stdout.isTTY === true;
  if (!stdoutIsTTY) return undefined;
  if (stdinIsTTY) return "inherit";
  if ((options.platform ?? process.platform) !== "win32") return undefined;
  if (!(options.stdinIsCharacterDevice ?? stdinIsCharacterDevice)()) return undefined;
  return (options.openConsoleInput ?? openConsoleInput)();
}

/** Routing-only check: whether bare `poracode` should open the TUI. */
export function isInteractiveInvocation(options: InteractiveConsoleOptions = {}): boolean {
  const stdin = resolveInteractiveStdin(options);
  if (typeof stdin === "number") (options.closeDescriptor ?? closeSync)(stdin);
  return stdin !== undefined;
}

function stdinIsCharacterDevice() {
  try {
    return fstatSync(0).isCharacterDevice();
  } catch {
    return false;
  }
}

function openConsoleInput() {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(WINDOWS_CONSOLE_INPUT, "r+");
    if (isatty(descriptor)) return descriptor;
  } catch {
    // No console is attached (service, detached process): not interactive.
  }
  if (descriptor !== undefined) closeSync(descriptor);
  return undefined;
}
