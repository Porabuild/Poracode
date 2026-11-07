import { z } from "zod";
import { ACP_GENERIC_KIND_PREFIX, agentInstanceIdSchema } from "./agentInstance";
import { isEncryptedSecret } from "../secretFormat";

export const CUSTOM_ACP_AGENTS_VERSION = 1;
export const customAcpAgentIdSchema = agentInstanceIdSchema.max(
  128 - ACP_GENERIC_KIND_PREFIX.length,
);
const text = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => !value.includes("\0"), "NUL is not supported");
const environmentName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
  .refine((name) => name !== "__proto__");
export const customAcpEnvironmentSchema = z
  .record(
    environmentName,
    z
      .string()
      .max(16_384)
      .refine(
        (value) => !isEncryptedSecret(value),
        "Enter plaintext environment values; stored ciphertext cannot be imported.",
      ),
  )
  .refine((value) => Object.keys(value).length <= 200);
export const customAcpDefinitionSchema = z
  .strictObject({
    binary: text,
    args: z
      .array(
        z
          .string()
          .max(4_096)
          .refine((value) => !value.includes("\0"), "NUL is not supported"),
      )
      .max(128)
      .optional(),
    cwd: z.enum(["project", "fixed"]).default("project"),
    fixedCwd: text.optional(),
    authMode: z.enum(["none", "envVar"]).default("none"),
    authEnvVar: environmentName.optional(),
    capabilities: z
      .strictObject({
        models: z.array(z.string().min(1).max(256)).max(200).optional(),
        modes: z.array(z.string().min(1).max(128)).max(50).optional(),
      })
      .optional(),
  })
  .refine(
    (value) => value.cwd !== "fixed" || value.fixedCwd !== undefined,
    "Fixed cwd requires fixedCwd",
  )
  .refine(
    (value) => value.authMode !== "envVar" || value.authEnvVar !== undefined,
    "Environment authentication requires authEnvVar",
  );
const identity = { version: z.literal(CUSTOM_ACP_AGENTS_VERSION) };
const target = { id: customAcpAgentIdSchema };
const revision = z.string().regex(/^[a-f0-9]{64}$/u);
const addition = {
  ...target,
  displayName: z.string().min(1).max(120),
  definition: customAcpDefinitionSchema,
};
export const customAcpAgentCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...identity, action: z.literal("list") }),
  z.strictObject({ ...identity, action: z.literal("inspect"), ...target }),
  z.strictObject({
    ...identity,
    action: z.literal("check-add"),
    ...addition,
    environmentNames: z.array(environmentName).max(200),
  }),
  z.strictObject({
    ...identity,
    action: z.literal("add"),
    ...addition,
    environment: customAcpEnvironmentSchema.optional(),
  }),
  z.strictObject({
    ...identity,
    action: z.literal("configure"),
    ...target,
    expectedRevision: revision,
    displayName: z.string().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    definition: customAcpDefinitionSchema.optional(),
    environment: customAcpEnvironmentSchema.optional(),
  }),
  z.strictObject({
    ...identity,
    action: z.literal("remove"),
    ...target,
    expectedRevision: revision,
  }),
]);
export type CustomAcpAgentCommand = z.infer<typeof customAcpAgentCommandSchema>;
export const customAcpAgentSummarySchema = z.strictObject({
  ...target,
  kind: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  revision,
  command: z.strictObject({
    binary: z.string().min(1),
    argumentCount: z.int().nonnegative(),
    cwd: z.enum(["project", "fixed"]),
    fixedCwd: z.string().optional(),
  }),
  environmentNames: z.array(z.string()),
  authMode: z.enum(["none", "envVar"]),
  authEnvVar: z.string().optional(),
  models: z.array(z.string()),
});
export const customAcpAgentResultSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...identity,
    scope: z.literal("custom-native-acp"),
    action: z.literal("list"),
    agents: z.array(customAcpAgentSummarySchema),
  }),
  z.strictObject({
    ...identity,
    scope: z.literal("custom-native-acp"),
    action: z.enum(["inspect", "add", "configure"]),
    agent: customAcpAgentSummarySchema,
  }),
  z.strictObject({
    ...identity,
    scope: z.literal("custom-native-acp"),
    action: z.literal("check-add"),
    ...target,
    checked: z.literal(true),
  }),
  z.strictObject({
    ...identity,
    scope: z.literal("custom-native-acp"),
    action: z.literal("remove"),
    ...target,
    removed: z.literal(true),
  }),
]);
export type CustomAcpAgentResult = z.infer<typeof customAcpAgentResultSchema>;
