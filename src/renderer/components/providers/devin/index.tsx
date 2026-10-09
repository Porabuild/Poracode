export * from "./DevinIcon";

import { registerModelDescriptionFormatter } from "../modelDescription";
import { formatDevinModelPricing } from "./modelPricing";
import { DevinIcon } from "./DevinIcon";
import providerManifest from "./manifest";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import { registerProviderIcon } from "../ProviderIcon";
import { registerProviderSessionControls } from "../providerSessionControls";
import { registerComposerControls, registerConfigNormalizer } from "../providerComposer";
import { registerCommitGenDefaults } from "../commitGen";
import { registerConflictResolverDefaults } from "../conflictResolver";
import { registerTitleGenDefaults } from "../titleGen";
import { DevinSessionControls } from "./liveSessionControls";
import { modelFamilySelectorControls } from "../modelFamilyControls";
import { registerPrimaryModelChoices } from "../modelPickerLayout";
import { projectModelFamilies } from "@/shared/modelFamilySelection";
import { devinModelFamilyPresentation } from "./modelFamilyPresentation";

const PROVIDER_KIND = providerManifest.kind;

registerProviderIcon(PROVIDER_KIND, DevinIcon);
registerModelDescriptionFormatter(PROVIDER_KIND, formatDevinModelPricing);
registerPrimaryModelChoices(PROVIDER_KIND, (capabilities) => [
  ...capabilities.models.filter((model) => model.id === "adaptive").map((model) => model.id),
  ...projectModelFamilies(capabilities)
    .filter((family) => family.label === "Fusion")
    .map((family) => family.model),
]);

const DEVIN_UTILITY_DEFAULTS = {
  label: "Devin",
  hint: "SWE-1.6 Fast",
  model: "swe-1-6-fast",
  effort: "",
};
registerCommitGenDefaults(PROVIDER_KIND, DEVIN_UTILITY_DEFAULTS);
registerTitleGenDefaults(PROVIDER_KIND, DEVIN_UTILITY_DEFAULTS);
registerConflictResolverDefaults(PROVIDER_KIND, DEVIN_UTILITY_DEFAULTS);

// GUI keeps Poracode's established Bypass default only for threads where the
// user never picked a policy; an explicit saved choice (any non-empty policy)
// is left alone so every negotiated mode — Code, Smart, Ask, Plan, Bypass —
// stays usable (plan G03). The draft itself seeds Bypass for fresh GUI
// threads through `presentationCapabilities.gui.defaultApprovalPolicy`.
registerConfigNormalizer(PROVIDER_KIND, ({ config, presentationMode }) =>
  presentationMode === "gui" && !config.approvalPolicy ? { approvalPolicy: "bypass" } : {},
);
// Pass the provider's declared capabilities through unfiltered: the mode
// toggle plus the full approval-policy dropdown on both presentation
// surfaces. The session reconciles the chosen value against what the live
// ACP session actually advertises. The family selector menus (Lead/Sidekick)
// are component-driven the same way: they render only when the surface's
// resolved capabilities carry a `modelFamilies` relation and the current
// model is one of its members.
registerComposerControls(PROVIDER_KIND, (input) => [
  ...standardPlanApprovalControls(input),
  ...modelFamilySelectorControls(input, devinModelFamilyPresentation),
]);

// Useful extra GUI actions (command revision and rules) use the shared add menu.
// The component itself is inventory-driven: it renders only what the
// thread's current session actually declares, so registration alone
// advertises nothing.
registerProviderSessionControls(PROVIDER_KIND, DevinSessionControls);
