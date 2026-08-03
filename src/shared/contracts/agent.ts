import { z } from "zod";
import {
  agentKindSchema,
  authStateSchema,
  labeledOptionSchema,
  liveInputModeSchema,
  threadModeSchema,
  threadPresentationModeSchema,
} from "./common";

const agentToggleSettingDefSchema = z.object({
  key: z.string().min(1),
  type: z.literal("toggle"),
  env: z.record(z.string(), z.string()),
  label: z.string().min(1),
  description: z.string(),
  default: z.boolean(),
  platforms: z.array(z.string()).optional(),
});

const agentSelectSettingDefSchema = z.object({
  key: z.string().min(1),
  type: z.literal("select"),
  envVar: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  default: z.string(),
  options: z.array(labeledOptionSchema),
  platforms: z.array(z.string()).optional(),
});

/** Optional slash-command metadata surfaced by providers and/or active sessions. */
export const agentSlashCommandSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  argumentHint: z.string().optional(),
  section: z.enum(["skills"]).optional(),
  skillName: z.string().min(1).optional(),
  skillPath: z.string().min(1).optional(),
  skillInvocation: z.string().min(1).optional(),
  skillProvider: z.string().min(1).optional(),
  skillScope: z.enum(["global", "project"]).optional(),
});
export type AgentSlashCommand = z.infer<typeof agentSlashCommandSchema>;

export const agentConnectedProviderSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1).optional(),
  /**
   * Stable provider identifier the underlying agent CLI accepts for credential
   * removal (e.g. OpenCode's auth.json key like `opencode` / `github-copilot`).
   * Absent when the agent can't resolve one for the env (then the UI falls back
   * to the agent's interactive removal flow).
   */
  id: z.string().min(1).optional(),
});
export type AgentConnectedProvider = z.infer<typeof agentConnectedProviderSchema>;

export const agentProviderMetadataSchema = z.object({
  authenticatedAs: z.string().min(1).optional(),
  organization: z.string().min(1).optional(),
  plan: z.string().min(1).optional(),
  authMethod: z.string().min(1).optional(),
  connectedProviders: z.array(agentConnectedProviderSchema).optional(),
});
export type AgentProviderMetadata = z.infer<typeof agentProviderMetadataSchema>;

const agentUpdateCommandSchema = z.object({
  binary: z.string().min(1),
  args: z.array(z.string()),
});

export const agentUpdateInfoSchema = z.object({
  builtIn: agentUpdateCommandSchema.optional(),
  /** Fall back when the built-in command exits successfully without changing the detected version. */
  verifyBuiltInVersionChange: z.boolean().optional(),
  npm: z.string().min(1).optional(),
  homebrewCask: z.string().min(1).optional(),
  brew: z.string().min(1).optional(),
  winget: z.string().min(1).optional(),
  /**
   * The provider's own install script, re-run non-interactively, per platform.
   * For agents distributed by a `curl … | bash` / `irm … | iex` installer
   * rather than a package manager (and whose CLI `update`/`upgrade` is an
   * interactive TUI with no headless flag). Preferred over the npm last-resort
   * so the update refreshes the existing install in place instead of spawning a
   * conflicting global npm install. `posix` also serves WSL.
   */
  installer: z
    .object({
      posix: agentUpdateCommandSchema,
      windows: agentUpdateCommandSchema,
    })
    .optional(),
  latestVersionUrls: z.array(z.string().url()).optional(),
});
export type AgentUpdateInfo = z.infer<typeof agentUpdateInfoSchema>;

export const agentAuthEnvVarSchema = z.object({
  name: z.string().min(1),
  label: z.string().nullable().optional(),
  optional: z.boolean().optional(),
  secret: z.boolean().optional(),
});
export type AgentAuthEnvVar = z.infer<typeof agentAuthEnvVarSchema>;

const agentAuthMethodBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

export const agentEnvVarAuthMethodSchema = agentAuthMethodBaseSchema.extend({
  type: z.literal("env_var"),
  link: z.string().nullable().optional(),
  vars: z.array(agentAuthEnvVarSchema),
});
export type AgentEnvVarAuthMethod = z.infer<typeof agentEnvVarAuthMethodSchema>;

