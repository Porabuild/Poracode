export * from "./ZaiIcon";

import { ZaiIcon } from "./ZaiIcon";
import { registerProviderIcon } from "../ProviderIcon";

// z.ai is a usage-only provider (no chat runtime), so it registers just its icon
// for the usage card — deliberately NOT a provider label, which would list it as
// a supported chat agent in the discovery screen.
registerProviderIcon("zai", ZaiIcon);
