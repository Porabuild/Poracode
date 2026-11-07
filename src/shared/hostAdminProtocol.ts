import { z } from "zod";
import { agentDriverKindSchema, agentInstanceIdSchema } from "./contracts/agentInstance";
import { createProfilePayloadSchema } from "./contracts/agentProfiles";
import { remoteAccessScopeSchema } from "./remote/protocol/core";
import { pluginSourceSchema } from "./contracts/plugin";
import { pluginAccountSchema } from "./contracts/pluginCatalog";
import { hostAdminCatalogCommandSchema } from "./contracts/hostPluginCatalog";
import { sessionExportCommandSchema } from "./contracts/sessionExport";
import { hostProjectCommandSchema } from "./contracts/hostProjects";
import {
  hostRunCommandSchema,
  hostRunPreparationCommandSchema,
  hostRunResumePreparationCommandSchema,
  hostRunDirectoryCommandSchema,
  hostRunDirectoryPreparationCommandSchema,
  hostRunFilesCommandSchema,
  hostRunFilesPreparationCommandSchema,
  hostRunFilesResumeCommandSchema,
  hostRunFilesDirectoryCommandSchema,
  hostRunInteractiveCommandSchema,
} from "./contracts/hostRun";
import { customAcpAgentCommandSchema } from "./contracts/customAcpAgents";
import {
  isValidMcpServerName,
  mcpServerSchema,
  mcpStdioTransportSchema,
  mcpHttpTransportSchema,
  mcpSseTransportSchema,
} from "./contracts/mcpServer";

// Additive local-control operation. Old v2 owners reject `admin`; existing
// describe/status/shutdown messages and the closed capabilities stay unchanged.
export const HOST_ADMIN_VERSION = 1;
// Version 1 stays closed. New setup controls require version 2; old owners
// refuse that envelope before effects, while existing commands keep using v1.
export const HOST_ADMIN_V2_VERSION = 2;
// Interactive edits prepare a host-lifetime profile revision before secret
// entry. V1/v2 stay closed; older owners refuse v3 before collecting values.
export const HOST_ADMIN_V3_VERSION = 3;
// Integration inventories use curated public projections, never raw package or
// MCP configuration. Earlier closed command versions remain unchanged.
export const HOST_ADMIN_V4_VERSION = 4;
// Profile onboarding checks target the running owner's registry before hidden
// input. Earlier closed commands retain their existing versions and schemas.
export const HOST_ADMIN_V5_VERSION = 5;
// Saved user MCP changes are separate from inventory and credential lifecycle.
// Earlier closed command versions retain their original request shapes.
export const HOST_ADMIN_V6_VERSION = 6;
// Full definitions require explicit consent and revision custody. Older command
// and acknowledgement schemas stay closed; no internal auth selector is admitted.
export const HOST_ADMIN_V7_VERSION = 7;
// Persisted-thread administration is local-only. Earlier closed schemas stay
// unchanged; unsupported owners refuse v8 before a runtime can be retired.
export const HOST_ADMIN_V8_VERSION = 8;
// Guided MCP creation must qualify the owner/storage before hidden input.
// Existing definitions still commit through their unchanged v7 writer.
export const HOST_ADMIN_V9_VERSION = 9;
// Account metadata and explicit credential changes are local-only. Earlier
// closed commands keep their versions; no generic credential key is admitted.
export const HOST_ADMIN_V10_VERSION = 10;
// Controlled integration login has its own closed version; v1-v10 do not grow.
export const HOST_ADMIN_V11_VERSION = 11;
// Catalog/package administration is distinct; v1-v11 remain closed unchanged.
export const HOST_ADMIN_V12_VERSION = 12;
// Streaming snapshot exports are local-only; v1-v12 remain closed unchanged.
export const HOST_ADMIN_V13_VERSION = 13;
// Project registration/inventory is local-only; v1-v13 remain closed unchanged.
export const HOST_ADMIN_V14_VERSION = 14;
// Held CLI runs have their own caller/retirement lifetime; v1-v14 stay closed.
export const HOST_ADMIN_V15_VERSION = 15;
// Custom native ACP registrations are distinct from saved built-in profiles.
export const HOST_ADMIN_V16_VERSION = 16;
// Passive provider observations and explicit refresh use a distinct closed
// command. V1-v16 retain their schemas and behavior, including v1 discovery.
export const HOST_ADMIN_V17_VERSION = 17;
// Saved session metadata changes are local-only; v1-v17 stay closed unchanged.
export const HOST_ADMIN_V18_VERSION = 18;
// Exact saved-session continuation is distinct; v1-v18 stay closed unchanged.
export const HOST_ADMIN_V19_VERSION = 19;
// Directory registration and run preparation share one owner/version gate.
// V1-v19 remain closed unchanged; unsupported owners refuse before registration.
export const HOST_ADMIN_V20_VERSION = 20;
// File preparation/custody is distinct; v1-v20 and their reply bodies stay unchanged.
export const HOST_ADMIN_V21_VERSION = 21;
// Explicit run interaction is local-only; all prior envelopes remain closed.
export const HOST_ADMIN_V22_VERSION = 22;
// Qualify exact supervisor request-incarnation custody before interactive effects.
export const HOST_ADMIN_V23_VERSION = 23;
// Tool activity is an opt-in extension; v1-v23 callers retain the old event stream.
export const HOST_ADMIN_V24_VERSION = 24;