export const agentTerminalAuthMethodSchema = agentAuthMethodBaseSchema.extend({
  type: z.literal("terminal"),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
export type AgentTerminalAuthMethod = z.infer<typeof agentTerminalAuthMethodSchema>;

export const agentOwnedAuthMethodSchema = agentAuthMethodBaseSchema.extend({
  type: z.literal("agent").optional(),
});
export type AgentOwnedAuthMethod = z.infer<typeof agentOwnedAuthMethodSchema>;

export const agentAuthMethodSchema = z.union([
  agentEnvVarAuthMethodSchema,
  agentTerminalAuthMethodSchema,
  agentOwnedAuthMethodSchema,
]);
export type AgentAuthMethod = z.infer<typeof agentAuthMethodSchema>;

export const agentSettingDefSchema = z.discriminatedUnion("type", [
  agentToggleSettingDefSchema,
  agentSelectSettingDefSchema,
]);
export type AgentSettingDef = z.infer<typeof agentSettingDefSchema>;

/**
 * Provider-agnostic "Full Access" preset. Shared UI (conflict resolver,
 * handoff dialog, bypass toggles) applies these fields together so codex
 * and similar providers that need a sandbox override are bypassed correctly.
 */
const bypassPermissionsSchema = z.object({
  approvalPolicy: z.string().optional(),
  sandboxMode: z.string().optional(),
});

const agentPresentationCapabilityOverrideSchema = z
  .object({
    /** Short provider-owned runtime badge shown in structured composers (for example ACP / SDK). */
    runtimeLabel: z.string().min(1).optional(),
    models: z.array(labeledOptionSchema),
    /**
     * Provider-owned initial model visibility. Applied only while the user has
     * no explicit hidden-model list for this presentation/runtime surface.
     */
    defaultHiddenModels: z.array(z.string().min(1)).optional(),
    efforts: z.array(z.string().min(1)),
    defaultEffort: z.string().optional(),
    modelEfforts: z.record(z.string(), z.array(z.string().min(1))),
    modelDefaultEfforts: z.record(z.string(), z.string()).optional(),
    subProviders: z.array(labeledOptionSchema).optional(),
    modelSubProvider: z.record(z.string(), z.string()).optional(),
    contextSizes: z.array(labeledOptionSchema).optional(),
    modelContextSizes: z.record(z.string(), z.array(z.string().min(1))).optional(),
    defaultContextSize: z.string().optional(),
    fastModels: z.array(z.string().min(1)).optional(),
    fastDisabledReason: z.string().optional(),
    thinkingModels: z.array(z.string().min(1)).optional(),
    modes: z.array(threadModeSchema),
    approvalPolicies: z.array(labeledOptionSchema),
    sandboxModes: z.array(labeledOptionSchema),
    defaultApprovalPolicy: z.string().optional(),
    defaultApprovalsReviewer: z.string().optional(),
    defaultSandboxMode: z.string().optional(),
    supportsResume: z.boolean(),
    supportsDirectInput: z.boolean(),
    liveInputMode: liveInputModeSchema,
    presentationMode: threadPresentationModeSchema,
    presentationModes: z.array(threadPresentationModeSchema).optional(),
    requiresTerminalFocusBeforeInput: z.boolean().optional(),
    bypassPermissions: bypassPermissionsSchema.optional(),
    settingDefs: z.array(agentSettingDefSchema),
    slashCommands: z.array(agentSlashCommandSchema).optional(),
    disabledSkillNames: z.array(z.string().min(1)).optional(),
  })
  .partial();

/**
 * How a composer MCP toggle (Browser / Crossagents) gates per-thread for one
 * presentation mode:
 *
 * - "always":  the MCP server set is rebuilt on every turn (e.g. Claude SDK
 *              GUI). Badge is toggleable mid-thread.
 * - "launch":  the MCP server set is baked in at thread/session start
 *              (Codex `-c` argv, ACP `newSession.mcpServers`). Badge controls
 *              launch; once running it is read-only.
 * - "none":    no per-thread gating point exists (e.g. Claude TUI: no MCP
 *              wired; install-time / launch-time global config).
 */
export const composerMcpScopeSchema = z.enum(["none", "launch", "always"]);
export type ComposerMcpScope = z.infer<typeof composerMcpScopeSchema>;

/**
 * Per-presentation composer MCP scopes, declared by each provider adapter.
 * Absent values fall back to the generic behavior: `terminal` → "none",
 * `gui` → "launch" (structured runtimes bake MCP config at session start).
 */
export const composerMcpScopesSchema = z.object({
  terminal: composerMcpScopeSchema.optional(),
  gui: composerMcpScopeSchema.optional(),
});
export type ComposerMcpScopes = z.infer<typeof composerMcpScopesSchema>;

export const agentCapabilitySchema = z.object({
  /** Short provider-owned runtime badge shown in structured composers (for example ACP / SDK). */
  runtimeLabel: z.string().min(1).optional(),
  models: z.array(labeledOptionSchema).default([]),
  /**
   * Provider-owned initial model visibility. An explicit user list (including
   * an empty list from "Show all") always replaces these defaults.
   */
  defaultHiddenModels: z.array(z.string().min(1)).optional(),
  efforts: z.array(z.string().min(1)).default([]),
  defaultEffort: z.string().optional(),
  modelEfforts: z.record(z.string(), z.array(z.string().min(1))).default({}),
  /** Per-model default effort. Wins over `defaultEffort` for that model. */
  modelDefaultEfforts: z.record(z.string(), z.string()).optional(),
  /** Optional sub-provider grouping (e.g. OpenCode Zen, GitHub Copilot under OpenCode). */
  subProviders: z.array(labeledOptionSchema).optional(),
  /** Map from model id to its sub-provider id. Falls back to model-id namespace prefix when omitted. */
  modelSubProvider: z.record(z.string(), z.string()).optional(),
  /** Available context-window sizes (when a model exposes more than one). */
  contextSizes: z.array(labeledOptionSchema).optional(),
  /** Per-model allowed contextSize ids. */
  modelContextSizes: z.record(z.string(), z.array(z.string().min(1))).optional(),
  /** Provider's default contextSize id. */
  defaultContextSize: z.string().optional(),
  /** Model ids that support a fast/turbo execution mode. */
  fastModels: z.array(z.string().min(1)).optional(),
  /**
   * Set when a `fastModels` model technically supports fast mode but it is
   * unavailable for the authenticated account (e.g. disabled by the org). The
   * composer keeps the Fast toggle visible but renders it disabled with this
   * message as its tooltip.
   */
  fastDisabledReason: z.string().optional(),
  /** Model ids that support a thinking/reasoning toggle separate from effort level. */
  thinkingModels: z.array(z.string().min(1)).optional(),
  modes: z.array(threadModeSchema).default([]),
  approvalPolicies: z.array(labeledOptionSchema).default([]),
  sandboxModes: z.array(labeledOptionSchema).default([]),
  /** First-draft approval policy when the user has no saved preference. Falls back to the first entry in `approvalPolicies` if unset. */
  defaultApprovalPolicy: z.string().optional(),
  /** First-draft approval reviewer when the user has no saved preference. */
  defaultApprovalsReviewer: z.string().optional(),
  /** First-draft sandbox mode when the user has no saved preference. Falls back to the first entry in `sandboxModes` if unset. */
  defaultSandboxMode: z.string().optional(),
  supportsResume: z.boolean().default(false),
  supportsDirectInput: z.boolean().default(true),
  /**
   * Whether the adapter can run a single-shot, non-interactive generation
   * (thread title / commit message). True iff the supervisor adapter implements
   * `runOneShot` or `buildOneShotCommand`. All first-class CLI providers support
   * it; surfaced so the renderer's AI settings can hide providers that only
   * speak interactive sessions — e.g. ACP-registry generic agents — from
   * one-shot-only selectors (Title / Commit Message generation).
   * Optional: absent = false.
   */
  supportsOneShot: z.boolean().optional(),
  /**
   * Whether the adapter exposes a provider-enforced text-only one-shot path
   * with tools, MCPs, plugins, and hooks disabled. Optional: absent = false.
   */
  supportsTextOnlyOneShot: z.boolean().optional(),
  /**
   * When true, the agent can only read files inside its working directory (e.g.
   * Command Code sandboxes file access to the project/worktree). Attachments
   * that live outside the workspace are copied into a workspace-local dir and
   * referenced there before being handed to the terminal.
   */
  requiresWorkspaceLocalAttachments: z.boolean().optional(),
  /**
   * When true, structured turns read PDF attachment bytes in the host
   * supervisor, so WSL path rewriting must preserve their native host paths.
   */
  readsPdfAttachmentsFromHost: z.boolean().optional(),
  liveInputMode: liveInputModeSchema.default("terminal"),
  presentationMode: threadPresentationModeSchema.default("terminal"),
  /**
   * Modes the adapter supports. When >1, the new-thread picker exposes a
   * Mode select (Terminal / Chat). Defaults to `[presentationMode]` (computed
   * by consumers) — adapters that haven't migrated yet keep working unchanged.
   */
  presentationModes: z.array(threadPresentationModeSchema).optional(),
  requiresTerminalFocusBeforeInput: z.boolean().optional(),
  bypassPermissions: bypassPermissionsSchema.optional(),
  /** Composer MCP toggle gating for every server. */
  mcpScope: composerMcpScopesSchema.optional(),
  /** Provider-owned defaults for values stored in shared agent settings. */
  agentSettingsDefaults: z.record(z.string(), z.union([z.boolean(), z.string()])).optional(),
  /**
   * Where the provider's MCP launch flags come from:
   *
   * - absent / "thread": per-thread `ThreadConfig` flags set by the composer
   *   MCP controls (the default for every provider).
   * - "agentSettings": provider-level — flags are read from
   *   `sharedSettings.agentSettings[kind]` at launch, the composer shows no
   *   MCP controls at all, and the MCP set is identical across the provider's
   *   threads (letting pooled servers stay stable). Configured from the
   *   provider's settings page.
   */
  mcpConfigSource: z.enum(["thread", "agentSettings"]).optional(),
  /**
   * How Crossagents identifies the calling parent thread:
   *
   * - absent / "thread-token": the MCP bearer token maps directly to one
   *   Poracode thread (the default for provider processes launched per thread).
   * - "provider-session": one provider-runtime credential is shared, and a
   *   trusted provider hook adds the native session id to every tool call so
   *   the supervisor can resolve the live parent thread at call time.
   */
  crossagentMcpRouting: z.enum(["thread-token", "provider-session"]).optional(),
  settingDefs: z.array(agentSettingDefSchema).default([]),
  /** Populated when the Claude Agent SDK init probe succeeds (install detection). */
  slashCommands: z.array(agentSlashCommandSchema).optional(),
  /** Provider-native per-skill disables discovered by its capability probe. */
  disabledSkillNames: z.array(z.string().min(1)).optional(),
  /**
   * Provider owns its GUI skill catalog: it reports enabled skills through the
   * runtime session (`slashCommands`) rather than the shared local scan, so the
   * renderer treats that catalog as authoritative even when it is empty.
   */
  reportsSkillCatalog: z.boolean().optional(),
  /**
   * Optional capability overrides for providers whose terminal and GUI runtimes
   * expose different model surfaces. Consumers merge the active presentation's
   * override over the root capability object.
   */
  presentationCapabilities: z
    .object({
      terminal: agentPresentationCapabilityOverrideSchema.optional(),
      gui: agentPresentationCapabilityOverrideSchema.optional(),
    })
    .optional(),
});
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

/**
 * One independently detected runtime behind a provider tile.
 *
 * `capabilities` is deliberately the complete, already-resolved capability
 * surface for this runtime rather than a presentation override. That lets an
 * existing thread stay pinned to its original runtime when the provider's
 * default changes later.
 */
export const agentRuntimeVariantSchema = z.object({
  presentationMode: threadPresentationModeSchema,
  installed: z.boolean(),
  /** Runtime-specific package version when the provider exposes one. */
  version: z.string().min(1).optional(),
  /** Provider-owned installation source used to explain lifecycle ownership. */
  installationSource: z.string().min(1).optional(),
  authState: authStateSchema,
  authUsesProviderLogin: z.boolean(),
  capabilities: agentCapabilitySchema,
});
export type AgentRuntimeVariant = z.infer<typeof agentRuntimeVariantSchema>;

/**
 * Provider-owned mapping from opaque provider session ids to named runtime
 * variants. Shared consumers only apply the generic prefix/fallback rules;
 * provider-specific discriminators stay at the provider boundary.
 */
export const agentSessionRuntimeRoutingSchema = z.object({
  prefixes: z.record(z.string().min(1), z.string().min(1)),
  fallbackRuntime: z.string().min(1).optional(),
});
export type AgentSessionRuntimeRouting = z.infer<typeof agentSessionRuntimeRoutingSchema>;

export const agentStatusSchema = z.object({
  kind: agentKindSchema,
  label: z.string().min(1),
  installed: z.boolean(),
  icon: z.string().optional(),
  executablePath: z.string().optional(),
  version: z.string().optional(),
  update: agentUpdateInfoSchema.optional(),
  authState: authStateSchema,
  /**
   * Authentication can differ between presentation runtimes even when they
   * share one provider tile. For example, Cursor's terminal/ACP surfaces use
   * the installed CLI login while its SDK GUI surface requires
   * `CURSOR_API_KEY`. Consumers fall back to `authState` when no override is
   * present.
   */
  presentationAuthStates: z
    .object({
      terminal: authStateSchema.optional(),
      gui: authStateSchema.optional(),
    })
    .optional(),
  /**
   * Whether the provider's ordinary login command / ACP auth methods apply to
   * a presentation-specific auth state. Set false for runtimes that require
   * external credentials (such as Cursor SDK API keys) so the UI does not
   * offer a misleading CLI login action.
   */
  presentationAuthUsesProviderLogin: z
    .object({
      terminal: z.boolean().optional(),
      gui: z.boolean().optional(),
    })
    .optional(),
  loginCommand: z.string().min(1).optional(),
  /**
   * Prefer the terminal `loginCommand` over agent-owned/browser auth methods
   * in login UIs. Reported by the provider's capabilities probe (e.g. Grok's
   * CLI login is the supported path even though ACP advertises auth methods).
   */
  preferTerminalLogin: z.boolean().optional(),
  providerMetadata: agentProviderMetadataSchema.optional(),
  authMethods: z.array(agentAuthMethodSchema).optional(),
  authLogoutSupported: z.boolean().optional(),
  capabilities: agentCapabilitySchema,
  /** Named, independently detected runtimes available behind this provider. */
  runtimeVariants: z.record(z.string().min(1), agentRuntimeVariantSchema).optional(),
  /** Session-id routing into `runtimeVariants` for existing threads. */
  sessionRuntimeRouting: agentSessionRuntimeRoutingSchema.optional(),
  envKind: z.enum(["windows", "wsl", "posix"]).optional(),
  envDistro: z.string().optional(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const refreshAgentScopeEnvSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("native") }),
  z.object({ kind: z.literal("wsl"), distro: z.string().min(1) }),
]);
export type RefreshAgentScopeEnv = z.infer<typeof refreshAgentScopeEnvSchema>;

export const refreshAgentScopeSchema = z.object({
  agentKinds: z.array(z.string().min(1)).min(1),
  envs: z.array(refreshAgentScopeEnvSchema).optional(),
});
export type RefreshAgentScope = z.infer<typeof refreshAgentScopeSchema>;

export const getAgentStatusesPayloadSchema = z.object({
  wslDistros: z.array(z.string().min(1)).default([]),
  scope: refreshAgentScopeSchema.optional(),
});
export type GetAgentStatusesPayload = z.infer<typeof getAgentStatusesPayloadSchema>;

export const agentStatusesResponseSchema = z.object({
  windows: z.array(agentStatusSchema).default([]),
  wsl: z.array(agentStatusSchema).default([]),
  /**
   * True when the response was populated from the on-disk cache.
   * False when no cache file was available (e.g. first launch) — the caller
   * should show a detecting/loading state until fresh detection events arrive.
   */
  fromCache: z.boolean(),
});
export type AgentStatusesResponse = z.infer<typeof agentStatusesResponseSchema>;

const acpRegistryPackageDistributionSchema = z.object({
  package: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const acpRegistryBinaryTargetSchema = z.object({
  archive: z.string().url(),
  cmd: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const acpRegistryAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  repository: z.string().url().optional(),
  website: z.string().url().optional(),
  authors: z.array(z.string()).optional(),
  license: z.string().optional(),
  icon: z.string().optional(),
  distribution: z.object({
    npx: acpRegistryPackageDistributionSchema.optional(),
    uvx: acpRegistryPackageDistributionSchema.optional(),
    binary: z.record(z.string(), acpRegistryBinaryTargetSchema).optional(),
  }),
});
export type AcpRegistryAgent = z.infer<typeof acpRegistryAgentSchema>;

export const acpRegistryListResultSchema = z.object({
  version: z.string().min(1),
  agents: z.array(acpRegistryAgentSchema),
});
export type AcpRegistryListResult = z.infer<typeof acpRegistryListResultSchema>;

export const installedAcpRegistryAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  icon: z.string().optional(),
  installedAt: z.string().min(1),
  adapterKind: agentKindSchema,
  installKind: z.enum(["first-class", "generic"]),
});
export type InstalledAcpRegistryAgent = z.infer<typeof installedAcpRegistryAgentSchema>;

export const installAcpRegistryAgentPayloadSchema = z.object({
  agentId: z.string().min(1),
});
export type InstallAcpRegistryAgentPayload = z.infer<typeof installAcpRegistryAgentPayloadSchema>;

export const updateAcpRegistryAgentPayloadSchema = z.object({
  agentId: z.string().min(1),
});
export type UpdateAcpRegistryAgentPayload = z.infer<typeof updateAcpRegistryAgentPayloadSchema>;

export const removeAcpRegistryAgentPayloadSchema = z.object({
  agentId: z.string().min(1),
});
export type RemoveAcpRegistryAgentPayload = z.infer<typeof removeAcpRegistryAgentPayloadSchema>;

export const setAcpRegistryAgentAuthPayloadSchema = z.object({
  agentId: z.string().min(1),
  environment: z.record(z.string().min(1), z.string()),
});
export type SetAcpRegistryAgentAuthPayload = z.infer<typeof setAcpRegistryAgentAuthPayloadSchema>;

export const authenticateAcpAgentPayloadSchema = z.object({
  agentKind: z.string().min(1),
  methodId: z.string().min(1),
  envKind: z.enum(["windows", "wsl", "posix"]).optional(),
  wslDistro: z.string().min(1).optional(),
});
export type AuthenticateAcpAgentPayload = z.infer<typeof authenticateAcpAgentPayloadSchema>;

export const logoutAcpAgentPayloadSchema = z.object({
  agentKind: z.string().min(1),
  envKind: z.enum(["windows", "wsl", "posix"]).optional(),
  wslDistro: z.string().min(1).optional(),
});
export type LogoutAcpAgentPayload = z.infer<typeof logoutAcpAgentPayloadSchema>;

export const acpRegistryMutationResultSchema = z.object({
  installed: z.array(installedAcpRegistryAgentSchema),
});
export type AcpRegistryMutationResult = z.infer<typeof acpRegistryMutationResultSchema>;

export const updateAgentBinaryPayloadSchema = z.object({
  agentKind: agentKindSchema,
  envKind: z.enum(["windows", "wsl", "posix"]),
  wslDistro: z.string().min(1).optional(),
});
export type UpdateAgentBinaryPayload = z.infer<typeof updateAgentBinaryPayloadSchema>;

export const agentHookPluginEnvSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("native") }),
  z.object({ kind: z.literal("wsl"), distro: z.string().min(1) }),
]);
export type AgentHookPluginEnv = z.infer<typeof agentHookPluginEnvSchema>;

