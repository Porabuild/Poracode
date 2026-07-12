import type { ThreadConfig } from "@/shared/contracts";
import { sanitizeModelName } from "./terminal";

export function buildCopilotArgs(
  config: ThreadConfig,
  prompt: string,
  sessionId: string,
  _launchOptions?: { suppressResumeConfigOverrides?: boolean },
  additionalMcpConfig?: string,
): string[] {
  // `--session-id` both pins the UUID for a new session (matching the one the
  // ACP probe minted via newSession) and resumes an existing session/task.
  // `--resume=<id>` only matches an existing session, task, or name — Copilot
  // CLI 1.0.52 rejects the ACP-minted UUID before any conversation turns have
  // been recorded against it, producing "Error: No session, task, or name
  // matched '<uuid>'" and exiting non-zero. `--session-id` covers both cases.
  const args = [`--session-id=${sessionId}`, "--allow-all-paths"];
  if (additionalMcpConfig) {
    args.push("--additional-mcp-config", additionalMcpConfig);
  }

  // Copilot's TUI only reflects the selected model/effort when the resume
  // command also carries those flags, even if ACP already applied them.
  // Sanitize: status-line scraping can capture TUI overlay glyphs as the
  // model name; passing those to `--model` makes the CLI error and fall back
  // to "auto", which is fine — but only if we don't pass the bad value.
  const safeModel = sanitizeModelName(config.model);
  if (safeModel) {
    args.push("--model", safeModel);
  }
  if (config.effort) {
    args.push("--effort", config.effort);
  }
  if (config.mode === "plan") {
    args.push("--plan");
  }
  if (config.approvalPolicy === "never") {
    args.push("--yolo");
  }
  if (prompt.trim().length > 0) {
    args.push("-i", prompt);
  }

  return args;
}
