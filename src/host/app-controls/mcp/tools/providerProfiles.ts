import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { applyCreateProfile, applyProfileEnvironment } from "@/host/sharedSettingsFile";
import { assertAgentProfileDependencies } from "@/shared/agentProfileDependencies";
import {
  AGENT_INSTANCE_REMOVAL_FIELDS,
  removeAgentInstanceSettings,
} from "@/shared/agentInstanceSettings";
import {
  AGENT_PROFILE_DRIVERS,
  agentProfileDriver,
  agentProfileKind,
  createProfilePayloadSchema,
  isAgentProfileDriver,
  setProfileEnvironmentPayloadSchema,
  type AgentInstanceConfig,
} from "@/shared/contracts";
import { isEncryptedSecret } from "@/shared/secretFormat";
import type { SharedSettings } from "@/shared/settings";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { catalogPageFields, pageCatalog } from "./catalogPage";
import type { AppControlsToolContext } from "./types";

const revisionKey = randomBytes(32);
const profileId = setProfileEnvironmentPayloadSchema.shape.instanceId;
const target = {
  instanceId: profileId,
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
};
const environmentSchema = setProfileEnvironmentPayloadSchema.shape.environment.meta({
  writeOnly: true,
});

function revisionOf(profile: AgentInstanceConfig): string {
  return createHmac("sha256", revisionKey).update(JSON.stringify(profile)).digest("hex");
}

function readProfile(settings: SharedSettings, id: string, revision?: string): AgentInstanceConfig {
  const profile = Object.hasOwn(settings.agentInstances, id)
    ? settings.agentInstances[id]
    : undefined;
  if (!profile || !isAgentProfileDriver(profile.driver))
    throw new Error("Saved provider profile not found.");
  if (
    revision &&
    !timingSafeEqual(Buffer.from(revision, "hex"), Buffer.from(revisionOf(profile), "hex"))
  ) {
    throw new Error("The provider profile changed. Read it again before editing.");
  }
  return profile;
}

function publicProfile(profile: AgentInstanceConfig) {
  return {
    instanceId: profile.id,
    driver: profile.driver,
    agentKind: agentProfileKind(profile.driver, profile.id),
    displayName: profile.displayName ?? profile.id,
    enabled: profile.enabled !== false,
    environment: Object.entries(profile.environment ?? {}).map(([name, { sensitive }]) => ({
      name,
      sensitive: sensitive === true,
    })),
    revision: revisionOf(profile),
  };
}

function authorizeEnvironment(
  ctx: AppControlsToolContext,
  driver: string,
  environment: z.output<typeof environmentSchema>,
): void {
  const credential = agentProfileDriver(driver)?.credentialEnvVar;
  const entries = Object.entries(environment);
  if (entries.some(([, { value }]) => isEncryptedSecret(value))) {
    throw new Error("Supply new environment values, or omit keys that should be preserved.");
  }
  if (
    entries.some(
      ([name, { value, sensitive }]) => value && (sensitive || name.trim() === credential),
    )
  ) {
    ctx.assertCanPersistSecrets();
  }
}

const manageProfiles = defineAppControlTool({
  name: "manage_provider_profiles",
  description:
    "Manage saved provider profiles. drivers lists supported profile types. list and get return profile IDs, enablement, environment names and a revision. create takes a driver, id and displayName plus optional configuration. update edits metadata or configuration. set_environment patches exact variable names and can remove names. Environment values are write-only. For updates and removal, supply the latest revision from list or get. Change or remove profiles only at the user's request.",
  input: z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("drivers") }),
    z.strictObject({
      action: z.literal("list"),
      ...catalogPageFields,
      limit: catalogPageFields.limit.unwrap().default(30),
    }),
    z.strictObject({ action: z.literal("get"), instanceId: profileId }),
    createProfilePayloadSchema
      .extend({
        action: z.literal("create"),
        environment: environmentSchema.optional(),
        config: z.json().optional(),
      })
      .strict(),
    z.strictObject({
      action: z.literal("update"),
      ...target,
      displayName: createProfilePayloadSchema.shape.displayName.trim().min(1).optional(),
      enabled: z.boolean().optional(),
      config: z.json().optional(),
    }),
    z.strictObject({
      action: z.literal("set_environment"),
      ...target,
      environment: environmentSchema.optional(),
      remove: z.array(z.string().trim().min(1).max(200)).optional(),
    }),
    z.strictObject({ action: z.literal("remove"), ...target }),
  ]),
  run: async (input, ctx) => {
    if (input.action === "drivers") {
      return {
        drivers: AGENT_PROFILE_DRIVERS.map(({ driver, credentialEnvVar }) => ({
          driver,
          credentialEnvironmentName: credentialEnvVar ?? null,
        })),
      };
    }
    if (input.action === "list") {
      const profiles = Object.values(ctx.settings.read().agentInstances).filter(({ driver }) =>
        isAgentProfileDriver(driver),
      );
      const { rows, ...page } = pageCatalog(profiles, input.offset, input.limit);
      return { ...page, profiles: rows.map(publicProfile) };
    }
    if (input.action === "get")
      return publicProfile(readProfile(ctx.settings.read(), input.instanceId));
    if (input.action === "remove") {
      if (!ctx.settings.editFields) throw new Error("Profile removal is unavailable on this host.");
      const result = await ctx.settings.editFields(AGENT_INSTANCE_REMOVAL_FIELDS, (current) => {
        const profile = readProfile(current, input.instanceId, input.revision);
        const next = removeAgentInstanceSettings(current, profile);
        assertAgentProfileDependencies(current.agentInstances, next.agentInstances);
        return next;
      });
      if (result.status !== "committed")
        throw new Error(`Profile removal was not committed (${result.status}).`);
      return { removed: input.instanceId };
    }
    const result = await ctx.settings.editField("agentInstances", (current) => {
      let next: SharedSettings["agentInstances"];
      if (input.action === "create") {
        authorizeEnvironment(ctx, input.driver, input.environment ?? {});
        agentProfileDriver(input.driver)?.validateConfig?.(input.config);
        const { action: _action, ...payload } = input;
        next = applyCreateProfile(current, payload, "").settings.agentInstances;
      } else {
        const profile = readProfile(current, input.instanceId, input.revision);
        if (input.action === "set_environment") {
          const updates = input.environment ?? {};
          authorizeEnvironment(ctx, profile.driver, updates);
          const removals = new Set(input.remove);
          const environment = Object.fromEntries(
            Object.entries(profile.environment ?? {}).filter(([name]) => !removals.has(name)),
          );
          next = applyProfileEnvironment(
            current,
            {
              instanceId: profile.id,
              environment: { ...environment, ...updates },
            },
            "",
          ).settings.agentInstances;
        } else {
          if (input.config !== undefined)
            agentProfileDriver(profile.driver)?.validateConfig?.(input.config);
          next = {
            ...current.agentInstances,
            [profile.id]: {
              ...profile,
              ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
              ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
              ...(input.config !== undefined ? { config: input.config } : {}),
            },
          };
        }
      }
      assertAgentProfileDependencies(current.agentInstances, next);
      return next;
    });
    if (result.status !== "committed")
      throw new Error(`Profile save was not committed (${result.status}).`);
    return { saved: true, instanceId: input.action === "create" ? input.id : input.instanceId };
  },
});

export const providerProfileTools = appControlToolDomain(manageProfiles);