export const agentHookPluginPayloadSchema = z.object({
  agentKind: agentKindSchema,
  env: agentHookPluginEnvSchema,
});
export type AgentHookPluginPayload = z.infer<typeof agentHookPluginPayloadSchema>;

export const agentHookPluginStatusSchema = z.object({
  agentKind: agentKindSchema,
  env: agentHookPluginEnvSchema,
  supported: z.boolean(),
  installed: z.boolean(),
  version: z.string().optional(),
  bundledVersion: z.string(),
  canUninstall: z.boolean(),
  reason: z.string().optional(),
});
export type AgentHookPluginStatus = z.infer<typeof agentHookPluginStatusSchema>;

export const getAgentHookPluginStatusesPayloadSchema = z.object({
  agentKind: agentKindSchema,
  envs: z.array(agentHookPluginEnvSchema),
});
export type GetAgentHookPluginStatusesPayload = z.infer<
  typeof getAgentHookPluginStatusesPayloadSchema
>;

export const agentHookPluginMutationResultSchema = z.object({
  status: agentHookPluginStatusSchema,
});
export type AgentHookPluginMutationResult = z.infer<typeof agentHookPluginMutationResultSchema>;

export const updateAgentBinaryResultSchema = z.object({
  ok: z.boolean(),
  /** Updater output captured from stdout/stderr (last ~4KB), for surfacing in the UI on failure. */
  output: z.string().optional(),
  /** Strategy that was used: built-in updater, npm/bun/pnpm/brew/winget, or installer fallback. */
  strategy: z
    .enum([
      "built-in",
      "npm-global",
      "pnpm-global",
      "bun-global",
      "brew",
      "winget",
      "installer",
      "unsupported",
    ])
    .optional(),
});
export type UpdateAgentBinaryResult = z.infer<typeof updateAgentBinaryResultSchema>;

