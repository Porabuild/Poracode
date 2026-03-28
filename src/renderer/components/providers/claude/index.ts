export * from "./ClaudeIcon";

import { ClaudeIcon } from "./ClaudeIcon";
import {
  registerCommitGenDefaults,
  registerModelLabels,
  registerProviderIcon,
} from "../ProviderIcon";

registerProviderIcon("claude", ClaudeIcon);
registerModelLabels("claude", (id) => {
  const labels: Record<string, string> = { "claude-opus-4-6[1m]": "Opus 1M" };
  return labels[id] ?? id.replace(/\b\w/g, (c) => c.toUpperCase());
});
registerCommitGenDefaults("claude", { model: "haiku", effort: "" });