const hostRunToolEventsPreparationCommandSchema = z.union([
  hostRunPreparationCommandSchema,
  hostRunResumePreparationCommandSchema,
  hostRunDirectoryPreparationCommandSchema,
  hostRunFilesPreparationCommandSchema,
  hostRunFilesResumeCommandSchema,
  hostRunFilesDirectoryCommandSchema,
  hostRunInteractiveCommandSchema.options[0],
]);
export const hostRunToolEventsCommandSchema = z.strictObject({
  action: z.literal("run-tool-events-prepare"),
  command: hostRunToolEventsPreparationCommandSchema,
});
export const hostAdminCustomAcpCommandSchema = z.strictObject({
  action: z.literal("custom-providers"),
  command: customAcpAgentCommandSchema,
});
export const HOST_ADMIN_INTEGRATION_ACCOUNT_FORMAT_VERSION = 1;
export const HOST_ADMIN_SESSION_FORMAT_VERSION = 1;
// Printed JSON inventory bodies outlive the local wire envelope in scripts.
export const HOST_ADMIN_INVENTORY_FORMAT_VERSION = 1;
// Change acknowledgements are a separate script-facing body from inventories.
export const HOST_ADMIN_MCP_CHANGE_FORMAT_VERSION = 1;
// New definition-write tags use format 2; v6 acknowledgements remain format 1.
export const HOST_ADMIN_MCP_DEFINITION_FORMAT_VERSION = 2;
export const HOST_ADMIN_PAIRING_DEFAULT_TTL_MS = 10 * 60 * 1_000;
export const HOST_ADMIN_PAIRING_MAX_TTL_MS = 24 * 60 * 60 * 1_000;
export const HOST_ADMIN_MAX_REQUEST_BYTES = 65_536;
export const HOST_ADMIN_MAX_RESPONSE_BYTES = 1_048_576;
export const HOST_ADMIN_TIMEOUT_MS = 600_000;