/**
 * Optional npm scope for `getLatestAgentVersion`. When present the probe
 * resolves the newest published version of `name` inside this window instead of
 * the agent kind's own release channel — for provider settings that manage an
 * extra package alongside the CLI (e.g. Cursor's `@cursor/sdk`), where an
 * update to an unsupported major must never be offered.
 */
export const npmPackageVersionQuerySchema = z.object({
  name: z.string().min(1),
  /** Inclusive minimum supported version. */
  minVersion: z.string().min(1).optional(),
  /** First major version the caller does not support. */
  maxExclusiveMajor: z.number().int().positive().optional(),
});
export type NpmPackageVersionQuery = z.infer<typeof npmPackageVersionQuerySchema>;

export const getLatestAgentVersionPayloadSchema = z.object({
  agentKind: agentKindSchema,
  npmPackage: npmPackageVersionQuerySchema.optional(),
});
export type GetLatestAgentVersionPayload = z.infer<typeof getLatestAgentVersionPayloadSchema>;

export const getLatestAgentVersionResultSchema = z.object({
  /** Latest published version reported by the upstream registry, undefined when probing failed. */
  version: z.string().min(1).optional(),
  /** Where the version came from, surfaced for telemetry / debug. */
  source: z.enum(["npm", "homebrew-cask", "version-url", "unknown"]).optional(),
});
export type GetLatestAgentVersionResult = z.infer<typeof getLatestAgentVersionResultSchema>;

