import type { ProjectLocation } from "@/shared/contracts";
import {
  homeProfileEnvForLocation,
  resolveAgentInstanceEnv,
  resolveHomeProfilePathForLocation,
} from "../homeProfile";

export const resolveGrokHomeForLocation = resolveHomeProfilePathForLocation;
export const resolveGrokInstanceEnv = resolveAgentInstanceEnv;

export function grokProfileEnvForLocation(
  homeDir: string | undefined,
  customEnv: Record<string, string> | undefined,
  location: ProjectLocation,
): Record<string, string> | undefined {
  return homeProfileEnvForLocation(homeDir, customEnv, location, "GROK_HOME", [
    "GROK_API_KEY",
    "XAI_API_KEY",
  ]);
}