const target = { wslDistro: z.string().min(1).max(200).optional() };
export const hostAdminProviderInventoryCommandSchema = z.strictObject({
  action: z.literal("providers-inventory"),
  refresh: z.boolean(),
  ...target,
});
const agent = {
  agentKind: z.string().min(1).max(128),
  ...target,
  runtime: z.string().min(1).max(128).optional(),
};
const environment = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u), z.string().max(16_384));
export const hostAdminCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("providers-list"), ...target }),
  z.strictObject({ action: z.literal("providers-catalog") }),
  z.strictObject({ action: z.literal("providers-install"), agentId: z.string().min(1), ...target }),
  z.strictObject({ action: z.literal("providers-add"), profile: createProfilePayloadSchema }),
  z.strictObject({
    action: z.literal("providers-configure"),
    instanceId: agentInstanceIdSchema,
    displayName: z.string().trim().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    environment: environment.optional(),
    config: z.json().optional(),
  }),
  z.strictObject({ action: z.literal("auth-methods"), ...agent }),
  z.strictObject({
    action: z.literal("auth-login"),
    ...agent,
    methodId: z.string().min(1).optional(),
  }),
  z.strictObject({
    action: z.literal("auth-logout"),
    ...agent,
    credentialId: z.string().min(1).optional(),
  }),
  z.strictObject({
    action: z.literal("auth-read"),
    sessionId: z.uuid(),
    cursor: z.int().nonnegative(),
  }),
  z.strictObject({
    action: z.literal("auth-write"),
    sessionId: z.uuid(),
    data: z.string().max(16_384),
  }),
  z.strictObject({ action: z.literal("auth-close"), sessionId: z.uuid() }),
  z.strictObject({ action: z.literal("clients-list") }),
  z.strictObject({ action: z.literal("clients-revoke"), sessionId: z.string().min(1).max(200) }),
  z.strictObject({ action: z.literal("pairings-list") }),
  z.strictObject({ action: z.literal("pairings-revoke"), pairingId: z.string().min(1).max(200) }),
]);
export const hostAdminV2CommandSchema = z.discriminatedUnion("action", [
  ...hostAdminCommandSchema.options,
  z.strictObject({ action: z.literal("auth-accounts"), ...agent }),
  z.strictObject({ action: z.literal("providers-remove"), instanceId: agentInstanceIdSchema }),
  z.strictObject({
    action: z.literal("providers-unset-environment"),
    instanceId: agentInstanceIdSchema,
    names: z
      .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u))
      .min(1)
      .max(200),
  }),
  z
    .strictObject({
      action: z.literal("pairings-create"),
      preset: z.enum(["viewer", "operator"]).optional(),
      scopes: z
        .array(remoteAccessScopeSchema)
        .min(1)
        .max(remoteAccessScopeSchema.options.length)
        .refine((scopes) => new Set(scopes).size === scopes.length, "Scopes must be unique.")
        .optional(),
      label: z.string().trim().min(1).max(120).optional(),
      // Explicit local-admin policy: 1 second to 24 hours, default 10 minutes.
      // The store still owns issuance, scope ceilings, expiry and revocation.
      ttlMs: z
        .int()
        .min(1_000)
        .max(HOST_ADMIN_PAIRING_MAX_TTL_MS)
        .default(HOST_ADMIN_PAIRING_DEFAULT_TTL_MS),
    })
    .refine(
      (command) => !(command.preset && command.scopes),
      "Choose a preset or explicit scopes.",
    ),
]);
const profileRevision = z.string().regex(/^[a-f0-9]{64}$/u);
export const hostAdminProfilePreparationSchema = z.strictObject({
  profileId: agentInstanceIdSchema,
  driver: agentDriverKindSchema,
  displayName: z.string().min(1).max(120).optional(),
  profileRevision,
});
export const hostAdminV3CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("providers-prepare-configuration"),
    instanceId: agentInstanceIdSchema,
  }),
  z.strictObject({
    action: z.literal("providers-configure-checked"),
    instanceId: agentInstanceIdSchema,
    expectedProfileRevision: profileRevision,
    displayName: z.string().trim().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    environment: environment.optional(),
    config: z.json().optional(),
  }),
]);
export const hostAdminPluginInventorySchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_INVENTORY_FORMAT_VERSION),
  scope: z.literal("global"),
  plugins: z.array(
    z.strictObject({
      name: z.string().min(1),
      version: z.string().min(1).nullable(),
      source: pluginSourceSchema,
      installed: z.boolean(),
      enabled: z.boolean(),
      hostSupported: z.boolean(),
      skillCount: z.int().nonnegative(),
      mcpServerNames: z.array(z.string()),
      errorCount: z.int().nonnegative(),
      warningCount: z.int().nonnegative(),
    }),
  ),
});
export const hostAdminMcpSummarySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  transport: z.enum(["stdio", "http", "sse"]),
  timeoutMs: z.int().positive(),
  disabledToolCount: z.int().nonnegative(),
});
export const hostAdminMcpInventorySchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_INVENTORY_FORMAT_VERSION),
  scope: z.literal("saved-user"),
  servers: z.array(hostAdminMcpSummarySchema),
});
export const hostAdminMcpInspectionSchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_INVENTORY_FORMAT_VERSION),
  scope: z.literal("saved-user"),
  server: hostAdminMcpSummarySchema.extend({
    environmentNames: z.array(z.string()),
    headerNames: z.array(z.string()),
    disabledTools: z.array(z.string()),
  }),
});
export const hostAdminV4CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("plugins-list") }),
  z.strictObject({ action: z.literal("plugins-refresh") }),
  z.strictObject({ action: z.literal("mcp-list") }),
  z.strictObject({ action: z.literal("mcp-inspect"), serverId: z.string().min(1) }),
]);
export const hostAdminProfileDriversSchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_INVENTORY_FORMAT_VERSION),
  scope: z.literal("saved-profile-drivers"),
  drivers: z.array(
    z.strictObject({
      id: agentDriverKindSchema,
      credentialEnvironmentName: z.string().min(1).nullable(),
    }),
  ),
});
export const hostAdminProfileCreationInputSchema = createProfilePayloadSchema
  .omit({ environment: true })
  .strict();