export const resolveAgentAccountPayloadSchema = z.object({
  agentKind: agentKindSchema,
  /** WSL distros to include when probing for provider-side account state. */
  wslDistros: z.array(z.string()).optional(),
});
export type ResolveAgentAccountPayload = z.infer<typeof resolveAgentAccountPayloadSchema>;

export const resolveAgentAccountResultSchema = z.object({
  /**
   * Signed-in identity (email) + plan resolved by the provider adapter's
   * `resolveAccount` hook. Undefined when the adapter has no hook or the
   * account could not be resolved.
   */
  account: agentProviderMetadataSchema.optional(),
});
export type ResolveAgentAccountResult = z.infer<typeof resolveAgentAccountResultSchema>;

export function areAgentSlashCommandsEqual(
  left: readonly AgentSlashCommand[] | undefined,
  right: readonly AgentSlashCommand[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftCommand = left[index]!;
    const rightCommand = right[index]!;
    if (
      leftCommand.id !== rightCommand.id ||
      leftCommand.label !== rightCommand.label ||
      leftCommand.description !== rightCommand.description ||
      leftCommand.argumentHint !== rightCommand.argumentHint ||
      leftCommand.section !== rightCommand.section ||
      leftCommand.skillName !== rightCommand.skillName ||
      leftCommand.skillPath !== rightCommand.skillPath ||
      leftCommand.skillInvocation !== rightCommand.skillInvocation ||
      leftCommand.skillProvider !== rightCommand.skillProvider ||
      leftCommand.skillScope !== rightCommand.skillScope
    ) {
      return false;
    }
  }
  return true;
}

