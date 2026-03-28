export * from "./GeminiIcon";

import { GeminiIcon } from "./GeminiIcon";
import {
  registerCommitGenDefaults,
  registerModelLabels,
  registerProviderIcon,
} from "../ProviderIcon";

registerProviderIcon("gemini", GeminiIcon);
const GEMINI_LABELS: Record<string, string> = {
  auto: "Auto (Gemini 3)",
  "auto-gemini-2.5": "Auto (Gemini 2.5)",
};

registerModelLabels(
  "gemini",
  (id) =>
    GEMINI_LABELS[id] ??
    id
      .replace(/^gemini-/i, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
);
registerCommitGenDefaults("gemini", { model: "gemini-2.5-flash", effort: "" });
