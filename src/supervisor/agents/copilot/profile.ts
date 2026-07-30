import type { ProjectLocation } from "@/shared/contracts";
import {
  homeProfileEnvForLocation,
  resolveAgentInstanceEnv,
  resolveHomeProfilePathForLocation,
} from "../homeProfile";

export const resolveCopilotHomeForLocation = resolveHomeProfilePathForLocation;
export const resolveCopilotInstanceEnv = resolveAgentInstanceEnv;

export function copilotProfileEnvForLocation(
  homeDir: string | undefined,
  customEnv: Record<string, string> | undefined,
  location: ProjectLocation,
): Record<string, string> | undefined {
  return homeProfileEnvForLocation(homeDir, customEnv, location, "COPILOT_HOME", [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GH_ENTERPRISE_TOKEN",
    "GITHUB_ENTERPRISE_TOKEN",
    "COPILOT_GITHUB_TOKEN",
    "COPILOT_API_TOKEN",
  ]);
}