export function areAgentConnectedProvidersEqual(
  left: readonly AgentConnectedProvider[] | undefined,
  right: readonly AgentConnectedProvider[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftProvider = left[index]!;
    const rightProvider = right[index]!;
    if (
      leftProvider.label !== rightProvider.label ||
      leftProvider.detail !== rightProvider.detail ||
      leftProvider.id !== rightProvider.id
    ) {
      return false;
    }
  }
  return true;
}

export function areAgentProviderMetadataEqual(
  left: AgentProviderMetadata | undefined,
  right: AgentProviderMetadata | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return (
    left.authenticatedAs === right.authenticatedAs &&
    left.organization === right.organization &&
    left.plan === right.plan &&
    left.authMethod === right.authMethod &&
    areAgentConnectedProvidersEqual(left.connectedProviders, right.connectedProviders)
  );
}

/**
 * Compare the presentation- and runtime-scoped status fields that carry nested
 * provider-owned shapes (per-presentation auth, named runtime variants, session
 * runtime routing). Structural equality via `JSON.stringify` is intentional:
 * these payloads are adapter-produced, key-order-stable, and cheap to serialize,
 * and every consumer only needs "did the provider report something different".
 *
 * Shared by the renderer status store and the status slice so their change
 * detection cannot drift apart.
 */