export const hostAdminProfileCreationCheckSchema = z.strictObject({
  checked: z.literal(true),
  profileId: agentInstanceIdSchema,
  driver: agentDriverKindSchema,
});
export const hostAdminV5CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("providers-drivers") }),
  z.strictObject({
    action: z.literal("providers-check-add"),
    profile: hostAdminProfileCreationInputSchema,
    environmentNames: z
      .array(
        z
          .string()
          .min(1)
          .max(200)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u),
      )
      .min(1)
      .max(200)
      .refine(
        (names) => new Set(names).size === names.length && !names.includes("__proto__"),
        "Use unique supported environment names.",
      ),
  }),
]);
export const hostAdminV6CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("mcp-set-enabled"),
    serverId: z.string().min(1),
    enabled: z.boolean(),
  }),
  z.strictObject({ action: z.literal("mcp-remove"), serverId: z.string().min(1) }),
]);
const mcpChangeMetadata = {
  formatVersion: z.literal(HOST_ADMIN_MCP_CHANGE_FORMAT_VERSION),
  scope: z.literal("saved-user"),
  serverId: z.string().min(1),
};
export const hostAdminMcpChangeResultSchema = z.discriminatedUnion("change", [
  z.strictObject({ ...mcpChangeMetadata, change: z.literal("set-enabled"), enabled: z.boolean() }),
  z.strictObject({ ...mcpChangeMetadata, change: z.literal("remove") }),
]);
const mcpDefinitionValues = z
  .unknown()
  .refine(
    (value) => !(value && typeof value === "object" && Object.hasOwn(value, "__proto__")),
    "Unsupported MCP value name.",
  )
  .pipe(z.record(z.string(), z.string()))
  .default({});
// Explicit public fields prevent a future internal credential selector from
// silently becoming user-configurable through this local contract.
export const hostAdminMcpDefinitionSchema = z
  .strictObject({
    id: mcpServerSchema.shape.id,
    name: mcpServerSchema.shape.name,
    description: mcpServerSchema.shape.description,
    enabled: mcpServerSchema.shape.enabled,
    timeoutMs: mcpServerSchema.shape.timeoutMs,
    disabledTools: mcpServerSchema.shape.disabledTools,
    transport: z.discriminatedUnion("type", [
      mcpStdioTransportSchema
        .pick({ type: true, command: true, args: true, env: true, cwd: true })
        .extend({ env: mcpDefinitionValues })
        .strict(),
      mcpHttpTransportSchema
        .pick({ type: true, url: true, headers: true })
        .extend({ headers: mcpDefinitionValues })
        .strict(),
      mcpSseTransportSchema
        .pick({ type: true, url: true, headers: true })
        .extend({ headers: mcpDefinitionValues })
        .strict(),
    ]),
  })
  .pipe(z.preprocess((value) => value, mcpServerSchema));
