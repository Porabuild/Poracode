import type { ListPluginsResult } from "../../contracts";
import { defineNoArgProcedure } from "../core";

/**
 * Agent Plugins packages are discovered on disk by the supervisor, so the
 * renderer reads them over IPC rather than importing a static catalog.
 */
export const pluginProcedures = {
  listPlugins: defineNoArgProcedure<ListPluginsResult, "supervisor">("listPlugins", "supervisor"),
  /** Rescans the plugin roots, picking up packages added since the last read. */
  refreshPlugins: defineNoArgProcedure<ListPluginsResult, "supervisor">(
    "refreshPlugins",
    "supervisor",
  ),
  /** Opens the writable plugin directory so the user can drop a package in. */
  openPluginsFolder: defineNoArgProcedure<void, "main-local">("openPluginsFolder", "main-local"),
} as const;
