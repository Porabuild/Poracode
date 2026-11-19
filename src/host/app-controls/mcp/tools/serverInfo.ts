import { APP_CONTROLS_PLUGIN_VERSION } from "@/shared/plugins/builtInCoreSkills";

/** Single source for the app-controls MCP server identity (advertised + reported). */
export const APP_CONTROLS_MCP_SERVER_INFO = {
  name: "poracode",
  // Add host actions and optional inputs while retaining the existing MCP protocol and legacy inputs.
  version: APP_CONTROLS_PLUGIN_VERSION,
} as const;
