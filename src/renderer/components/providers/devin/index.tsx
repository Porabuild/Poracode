export * from "./DevinIcon";

import { registerModelDescriptionFormatter } from "../modelDescription";
import { formatDevinModelPricing } from "./modelPricing";
import { DevinIcon } from "./DevinIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerComposerControls, registerConfigNormalizer } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, DevinIcon);
registerModelDescriptionFormatter(PROVIDER_KIND, formatDevinModelPricing);

const DEVIN_UTILITY_DEFAULTS = {
  label: "Devin",
  hint: "SWE-1.6 Fast",
  model: "swe-1-6-fast",
  effort: "",
};
registerCommitGenDefaults(PROVIDER_KIND, DEVIN_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, DEVIN_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, DEVIN_UTILITY_DEFAULTS);
registerConfigNormalizer(PROVIDER_KIND, ({ config, presentationMode }) =>
  presentationMode === "gui" && config.approvalPolicy !== "bypass"
    ? { approvalPolicy: "bypass" }
    : {},
);
registerComposerControls(PROVIDER_KIND, (input) =>
  standardPlanApprovalControls(
    input.presentationMode === "gui"
      ? {
          ...input,
          capabilities: {
            ...input.capabilities,
            approvalPolicies: input.capabilities.approvalPolicies.filter(
              (policy) => policy.id === "bypass",
            ),
          },
        }
      : input,
  ),
);
