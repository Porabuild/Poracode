import { DeepSeekIcon } from "./DeepSeekIcon";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import providerManifest from "./manifest";
import { approvalPolicyDropdown, resolveComposerApprovalPolicy } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls, registerConfigNormalizer } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerTitleGenDefaults } from "../titleGen";
import { registerConflictResolverDefaults } from "../conflictResolver";

registerProviderIcon(providerManifest.kind, DeepSeekIcon);
registerConfigNormalizer(providerManifest.kind, ({ config }) =>
  config.approvalPolicy === "never" ? { approvalPolicy: "auto-review" } : {},
);
registerComposerControls(
  providerManifest.kind,
  ({ capabilities, config, isDisabled, onConfigChange }) => [
    approvalPolicyDropdown({
      policies: capabilities.approvalPolicies.map((policy) => ({
        ...policy,
        label:
          policy.id === "bypassPermissions"
            ? i18n._(msg`Bypass Permissions`)
            : policy.id === "auto-review"
              ? i18n._(msg`Auto Review`)
              : i18n._(msg`Default`),
      })),
      currentPolicy: resolveComposerApprovalPolicy(capabilities, config),
      isDisabled,
      onChange: (approvalPolicy) => onConfigChange({ approvalPolicy }),
    }),
  ],
);

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
