export * from "./CodexStatusIcon";

import { CodexStatusIcon } from "./CodexStatusIcon";
import {
  registerCommitGenDefaults,
  registerModelLabels,
  registerProviderIcon,
} from "../ProviderIcon";

registerProviderIcon("codex", CodexStatusIcon);
registerModelLabels("codex", (id) =>
  id.replace(/^gpt-/i, "").replace(/\b\w/g, (c) => c.toUpperCase()),
);
registerCommitGenDefaults("codex", { model: "gpt-5.4-mini", effort: "low" });