export function areAgentPresentationRuntimeFieldsEqual(
  left: Pick<
    AgentStatus,
    | "presentationAuthStates"
    | "presentationAuthUsesProviderLogin"
    | "runtimeVariants"
    | "sessionRuntimeRouting"
  >,
  right: Pick<
    AgentStatus,
    | "presentationAuthStates"
    | "presentationAuthUsesProviderLogin"
    | "runtimeVariants"
    | "sessionRuntimeRouting"
  >,
): boolean {
  return (
    JSON.stringify(left.presentationAuthStates ?? {}) ===
      JSON.stringify(right.presentationAuthStates ?? {}) &&
    JSON.stringify(left.presentationAuthUsesProviderLogin ?? {}) ===
      JSON.stringify(right.presentationAuthUsesProviderLogin ?? {}) &&
    JSON.stringify(left.runtimeVariants ?? {}) === JSON.stringify(right.runtimeVariants ?? {}) &&
    JSON.stringify(left.sessionRuntimeRouting ?? {}) ===
      JSON.stringify(right.sessionRuntimeRouting ?? {})
  );
}

export function compactAgentProviderMetadata(
  metadata: AgentProviderMetadata | undefined,
): AgentProviderMetadata | undefined {
  if (!metadata) return undefined;
  const connectedProviders = metadata.connectedProviders?.filter(
    (provider) => provider.label.trim().length > 0,
  );
  const compacted: AgentProviderMetadata = {
    ...(metadata.authenticatedAs?.trim()
      ? { authenticatedAs: metadata.authenticatedAs.trim() }
      : {}),
    ...(metadata.organization?.trim() ? { organization: metadata.organization.trim() } : {}),
    ...(metadata.plan?.trim() ? { plan: metadata.plan.trim() } : {}),
    ...(metadata.authMethod?.trim() ? { authMethod: metadata.authMethod.trim() } : {}),
    ...(connectedProviders?.length ? { connectedProviders } : {}),
  };
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}
