import { z } from "zod";
import { loadedPluginSchema } from "./plugin";
import { mcpOauthBeginResultSchema } from "./mcpServer";
import { pluginNameSchema } from "../plugins/spec/manifest";

export const pluginCatalogSourceSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("git"), url: z.string().min(1), ref: z.string().min(1).optional() })
    .strict(),
  z.object({ type: z.literal("local"), path: z.string().min(1) }).strict(),
]);
export type PluginCatalogSource = z.infer<typeof pluginCatalogSourceSchema>;

export const pluginCatalogEntrySchema = z
  .object({
    name: pluginNameSchema,
    description: z.string(),
    version: z.string().optional(),
    /**
     * Authored marketplace category, preserved verbatim (bounded). Sources use
     * different vocabularies and some publish none; grouping normalizes it and
     * falls back to the source name for catalogs that publish no categories.
     */
    category: z.string().min(1).max(80).optional(),
    source: z.discriminatedUnion("type", [
      z.object({ type: z.literal("path"), path: z.string() }).strict(),
      z
        .object({
          type: z.literal("git"),
          url: z.string(),
          path: z.string(),
          ref: z.string().optional(),
          sha: z.string().optional(),
        })
        .strict(),
      z.object({ type: z.literal("unsupported"), kind: z.string() }).strict(),
    ]),
    /** Capability names, not claims that the package is fully compatible. */
    unavailable: z.array(z.string()),
  })
  .strict();
export type PluginCatalogEntry = z.infer<typeof pluginCatalogEntrySchema>;

export const pluginCatalogSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    source: pluginCatalogSourceSchema,
    revision: z.string(),
    refreshedAt: z.number(),
    entries: z.array(pluginCatalogEntrySchema),
  })
  .strict();
export type PluginCatalogSnapshot = z.infer<typeof pluginCatalogSnapshotSchema>;

// Version 1 belongs to Poracode's installation receipt, not an upstream manifest.
export const pluginInstallationSchema = z
  .object({
    formatVersion: z.literal(1),
    pluginName: pluginNameSchema,
    catalogId: z.string().uuid(),
    catalogName: z.string(),
    catalogSource: pluginCatalogSourceSchema,
    packageSource: pluginCatalogEntrySchema.shape.source,
    sourceLicense: z.object({ path: z.string(), text: z.string() }).strict().optional(),
    entryName: pluginNameSchema,
    revision: z.string(),
    digest: z.string(),
    installedAt: z.number(),
  })
  .strict();
export type PluginInstallation = z.infer<typeof pluginInstallationSchema>;

export const pluginArtworkTargetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("catalog"),
      catalogId: z.string().uuid(),
      entryName: pluginNameSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("plugin"),
      pluginName: pluginNameSchema,
      projectFsPath: z.string().min(1).max(4096).optional(),
    })
    .strict(),
]);
export type PluginArtworkTarget = z.infer<typeof pluginArtworkTargetSchema>;

export const pluginCatalogPayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("artwork"),
      version: z.literal(1),
      target: pluginArtworkTargetSchema,
    })
    .strict(),
  z.object({ action: z.literal("add"), source: pluginCatalogSourceSchema }).strict(),
  z.object({ action: z.literal("refresh"), catalogId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("remove-source"), catalogId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("inspect"),
      catalogId: z.string().uuid(),
      entryName: pluginNameSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(["install", "update"]),
      catalogId: z.string().uuid(),
      entryName: pluginNameSchema,
      reviewDigest: z.string().min(1),
    })
    .strict(),
  z.object({ action: z.literal("remove-package"), pluginName: pluginNameSchema }).strict(),
]);
export type PluginCatalogPayload = z.infer<typeof pluginCatalogPayloadSchema>;
export const pluginCatalogResultSchema = z
  .object({
    artwork: z
      .object({
        version: z.literal(1),
        dataUrl: z
          .string()
          .max(32768)
          .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u)
          .optional(),
      })
      .strict()
      .optional(),
    catalogs: z.array(pluginCatalogSnapshotSchema),
    installations: z.array(pluginInstallationSchema),
    inspection: z
      .object({ plugin: loadedPluginSchema, digest: z.string(), revision: z.string() })
      .strict()
      .optional(),
  })
  .strict();
export type PluginCatalogResult = z.infer<typeof pluginCatalogResultSchema>;

export const pluginAccountSchema = z
  .object({
    id: z.string().uuid(),
    pluginName: pluginNameSchema,
    serverName: z.string().min(1),
    /** User-assigned identity. Never inferred from an unverified JWT. */
    label: z.string().trim().min(1).max(120),
    scopes: z.array(z.string()),
    status: z.enum(["connected", "expired", "disconnected"]),
    selected: z.boolean(),
  })
  .strict();
export type PluginAccount = z.infer<typeof pluginAccountSchema>;
export const pluginAccountsPayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), pluginName: pluginNameSchema }).strict(),
  z
    .object({
      action: z.literal("begin"),
      pluginName: pluginNameSchema,
      serverName: z.string().min(1),
      accountId: z.string().uuid().optional(),
      label: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      action: z.enum(["select", "logout"]),
      pluginName: pluginNameSchema,
      serverName: z.string().min(1),
      accountId: z.string().uuid(),
    })
    .strict(),
]);
export type PluginAccountsPayload = z.infer<typeof pluginAccountsPayloadSchema>;
export const pluginAccountsResultSchema = z
  .object({
    accounts: z.array(pluginAccountSchema),
    accountId: z.string().uuid().optional(),
    authorization: mcpOauthBeginResultSchema.optional(),
  })
  .strict();
export type PluginAccountsResult = z.infer<typeof pluginAccountsResultSchema>;
