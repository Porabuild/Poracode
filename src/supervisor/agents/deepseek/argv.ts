import type { ProjectLocation } from "@/shared/contracts";
import { buildAgentCommand } from "../base";

/** Shipped ACP profile in @deepseek-ai/dsh 0.2.1-rc.1 and rc.2. */
export const DEEPSEEK_ACP_ARGS = ["acp"];

export function buildDeepSeekCommand(location: ProjectLocation, executablePath?: string) {
  return buildAgentCommand(location, "dsh", [...DEEPSEEK_ACP_ARGS], executablePath);
}
