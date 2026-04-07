export * from "./CursorIcon";

import { CursorIcon } from "./CursorIcon";
import {
  registerCommitGenDefaults,
  registerComposerControls,
  registerConflictResolverDefaults,
  registerProviderIcon,
  registerTitleGenDefaults,
} from "../ProviderIcon";
import { withCurrentModel } from "../../thread/threadComposerOptions";

registerProviderIcon("cursor", CursorIcon);
registerCommitGenDefaults("cursor", { label: "Cursor", hint: "Auto", model: "auto", effort: "" });
registerTitleGenDefaults("cursor", { label: "Cursor", hint: "Auto", model: "auto", effort: "" });
registerConflictResolverDefaults("cursor", {
  label: "Cursor",
  hint: "Auto",
  model: "auto",
  effort: "",
});

registerComposerControls("cursor", ({ capabilities, config, isDisabled, onConfigChange }) => [
  {
    options: withCurrentModel(capabilities.models, config.model),
    value: config.model,
    isDisabled,
    onChange: (value: string) => onConfigChange({ model: value }),
  },
]);
