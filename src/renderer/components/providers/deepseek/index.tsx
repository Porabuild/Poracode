import { DeepSeekIcon } from "./DeepSeekIcon";
import providerManifest from "./manifest";
import { buildAcpComposerControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerTitleGenDefaults } from "../titleGen";
import { registerConflictResolverDefaults } from "../conflictResolver";

registerProviderIcon(providerManifest.kind, DeepSeekIcon);
registerComposerControls(providerManifest.kind, buildAcpComposerControls);

const utilityDefaults = {
  label: "DeepSeek Harness",
  hint: "DeepSeek V4.1 Flash",
  model: DEEPSEEK_ACCOUNT_FLASH_MODEL_ID,
  effort: "low",
};
registerCommitGenDefaults(providerManifest.kind, utilityDefaults);
registerTitleGenDefaults(providerManifest.kind, utilityDefaults);
registerConflictResolverDefaults(providerManifest.kind, utilityDefaults);
import { DEEPSEEK_ACCOUNT_FLASH_MODEL_ID } from "@/shared/agents/deepseekModels";
