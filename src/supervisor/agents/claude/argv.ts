import type { ThreadConfig } from "@/shared/contracts";
import { CLAUDE_CONTEXT_MANAGED_MODEL_IDS, CLAUDE_DEFAULT_APPROVAL_POLICY } from "./detection";

/**
 * Re-attach the `[<size>]` suffix Claude's CLI uses to pick a context-window
 * variant. For built-in Claude models the suffix is Lightcode's own (derived
 * from `contextSize`), so any pre-existing suffix is stripped first to let the
 * chosen `contextSize` win over a stale value baked into a legacy `model` id.
 *
 * Custom / external-provider model ids (e.g. z.ai `glm-5.2[1m]`) are NOT
 * context-managed: their `[1m]` is part of the provider's real model name. Those
 * pass through untouched so the upstream model still resolves — stripping it
 * would send `glm-5.2`, which z.ai rejects.
 */
export function applyClaudeContextSuffix(model: string, contextSize?: string): string {
  const base = model.replace(/\[[0-9]+[mk]\]$/i, "");
  if (!CLAUDE_CONTEXT_MANAGED_MODEL_IDS.has(base)) return model;
  if (!contextSize || contextSize === "200k") return base;
  return `${base}[${contextSize}]`;
}

export function buildClaudeArgs(
  config: ThreadConfig,
  prompt: string,
  sessionId?: string,
  assignedSessionId?: string,
): string[] {
  const args: string[] = [];

  if (sessionId) {
    args.push("--resume", sessionId);
  } else if (assignedSessionId) {
    args.push("--session-id", assignedSessionId);
  }

  if (config.model) {
    args.push("--model", applyClaudeContextSuffix(config.model, config.contextSize));
  }
  if (config.effort) {
    // `ultracode` is a Claude Code setting (xhigh reasoning + dynamic
    // workflows), not an `--effort` value. Send `xhigh` to the model; the
    // dynamic-workflow toggle rides on the `--settings` file — wired via
    // applyFlagSettings on the SDK path and via the ultracode-merged
    // settings.json rewrite on the PTY path.
    args.push("--effort", config.effort === "ultracode" ? "xhigh" : config.effort);
  }

  args.push("--allow-dangerously-skip-permissions");

  const permissionMode =
    config.mode === "plan" ? "plan" : (config.approvalPolicy ?? CLAUDE_DEFAULT_APPROVAL_POLICY);
  args.push("--permission-mode", permissionMode);

  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}
