export * from "./FactoryIcon";

import { FactoryIcon } from "./FactoryIcon";
import { registerProviderIcon, registerProviderLabel } from "../ProviderIcon";

// Factory's "Droid" is a runtime-registered ACP agent (`acp-generic`), so this
// module only supplies the renderer presentation for its usage tile — the icon
// and label keyed by the usage provider id ("factory"). The chat-surface
// registrations (composer controls, utility defaults) belong to the agent
// adapter, not here.
registerProviderIcon("factory", FactoryIcon);
registerProviderLabel("factory", "Droid");
