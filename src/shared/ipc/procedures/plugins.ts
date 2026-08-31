import {
  listPluginsPayloadSchema,
  type ListPluginsPayload,
  type ListPluginsResult,
} from "../../contracts";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

/**
 * Agent Plugins packages are discovered on disk by the supervisor, so the
 * renderer reads them over IPC rather than importing a static catalog.
 */
export const pluginProcedures = {
  listPlugins: definePayloadProcedure<ListPluginsPayload, ListPluginsResult, "supervisor">(
    "listPlugins",
    "supervisor",
    listPluginsPayloadSchema,
  ),
  /** Rescans the plugin roots, picking up packages added since the last read. */
  refreshPlugins: definePayloadProcedure<ListPluginsPayload, ListPluginsResult, "supervisor">(
    "refreshPlugins",
    "supervisor",
    listPluginsPayloadSchema,
  ),
  /** Opens the writable plugin directory so the user can drop a package in. */
  openPluginsFolder: defineNoArgProcedure<void, "main-local">("openPluginsFolder", "main-local"),
} as const;
