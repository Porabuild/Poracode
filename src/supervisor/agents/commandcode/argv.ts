import type { ThreadConfig } from "@/shared/contracts";

/**
 * Assemble the `command-code` CLI argv for an interactive PTY launch (or a
 * resume).
 *
 * Flag reference: https://commandcode.ai/docs/reference/cli (`--help`).
 * - `--trust` is always passed so the first-run folder-trust prompt never
 *   blocks the PTY (analogous to Gemini's `--skip-trust`).
 * - `--yolo` is appended on every launch as an *unlock*. The CLI resolves the
 *   initial mode as `permissionMode || (yolo ? "bypass" : "standard")` and only
 *   includes "bypass" in the in-TUI Shift+Tab cycle (standard → auto-accept →
 *   plan → bypass) when the yolo flag is set. So with an explicit starting mode
 *   pinned, `--yolo` does not change what the session opens in; it just makes
 *   bypass reachable later. (Verified against the v0.31.2 bundle.)
 * - Because `--yolo` becomes the *initial* mode when no other mode is given, we
 *   always pin an explicit `--permission-mode <standard|auto-accept|plan>` —
 *   except when the user picks Bypass Permissions, where we intentionally omit
 *   it so `--yolo` selects bypass as the starting mode.
 * - `command-code` has no flag to pre-assign or report a session id, but it
 *   does support `--resume <id>` (load that exact conversation). We discover
 *   the real id from `~/.commandcode/projects/<cwd>/<id>.jsonl` (see
 *   sessionFiles.ts) and pass it here. `resumeSessionId` is: `undefined` for a
 *   fresh launch (no resume flag), a non-empty id for `--resume <id>`, or `""`
 *   for the `--continue` fallback when no real id is known. The initial prompt
 *   is passed as a trailing positional arg.
 */
export function buildCommandCodeArgs(
  config: ThreadConfig,
  prompt: string,
  resumeSessionId?: string,
): string[] {
  const args: string[] = ["--trust", "--skip-onboarding"];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else if (resumeSessionId === "") {
    args.push("--continue");
  }
  if (config.model) {
    args.push("--model", config.model);
  }

  // Pin an explicit starting mode so the `--yolo` appended below stays an
  // unlock rather than becoming the initial mode. A Bypass pick (never/yolo) in
  // non-plan mode intentionally omits the start mode, so the trailing `--yolo`
  // opens the session directly in bypass.
  if (config.mode === "plan") {
    args.push("--permission-mode", "plan");
  } else if (config.approvalPolicy === "auto_edit") {
    args.push("--permission-mode", "auto-accept");
  } else if (config.approvalPolicy !== "never" && config.approvalPolicy !== "yolo") {
    args.push("--permission-mode", "standard");
  }

  // Always unlock bypass in the picker (and select it when no mode is pinned).
  args.push("--yolo");

  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}
