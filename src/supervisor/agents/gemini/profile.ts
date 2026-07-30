import type { ProjectLocation } from "@/shared/contracts";
import { homeProfileEnvForLocation, resolveAgentInstanceEnv } from "../homeProfile";

export const resolveGeminiInstanceEnv = resolveAgentInstanceEnv;

export function geminiProfileEnvForLocation(
  homeDir: string | undefined,
  customEnv: Record<string, string> | undefined,
  location: ProjectLocation,
): Record<string, string> | undefined {
  return homeProfileEnvForLocation(homeDir, customEnv, location, "GEMINI_CLI_HOME", [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_GENAI_USE_GCA",
  ]);
}
