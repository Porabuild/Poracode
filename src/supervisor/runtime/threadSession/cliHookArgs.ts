import type { ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter } from "../../agents/base";

/**
 * Apply the adapter's config-driven argv rewrite (e.g. Claude folds session
 * flags into the hook plugin's `--settings` file). No-op for adapters without
 * the hook.
 */
export async function applyLaunchArgsConfigRewrite(
  adapter: AgentAdapter,
  args: string[],
  config: ThreadConfig,
  projectLocation: ProjectLocation,
): Promise<string[]> {
  if (!adapter.rewriteLaunchArgsForConfig) return args;
  return adapter.rewriteLaunchArgsForConfig(args, config, projectLocation);
}

/**
 * Insert hook-launch extra args into the argv at the adapter-declared
 * position (default: append). Adapters whose CLIs treat trailing tokens as
 * positionals implement `extraArgsPosition` to keep flags in the option
 * section.
 */
export function mergeCliHookExtraArgs(
  adapter: AgentAdapter,
  args: string[],
  extraArgs: string[],
  prompt: string,
  sessionRef?: SessionRef,
): string[] {
  if (extraArgs.length === 0) {
    return args;
  }
  const insertAt = adapter.extraArgsPosition?.(args, prompt, sessionRef) ?? args.length;
  return [...args.slice(0, insertAt), ...extraArgs, ...args.slice(insertAt)];
}
