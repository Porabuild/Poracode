import type { ThreadConfig } from "@/shared/contracts";

/** Devin 3000.10.21: https://docs.devin.ai/cli/reference/commands */
function buildDevinTerminalOptions(config: ThreadConfig): string[] {
  const policy = config.mode === "plan" ? "normal" : config.approvalPolicy;
  const permission = policy === "bypassPermissions" ? "bypass" : policy;
  const args = [
    "--respect-workspace-trust",
    "false",
    "--permission-mode",
    permission && ["normal", "accept-edits", "smart", "bypass"].includes(permission)
      ? permission
      : "smart",
  ];
  if (config.model) args.push("--model", config.model);
  return args;
}

export function buildDevinArgs(config: ThreadConfig, prompt: string, session?: string): string[] {
  const args = buildDevinTerminalOptions(config);
  if (session) args.push("--resume", session);
  // Plan mode needs the terminal /plan pre-input before the initial prompt.
  if (prompt && config.mode !== "plan") args.push("--", prompt);
  return args;
}

export function buildDevinOneShotArgs(model: string | undefined, prompt: string): string[] {
  const args = ["--permission-mode", "bypass", "--respect-workspace-trust", "false"];
  if (model) args.push("--model", model);
  return [...args, "-p", prompt];
}

/** ACP has its own model option; permission modes are negotiated over ACP. */
export function buildDevinAcpArgs(config: ThreadConfig): string[] {
  return ["acp", ...(config.model ? ["--model", config.model] : [])];
}