const mcpServerRevision = z.string().regex(/^[a-f0-9]{64}$/u);
export const hostAdminMcpPreparationSchema = hostAdminMcpSummarySchema.extend({
  serverRevision: mcpServerRevision,
});
export const hostAdminMcpDefinitionResultSchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_MCP_DEFINITION_FORMAT_VERSION),
  scope: z.literal("saved-user"),
  change: z.enum(["add", "configure"]),
  serverId: z.string().min(1),
});
export const hostAdminV7CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("mcp-add"), server: hostAdminMcpDefinitionSchema }),
  z.strictObject({ action: z.literal("mcp-prepare-configuration"), serverId: z.string().min(1) }),
  z.strictObject({
    action: z.literal("mcp-configure-checked"),
    server: hostAdminMcpDefinitionSchema,
    expectedServerRevision: mcpServerRevision,
  }),
]);
const sessionId = z.string().min(1).max(200);
export const hostAdminSessionSummarySchema = z.strictObject({
  id: sessionId,
  projectId: sessionId,
  title: z.string().min(1),
  agentKind: z.string().min(1),
  presentationMode: z.enum(["gui", "terminal"]),
  storedStatus: z.string().min(1),
  archived: z.boolean(),
  done: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
const sessionResultMetadata = {
  formatVersion: z.literal(HOST_ADMIN_SESSION_FORMAT_VERSION),
  scope: z.literal("persisted-profile"),
};
export const hostAdminSessionListSchema = z.strictObject({
  ...sessionResultMetadata,
  sessions: z.array(hostAdminSessionSummarySchema).max(100),
  nextCursor: z.string().min(1).max(256).nullable(),
});
export const hostAdminSessionInspectionSchema = z.strictObject({
  ...sessionResultMetadata,
  session: hostAdminSessionSummarySchema,
});
export const hostAdminSessionStopSchema = z.strictObject({
  ...sessionResultMetadata,
  threadId: sessionId,
  retired: z.literal(true),
});
export const hostAdminSessionChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("rename"), title: z.string().trim().min(1).max(500) }),
  z.strictObject({ kind: z.literal("archive") }),
  z.strictObject({ kind: z.literal("unarchive") }),
  z.strictObject({ kind: z.literal("done") }),
  z.strictObject({ kind: z.literal("reopen") }),
]);
export const hostAdminSessionUpdateCommandSchema = z.strictObject({
  action: z.literal("sessions-update"),
  threadId: sessionId,
  change: hostAdminSessionChangeSchema,
});
export const hostAdminSessionUpdateSchema = z.strictObject({
  ...sessionResultMetadata,
  change: hostAdminSessionChangeSchema,
  session: hostAdminSessionSummarySchema,
  runtime: z.enum(["retired", "unchanged"]),
});
export const hostAdminV8CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("sessions-list"),
    limit: z.int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(256).optional(),
    projectId: sessionId.optional(),
  }),
  z.strictObject({ action: z.literal("sessions-inspect"), threadId: sessionId }),
  z.strictObject({ action: z.literal("sessions-stop"), threadId: sessionId }),
]);
const mcpCreationMetadata = {
  serverId: z.string().min(1).max(HOST_ADMIN_MAX_REQUEST_BYTES),
  name: mcpServerSchema.shape.name.refine(isValidMcpServerName),
};
export const hostAdminMcpCreationCheckSchema = z.strictObject({
  formatVersion: z.literal(HOST_ADMIN_INVENTORY_FORMAT_VERSION),
  scope: z.literal("saved-user"),
  checked: z.literal(true),
  ...mcpCreationMetadata,
});
export const hostAdminV9CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("mcp-check-add"), ...mcpCreationMetadata }),
]);
const pluginAccountTarget = {
  pluginName: pluginAccountSchema.shape.pluginName,
  serverName: pluginAccountSchema.shape.serverName,
  accountId: pluginAccountSchema.shape.id,
};
export const hostAdminV10CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("plugin-accounts-list"),
    pluginName: pluginAccountTarget.pluginName,
  }),
  z.strictObject({
    action: z.enum(["plugin-account-select", "plugin-account-logout"]),
    ...pluginAccountTarget,
  }),
  z.strictObject({ action: z.literal("mcp-auth-status"), serverId: z.string().min(1) }),
  z.strictObject({
    action: z.literal("mcp-auth-logout"),
    serverId: z.string().min(1),
    expectedServerRevision: mcpServerRevision,
  }),
]);
const accountFormat = z.literal(HOST_ADMIN_INTEGRATION_ACCOUNT_FORMAT_VERSION);
export const hostAdminPluginAccountsSchema = z.strictObject({
  formatVersion: accountFormat,
  scope: z.literal("plugin-service-accounts"),
  pluginName: pluginAccountTarget.pluginName,
  operation: z.enum(["list", "select", "logout"]),
  accounts: z.array(pluginAccountSchema),
});
const sharedServerIds = z.array(z.string().min(1)).min(1);
export const hostAdminMcpAuthStatusSchema = z.strictObject({
  formatVersion: accountFormat,
  scope: z.literal("saved-user-oauth"),
  server: hostAdminMcpSummarySchema.extend({ transport: z.enum(["http", "sse"]) }),
  usableCredentials: z.boolean(),
  headerAuthorization: z.boolean(),
  sharedServerIds,
  serverRevision: mcpServerRevision,
});
export const hostAdminMcpAuthLogoutSchema = z.strictObject({
  formatVersion: accountFormat,
  scope: z.literal("saved-user-oauth"),
  serverId: z.string().min(1),
  loggedOut: z.literal(true),
  headerAuthorization: z.boolean(),
  sharedServerIds,
});
const integrationOperation = { operationId: z.uuid() };
const mcpLoginTarget = {
  ...integrationOperation,
  serverId: z.string().min(1),
  expectedServerRevision: mcpServerRevision,
};
export const hostAdminV11CommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("mcp-auth-start"), ...mcpLoginTarget }),
  z.strictObject({ action: z.literal("mcp-auth-wait"), ...mcpLoginTarget }),
  z.strictObject({
    action: z.literal("plugin-account-start"),
    ...integrationOperation,
    pluginName: pluginAccountTarget.pluginName,
    serverName: pluginAccountTarget.serverName,
    accountId: pluginAccountTarget.accountId.optional(),
    label: pluginAccountSchema.shape.label,
  }),
  z.strictObject({
    action: z.literal("plugin-account-wait"),
    ...integrationOperation,
    ...pluginAccountTarget,
  }),
  z.strictObject({ action: z.literal("integration-auth-cancel"), ...integrationOperation }),
]);
export type HostAdminCommand =
  | z.infer<typeof hostAdminV2CommandSchema>
  | z.infer<typeof hostAdminV3CommandSchema>
  | z.infer<typeof hostAdminV4CommandSchema>
  | z.infer<typeof hostAdminV5CommandSchema>
  | z.infer<typeof hostAdminV6CommandSchema>
  | z.infer<typeof hostAdminV7CommandSchema>
  | z.infer<typeof hostAdminV8CommandSchema>
  | z.infer<typeof hostAdminV9CommandSchema>
  | z.infer<typeof hostAdminV10CommandSchema>
  | z.infer<typeof hostAdminV11CommandSchema>
  | z.infer<typeof hostAdminCatalogCommandSchema>
  | z.infer<typeof sessionExportCommandSchema>
  | z.infer<typeof hostProjectCommandSchema>
  | z.infer<typeof hostRunCommandSchema>
  | z.infer<typeof hostAdminCustomAcpCommandSchema>
  | z.infer<typeof hostAdminProviderInventoryCommandSchema>
  | z.infer<typeof hostAdminSessionUpdateCommandSchema>
  | z.infer<typeof hostRunResumePreparationCommandSchema>
  | z.infer<typeof hostRunDirectoryCommandSchema>
  | z.infer<typeof hostRunFilesCommandSchema>
  | z.infer<typeof hostRunInteractiveCommandSchema>
  | z.infer<typeof hostRunToolEventsCommandSchema>;
