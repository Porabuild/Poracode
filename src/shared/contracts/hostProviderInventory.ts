import { z } from "zod";
import { agentStatusSchema } from "./agent";

export const HOST_PROVIDER_INVENTORY_FORMAT_VERSION = 1;
export const hostProviderInventorySchema = z.strictObject({
  formatVersion: z.literal(HOST_PROVIDER_INVENTORY_FORMAT_VERSION),
  environment: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("native") }),
    z.strictObject({ kind: z.literal("wsl"), distro: z.string().min(1).max(200) }),
  ]),
  observation: z.discriminatedUnion("source", [
    z.strictObject({
      source: z.literal("saved-cache"),
      state: z.enum(["available", "missing", "invalid", "incompatible", "unavailable"]),
      version: z.number().int().positive().nullable(),
    }),
    z.strictObject({ source: z.literal("refresh") }),
  ]),
  providers: z.array(
    agentStatusSchema
      .pick({
        kind: true,
        label: true,
        installed: true,
        version: true,
        envKind: true,
        envDistro: true,
        authState: true,
        presentationAuthStates: true,
        providerMetadata: true,
      })
      .extend({ runtimes: z.array(z.string()) })
      .strict(),
  ),
  configurationScope: z.literal("host"),
  profiles: z.array(
    z.strictObject({
      id: z.string(),
      driver: z.string(),
      displayName: z.string(),
      enabled: z.boolean(),
      environmentNames: z.array(z.string()),
    }),
  ),
});
export type HostProviderInventory = z.infer<typeof hostProviderInventorySchema>;
