import { z } from "zod";
import { pluginNameSchema } from "../plugins/spec/manifest";
import { pluginCatalogSourceSchema } from "./pluginCatalog";
import { publicPluginRepository } from "../plugins/marketplaces";

export const HOST_ADMIN_CATALOG_FORMAT_VERSION = 1;
const catalogId = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const entry = { catalogId, entryName: pluginNameSchema };
const publicSource = pluginCatalogSourceSchema.refine((source) => {
  if (source.type === "local") return true;
  try {
    publicPluginRepository(source.url);
    return true;
  } catch {
    return false;
  }
}, "Catalog repositories require credential-free HTTPS without query or fragment.");
export const hostAdminCatalogCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("catalogs-list") }),
  z.strictObject({ action: z.literal("catalogs-add"), source: publicSource }),
  z.strictObject({ action: z.literal("catalogs-inspect"), catalogId }),
  z.strictObject({ action: z.literal("catalogs-refresh"), catalogId }),
  z.strictObject({ action: z.literal("catalogs-remove"), catalogId }),
  z.strictObject({ action: z.literal("package-inspect"), ...entry }),
  z.strictObject({
    action: z.literal("package-install"),
    ...entry,
    reviewDigest: digest,
  }),
  z.strictObject({
    action: z.literal("package-update"),
    ...entry,
    reviewDigest: digest,
  }),
  z.strictObject({ action: z.literal("package-remove"), pluginName: pluginNameSchema }),
  z.strictObject({
    action: z.literal("plugin-enabled"),
    pluginName: pluginNameSchema,
    enabled: z.boolean(),
  }),
]);
export type HostAdminCatalogCommand = z.infer<typeof hostAdminCatalogCommandSchema>;
const catalogEntry = z.strictObject({
  name: pluginNameSchema,
  description: z.string(),
  version: z.string().nullable(),
  unavailable: z.array(z.string()),
});
const installation = z.strictObject({
  pluginName: pluginNameSchema,
  catalogId,
  catalogName: z.string(),
  entryName: pluginNameSchema,
  revision: z.string(),
  digest,
  installedAt: z.number(),
  enabled: z.boolean().nullable(),
});
export const hostAdminCatalogResultSchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_CATALOG_FORMAT_VERSION),
  scope: z.literal("global"),
  command: hostAdminCatalogCommandSchema,
  catalogs: z.array(
    z.strictObject({
      id: catalogId,
      name: z.string(),
      source: publicSource,
      revision: z.string(),
      refreshedAt: z.number(),
      entryCount: z.number().int().nonnegative(),
      entries: z.array(catalogEntry).optional(),
    }),
  ),
  installations: z.array(installation),
  inspection: z
    .strictObject({
      catalogId,
      entryName: pluginNameSchema,
      digest,
      revision: z.string(),
      name: pluginNameSchema,
      version: z.string().nullable(),
      hostSupported: z.boolean(),
      defaultEnabled: z.boolean(),
      skills: z.array(z.string()),
      mcpServers: z.array(
        z.strictObject({
          name: z.string(),
          transport: z.enum(["stdio", "sse", "streamable-http"]),
          environmentNames: z.array(z.string()),
          headerNames: z.array(z.string()),
        }),
      ),
      diagnostics: z.array(
        z.strictObject({ severity: z.enum(["error", "warning"]), code: z.string() }),
      ),
    })
    .optional(),
  pluginState: z.strictObject({ pluginName: pluginNameSchema, enabled: z.boolean() }).optional(),
});
export type HostAdminCatalogResult = z.infer<typeof hostAdminCatalogResultSchema>;