export const hostAdminV1RequestSchema = z.strictObject({
  adminVersion: z.literal(HOST_ADMIN_VERSION),
  command: hostAdminCommandSchema,
});
export const hostAdminRequestSchema = z.discriminatedUnion("adminVersion", [
  hostAdminV1RequestSchema,
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V2_VERSION),
    command: hostAdminV2CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V3_VERSION),
    command: hostAdminV3CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V4_VERSION),
    command: hostAdminV4CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V5_VERSION),
    command: hostAdminV5CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V6_VERSION),
    command: hostAdminV6CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V7_VERSION),
    command: hostAdminV7CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V8_VERSION),
    command: hostAdminV8CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V9_VERSION),
    command: hostAdminV9CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V10_VERSION),
    command: hostAdminV10CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V11_VERSION),
    command: hostAdminV11CommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V12_VERSION),
    command: hostAdminCatalogCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V13_VERSION),
    command: sessionExportCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V14_VERSION),
    command: hostProjectCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V15_VERSION),
    command: hostRunCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V16_VERSION),
    command: hostAdminCustomAcpCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V17_VERSION),
    command: hostAdminProviderInventoryCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V18_VERSION),
    command: hostAdminSessionUpdateCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V19_VERSION),
    command: hostRunResumePreparationCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V20_VERSION),
    command: hostRunDirectoryCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V21_VERSION),
    command: hostRunFilesCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V22_VERSION),
    command: hostRunInteractiveCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V23_VERSION),
    command: hostRunInteractiveCommandSchema,
  }),
  z.strictObject({
    adminVersion: z.literal(HOST_ADMIN_V24_VERSION),
    command: hostRunToolEventsCommandSchema,
  }),
]);
export type HostAdminRequest = z.infer<typeof hostAdminRequestSchema>;
export function hostAdminRequest(command: HostAdminCommand): HostAdminRequest {
  return hostAdminRequestSchema.parse({
    adminVersion: hostAdminCommandSchema.safeParse(command).success
      ? HOST_ADMIN_VERSION
      : hostAdminV2CommandSchema.safeParse(command).success
        ? HOST_ADMIN_V2_VERSION
        : hostAdminV3CommandSchema.safeParse(command).success
          ? HOST_ADMIN_V3_VERSION
          : hostAdminV4CommandSchema.safeParse(command).success
            ? HOST_ADMIN_V4_VERSION
            : hostAdminV5CommandSchema.safeParse(command).success
              ? HOST_ADMIN_V5_VERSION
              : hostAdminV6CommandSchema.safeParse(command).success
                ? HOST_ADMIN_V6_VERSION
                : hostAdminV7CommandSchema.safeParse(command).success
                  ? HOST_ADMIN_V7_VERSION
                  : hostAdminV8CommandSchema.safeParse(command).success
                    ? HOST_ADMIN_V8_VERSION
                    : hostAdminV9CommandSchema.safeParse(command).success
                      ? HOST_ADMIN_V9_VERSION
                      : hostAdminV10CommandSchema.safeParse(command).success
                        ? HOST_ADMIN_V10_VERSION
                        : hostAdminV11CommandSchema.safeParse(command).success
                          ? HOST_ADMIN_V11_VERSION
                          : hostAdminCatalogCommandSchema.safeParse(command).success
                            ? HOST_ADMIN_V12_VERSION
                            : sessionExportCommandSchema.safeParse(command).success
                              ? HOST_ADMIN_V13_VERSION
                              : hostProjectCommandSchema.safeParse(command).success
                                ? HOST_ADMIN_V14_VERSION
                                : hostRunCommandSchema.safeParse(command).success
                                  ? HOST_ADMIN_V15_VERSION
                                  : hostAdminCustomAcpCommandSchema.safeParse(command).success
                                    ? HOST_ADMIN_V16_VERSION
                                    : hostAdminProviderInventoryCommandSchema.safeParse(command)
                                          .success
                                      ? HOST_ADMIN_V17_VERSION
                                      : hostAdminSessionUpdateCommandSchema.safeParse(command)
                                            .success
                                        ? HOST_ADMIN_V18_VERSION
                                        : hostRunResumePreparationCommandSchema.safeParse(command)
                                              .success
                                          ? HOST_ADMIN_V19_VERSION
                                          : hostRunDirectoryCommandSchema.safeParse(command).success
                                            ? HOST_ADMIN_V20_VERSION
                                            : hostRunFilesCommandSchema.safeParse(command).success
                                              ? HOST_ADMIN_V21_VERSION
                                              : hostRunToolEventsCommandSchema.safeParse(command)
                                                    .success
                                                ? HOST_ADMIN_V24_VERSION
                                                : HOST_ADMIN_V23_VERSION,
    command,
  });
}
export const hostAdminV1ResultSchema = z.strictObject({
  adminVersion: z.literal(HOST_ADMIN_VERSION),
  outcome: z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), data: z.json() }),
    z.strictObject({ ok: z.literal(false), error: z.string().min(1).max(2_000) }),
  ]),
});
export const hostAdminResultSchema = z.discriminatedUnion("adminVersion", [
  hostAdminV1ResultSchema,
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V2_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V3_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V4_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V5_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V6_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V7_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V8_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V9_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V10_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V11_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V12_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V13_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V14_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V15_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V16_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V17_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V18_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V19_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V20_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V21_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V22_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V23_VERSION) }),
  hostAdminV1ResultSchema.extend({ adminVersion: z.literal(HOST_ADMIN_V24_VERSION) }),
]);
export type HostAdminResult = z.infer<typeof hostAdminResultSchema>;
