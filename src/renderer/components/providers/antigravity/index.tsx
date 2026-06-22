export * from "./AntigravityIcon";

import { AntigravityIcon } from "./AntigravityIcon";
import { standardPlanApprovalControls } from "../composerControlBuilders";
import {
  registerComposerControls,
  registerProviderIcon,
  registerProviderLabel,
} from "../ProviderIcon";

registerProviderIcon("antigravity", AntigravityIcon);
registerProviderLabel("antigravity", "Antigravity");

registerComposerControls("antigravity", (input) => standardPlanApprovalControls(input));
