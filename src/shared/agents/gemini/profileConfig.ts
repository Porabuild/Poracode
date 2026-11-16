import { parseGeminiProfileInstanceConfig } from "../../contracts/agentInstance";

export const geminiProfileDriver = {
  driver: "gemini",
  validateConfig: parseGeminiProfileInstanceConfig,
} as const;
