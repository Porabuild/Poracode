import { createProviderIcon } from "../common/createProviderIcon";

const OPENCODE_FRAME_PATH = "M0 0 H240 V300 H0 Z M60 60 H180 V240 H60 Z";
// Official OpenCode brand mark: frame plus reduced-opacity inner panel so the
// two-tone contrast survives the shared single-color provider icon system.
const OPENCODE_PANEL_PATH = "M60 120 H180 V240 H60 Z";

export const OpenCodeIcon = createProviderIcon({
  cssPrefix: "poracode-opencode-icon",
  path: OPENCODE_FRAME_PATH,
  secondaryPath: OPENCODE_PANEL_PATH,
  fillRule: "evenodd",
  viewBox: "0 0 240 300",
});
