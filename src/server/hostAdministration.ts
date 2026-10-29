import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { administerPluginCatalog } from "./hostPluginCatalog";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  RemoteAccessServer,
  RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";
import { applyCreateProfile, applyProfileEnvironment } from "@/host/sharedSettingsFile";
import {
  containsMcpRedaction,
  sameMcpServerName,
  upsertMcpServerDefinition,
} from "@/host/mcpSettings";
import type { McpServer, McpLaunchSnapshot } from "@/shared/contracts/mcpServer";
import {
  AGENT_PROFILE_DRIVERS,
  agentProfileDriver,
  isAgentProfileDriver,
} from "@/shared/contracts/agentProfiles";
import { assertAgentProfileDependencies } from "@/shared/agentProfileDependencies";
import {
  AGENT_INSTANCE_REMOVAL_FIELDS,
  removeAgentInstanceSettings,
} from "@/shared/agentInstanceSettings";
import { agentConnectedProviderSchema } from "@/shared/contracts/agent";
import type { SharedSettings } from "@/shared/settings";
import {
  type HostAdminCommand,
  type HostAdminRequest,
  type HostAdminResult,
  hostAdminMcpInventorySchema,
  HOST_ADMIN_INVENTORY_FORMAT_VERSION,
  hostAdminProfileCreationCheckSchema,
  hostAdminProfileDriversSchema,
  hostAdminMcpChangeResultSchema,
  HOST_ADMIN_MCP_CHANGE_FORMAT_VERSION,
  HOST_ADMIN_MCP_DEFINITION_FORMAT_VERSION,
  hostAdminMcpDefinitionResultSchema,
  hostAdminMcpPreparationSchema,
  hostAdminMcpCreationCheckSchema,
} from "@/shared/hostAdminProtocol";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import type { HeadlessSettingsComposition } from "./headlessSettingsAuthority";
import {
  adminProviderSummary,
  HostProviderAuth,
  readAdminAgentStatus,
  type AdminSupervisorCall,
} from "./hostProviderAuth";
import { redactDiagnosticLine } from "./serverDoctorIo";
import {
  inspectSavedMcpServer,
  requireSavedMcpServer,
  summarizeMcpServer,
  summarizePluginInventory,
} from "./hostIntegrationInventory";
import { administerSession, type HostSessionReads } from "./hostSessionAdministration";
import { HostSessionExports } from "./hostSessionExport";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { administerIntegrationAccounts } from "./hostIntegrationAccounts";
import { administerIntegrationLogin } from "./hostIntegrationLogin";
import { administerProject } from "./hostProjects";
import { hostProjectAdditionSchema } from "@/shared/contracts/hostProjects";
import {
  HOST_RUN_FORMAT_VERSION,
  HOST_RUN_TOOL_EVENT_FORMAT_VERSION,
  hostRunDirectoryPreparationSchema,
  hostRunMetadataSchema,
} from "@/shared/contracts/hostRun";
import { dbGetProject } from "@/host/db";
import { HostRuns } from "./hostRuns";
import { deriveLocationFromPath } from "@/shared/createProject";
import type { SupervisorEvent } from "@/shared/ipc/events";
import { HostCustomProviders } from "./hostCustomProviders";
import { inspectProviderInventory } from "./hostProviderInventory";

export type HostAdministrationServer = Pick<
  RemoteAccessServer,
  | "issueIndependentPairingGrant"
  | "listAccessSessions"
  | "listPairingCredentials"
  | "publishCatalogChanged"
  | "revokeAccessSession"
  | "revokePairingCredentialById"
>;

export function createHostAdministration(options: {
  statusCachePath: string;
  call: AdminSupervisorCall;
  server: HostAdministrationServer;
  settings: Pick<HeadlessSettingsComposition, "editSettingsField" | "editSettingsFields">;
  readSettings(): SharedSettings;
  assertCanPersistSecrets(): void;
  sessions: HostSessionReads;
  sessionExportWorker?: { path: string; dbPath: string };
  resolveMcpLaunchSnapshot?(projectId: string): McpLaunchSnapshot;
  attachments?: NonNullable<RemoteAccessServerOptions["attachments"]>;
}) {
  const auth = new HostProviderAuth(options.call);
  const customProviders = new HostCustomProviders({
    ...options,
    onChanged: async (agentKind) => {
      try {
        await options.call("refreshAgentStatuses", {
          wslDistros: [],
          scope: { agentKinds: [agentKind], envs: [{ kind: "native" }] },
        });
      } catch {
        console.warn(
          "[host-admin] Provider configuration was saved; status reconciliation failed. Run providers list --refresh to retry discovery.",
        );
      }
    },
  });
  const exports = new HostSessionExports(options.sessionExportWorker);
  const runs = new HostRuns({
    call: options.call,
    readSettings: options.readSettings,
    ...(options.resolveMcpLaunchSnapshot
      ? { resolveMcpLaunchSnapshot: options.resolveMcpLaunchSnapshot }
      : {}),
    publishCatalogChanged: () => options.server.publishCatalogChanged(),
    ...(options.attachments ? { attachments: options.attachments } : {}),
  });
  // This comparison key never leaves the host. HMAC also hides low-entropy
  // legacy cleartext values while binding every saved profile field.
  const profileRevisionKey = randomBytes(32);
  function profileRevision(instance: SharedSettings["agentInstances"][string]) {
    return createHmac("sha256", profileRevisionKey)
      .update("profile-v1\0")
      .update(JSON.stringify(instance))
      .digest("hex");
  }
  function mcpRevision(server: McpServer) {
    return createHmac("sha256", profileRevisionKey)
      .update("mcp-v1\0")
      .update(JSON.stringify(server))
      .digest("hex");
  }
  async function execute(input: HostAdminCommand, context: HostControlContext): Promise<unknown> {
    context.assertActive();
    switch (input.action) {
      case "run-tool-events-prepare": {
        const result = await execute(input.command, context);
        const command =
          input.command.action === "run-interactive-prepare"
            ? input.command.command
            : input.command;
        if (
          command.action === "run-directory-prepare" ||
          command.action === "run-directory-files-prepare"
        ) {
          const directory = hostRunDirectoryPreparationSchema.parse(result);
          runs.enableToolEvents(directory.run.runId, directory.run.threadId, context);
          return {
            ...directory,
            run: { ...directory.run, formatVersion: HOST_RUN_TOOL_EVENT_FORMAT_VERSION },
          };
        }
        const metadata = hostRunMetadataSchema.parse(result);
        runs.enableToolEvents(metadata.runId, metadata.threadId, context);
        return { ...metadata, formatVersion: HOST_RUN_TOOL_EVENT_FORMAT_VERSION };
      }
      case "run-interactive-prepare": {
        const result = await execute(input.command, context);
        const metadata =
          input.command.action === "run-directory-prepare" ||
          input.command.action === "run-directory-files-prepare"
            ? hostRunDirectoryPreparationSchema.parse(result).run
            : hostRunMetadataSchema.parse(result);
        runs.enableInteraction(metadata.runId, metadata.threadId, context);
        return result;
      }
      case "run-request-read":
      case "run-request-respond":
        return runs.interact(input, context);
      case "providers-inventory":
        return inspectProviderInventory(input, options);
      case "custom-providers": {
        return customProviders.execute(input.command, context);
      }
      case "run-options":
      case "run-prepare":
      case "run-resume-prepare":
      case "run-files-prepare":
      case "run-resume-files-prepare":
      case "run-start":
      case "run-read":
      case "run-cancel":
        return runs.execute(input, context);
      case "run-directory-options":
      case "run-directory-prepare":
      case "run-directory-files-prepare": {
        if (input.action === "run-directory-files-prepare" && !options.attachments)
          throw new Error(
            "This owner has no CLI attachment storage. Upgrade it explicitly before retrying.",
          );
        if (deriveLocationFromPath(input.directory, process.platform).kind === "wsl")
          throw new Error(
            "Controlled directory runs in WSL are not qualified for joined cancellation. Use the selected distro's supported terminal workflow; no project was registered or native fallback attempted.",
          );
        const project = hostProjectAdditionSchema.parse(
          await administerProject({ action: "projects-add", path: input.directory }, context),
        );
        options.server.publishCatalogChanged();
        context.assertActive();
        if (project.project.disabled)
          throw new Error(
            "The project at this directory is disabled. Enable it explicitly before running.",
          );
        const directorySelection = {
          formatVersion: HOST_RUN_FORMAT_VERSION,
          scope: "controlled-directory-run",
          project: project.project,
          created: project.created,
        };
        const assertDirectory = () => {
          context.assertActive();
          const current = dbGetProject(project.project.id);
          if (
            !current ||
            current.disabled ||
            !isDeepStrictEqual(current.location, project.project.location)
          )
            throw new Error(
              "The directory selection changed during preparation. Prepare the run again.",
            );
        };
        const directoryContext = { ...context, assertActive: assertDirectory };
        const target = { projectId: project.project.id, agentKind: input.agentKind };
        if (input.action === "run-directory-options") {
          const choices = await runs.execute(
            { ...target, action: "run-options" },
            directoryContext,
          );
          return { ...directorySelection, options: choices };
        }
        const preparation = {
          ...target,
          model: input.model,
          prompt: input.prompt,
          ...(input.effort !== undefined ? { effort: input.effort } : {}),
          ...(input.approvalPolicy !== undefined ? { approvalPolicy: input.approvalPolicy } : {}),
          ...(input.sandboxMode !== undefined ? { sandboxMode: input.sandboxMode } : {}),
        };
        const run = await runs.execute(
          input.action === "run-directory-files-prepare"
            ? { ...preparation, action: "run-files-prepare", files: input.files }
            : { ...preparation, action: "run-prepare" },
          directoryContext,
        );
        return { ...directorySelection, run };
      }
      case "projects-list":
      case "projects-inspect":
        return administerProject(input, context);
      case "projects-add": {
        const result = await administerProject(input, context);
        options.server.publishCatalogChanged();
        return result;
      }
      case "sessions-export-start":
        if (options.sessions.readThread(input.threadId)?.id !== input.threadId)
          throw new Error("Persisted session not found in this profile. Run sessions list.");
        return exports.execute(input, context);
      case "sessions-export-read":
      case "sessions-export-cancel":
        return exports.execute(input, context);
      case "catalogs-list":
      case "catalogs-add":
      case "catalogs-inspect":
      case "catalogs-refresh":
      case "catalogs-remove":
      case "package-inspect":
      case "package-install":
      case "package-update":
      case "package-remove":
      case "plugin-enabled":
        return administerPluginCatalog(input, context, options);
      case "mcp-auth-start":
      case "mcp-auth-wait":
      case "plugin-account-start":
      case "plugin-account-wait":
      case "integration-auth-cancel":
        return administerIntegrationLogin(input, context, {
          call: options.call,
          readSettings: options.readSettings,
          assertCanPersistSecrets: options.assertCanPersistSecrets,
          revisionKey: profileRevisionKey,
        });
      case "plugin-accounts-list":
      case "plugin-account-select":
      case "plugin-account-logout":
      case "mcp-auth-status":
      case "mcp-auth-logout":
        return administerIntegrationAccounts(input, context, {
          call: options.call,
          readSettings: options.readSettings,
          assertCanPersistSecrets: options.assertCanPersistSecrets,
          revisionKey: profileRevisionKey,
        });
      case "mcp-check-add": {
        options.assertCanPersistSecrets();
        if (
          options
            .readSettings()
            .mcpServers.some(
              (server) =>
                server.id === input.serverId || sameMcpServerName(server.name, input.name),
            )
        )
          throw new Error(
            "A saved user MCP server already uses this ID or name. Use mcp configure for replacement; no values were collected or saved.",
          );
        return hostAdminMcpCreationCheckSchema.parse({
          formatVersion: HOST_ADMIN_INVENTORY_FORMAT_VERSION,
          scope: "saved-user",
          checked: true,
          serverId: input.serverId,
          name: input.name,
        });
      }
      case "sessions-list":
      case "sessions-inspect":
      case "sessions-stop":
        return administerSession(input, context, options.sessions, options.call);
      case "sessions-update": {
        const result = await administerSession(input, context, options.sessions, options.call);
        options.server.publishCatalogChanged();
        return result;
      }
      case "mcp-prepare-configuration": {
        options.assertCanPersistSecrets();
        const server = requireSavedMcpServer(options.readSettings().mcpServers, input.serverId);
        return hostAdminMcpPreparationSchema.parse({
          ...summarizeMcpServer(server),
          serverRevision: mcpRevision(server),
        });
      }
      case "mcp-add":
      case "mcp-configure-checked": {
        options.assertCanPersistSecrets();
        if (containsMcpRedaction(input.server.transport))
          throw new Error(
            "Full MCP definitions require explicit values, not redaction markers. No stored credentials were copied.",
          );
        const result = await options.settings.editSettingsField("mcpServers", (current) => {
          context.assertActive();
          if (input.action === "mcp-add") {
            if (current.mcpServers.some((server) => server.id === input.server.id))
              throw new Error(
                "A saved MCP server already uses this ID. Use mcp configure with its exact ID.",
              );
          } else {
            const server = requireSavedMcpServer(current.mcpServers, input.server.id);
            if (
              !timingSafeEqual(
                Buffer.from(input.expectedServerRevision, "hex"),
                Buffer.from(mcpRevision(server), "hex"),
              )
            )
              throw new Error(
                "The selected MCP server changed. Nothing was saved; run mcp configure again and review its definition.",
              );
          }
          return upsertMcpServerDefinition(
            current.mcpServers,
            input.server,
            (code) =>
              new Error(
                code === "mcp_duplicate_name"
                  ? "A saved MCP server already uses this name. Choose a unique name; no other server was replaced."
                  : "MCP redaction markers cannot be saved without existing values.",
              ),
          );
        });
        context.assertActive();
        if (result.status !== "committed")
          throw new Error(
            `MCP definition was not committed (${result.status}); inspect mcp list before retrying.`,
          );
        return hostAdminMcpDefinitionResultSchema.parse({
          formatVersion: HOST_ADMIN_MCP_DEFINITION_FORMAT_VERSION,
          scope: "saved-user",
          change: input.action === "mcp-add" ? "add" : "configure",
          serverId: input.server.id,
        });
      }
      case "mcp-set-enabled":
      case "mcp-remove": {
        const result = await options.settings.editSettingsField("mcpServers", (current) => {
          context.assertActive();
          const server = requireSavedMcpServer(current.mcpServers, input.serverId);
          return input.action === "mcp-remove"
            ? current.mcpServers.filter((candidate) => candidate.id !== server.id)
            : current.mcpServers.map((candidate) =>
                candidate.id === server.id ? { ...candidate, enabled: input.enabled } : candidate,
              );
        });
        context.assertActive();
        if (result.status !== "committed")
          throw new Error(
            `MCP configuration change was not committed (${result.status}); inspect mcp list before retrying.`,
          );
        const metadata = {
          formatVersion: HOST_ADMIN_MCP_CHANGE_FORMAT_VERSION,
          scope: "saved-user",
          serverId: input.serverId,
        };
        return hostAdminMcpChangeResultSchema.parse(
          input.action === "mcp-remove"
            ? { ...metadata, change: "remove" }
            : { ...metadata, change: "set-enabled", enabled: input.enabled },
        );
      }
      case "providers-drivers":
        return hostAdminProfileDriversSchema.parse({
          formatVersion: HOST_ADMIN_INVENTORY_FORMAT_VERSION,
          scope: "saved-profile-drivers",
          drivers: AGENT_PROFILE_DRIVERS.map((driver) => ({
            id: driver.driver,
            credentialEnvironmentName: driver.credentialEnvVar ?? null,
          })),
        });
      case "providers-check-add": {
        options.assertCanPersistSecrets();
        agentProfileDriver(input.profile.driver)?.validateConfig?.(input.profile.config);
        const current = options.readSettings();
        // Empty values exercise canonical name checks and are discarded before
        // sealing. This intent is validated and discarded, never persisted.
        const environment = Object.fromEntries(
          input.environmentNames.map((name) => [name, { value: "" }]),
        );
        const next = applyCreateProfile(current, { ...input.profile, environment }, "");
        assertAgentProfileDependencies(current.agentInstances, next.settings.agentInstances);
        return hostAdminProfileCreationCheckSchema.parse({
          checked: true,
          profileId: next.instance.id,
          driver: next.instance.driver,
        });
      }
      case "plugins-list":
      case "plugins-refresh": {
        const result = await options.call(
          input.action === "plugins-list" ? "listPlugins" : "refreshPlugins",
          {},
        );
        context.assertActive();
        return summarizePluginInventory(result.plugins, options.readSettings().installedPlugins);
      }
      case "mcp-list":
        return hostAdminMcpInventorySchema.parse({
          formatVersion: HOST_ADMIN_INVENTORY_FORMAT_VERSION,
          scope: "saved-user",
          servers: options.readSettings().mcpServers.map(summarizeMcpServer),
        });
      case "mcp-inspect":
        return inspectSavedMcpServer(options.readSettings().mcpServers, input.serverId);
      case "providers-remove": {
        const result = await options.settings.editSettingsFields(
          AGENT_INSTANCE_REMOVAL_FIELDS,
          (current) => {
            context.assertActive();
            const instance = current.agentInstances[input.instanceId];
            if (!instance || !isAgentProfileDriver(instance.driver))
              throw new Error(
                "Profile not found. Run providers list; registry agents are not saved profiles.",
              );
            const next = removeAgentInstanceSettings(current, instance);
            assertAgentProfileDependencies(current.agentInstances, next.agentInstances);
            return next;
          },
        );
        if (result.status !== "committed")
          throw new Error(
            `Profile removal was not committed (${result.status}); retry the command.`,
          );
        return { removed: input.instanceId };
      }
      case "providers-unset-environment": {
        const result = await options.settings.editSettingsField("agentInstances", (current) => {
          context.assertActive();
          const instance = current.agentInstances[input.instanceId];
          if (!instance || !isAgentProfileDriver(instance.driver))
            throw new Error("Profile not found. Run providers list.");
          const names = new Set(input.names);
          const environment = Object.fromEntries(
            Object.entries(instance.environment ?? {}).filter(([name]) => !names.has(name)),
          );
          const next = applyProfileEnvironment(
            current,
            { instanceId: instance.id, environment },
            "",
          ).settings.agentInstances;
          assertAgentProfileDependencies(current.agentInstances, next);
          return next;
        });
        if (result.status !== "committed")
          throw new Error(
            `Environment removal was not committed (${result.status}); retry the command.`,
          );
        return { profileId: input.instanceId, unset: input.names };
      }
      case "auth-accounts": {
        if (input.runtime)
          throw new Error(
            "Account listing cannot target a runtime variant. No other runtime was used. Run auth methods for the selected provider.",
          );
        await readAdminAgentStatus(options.call, input);
        const result = await options.call("manageAgentCredentials", {
          agentKind: input.agentKind,
          env: input.wslDistro ? { kind: "wsl", distro: input.wslDistro } : { kind: "native" },
          action: "list",
        });
        return {
          agentKind: input.agentKind,
          environment: input.wslDistro
            ? { kind: "wsl", distro: input.wslDistro }
            : { kind: "native" },
          providers: z.array(agentConnectedProviderSchema).parse(result.providers),
        };
      }
      case "pairings-create":
        return options.server.issueIndependentPairingGrant({
          ttlMs: input.ttlMs,
          ...(input.preset !== undefined ? { preset: input.preset } : {}),
          ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
          ...(input.label !== undefined ? { label: input.label } : {}),
        });
      case "providers-list": {
        const response = await options.call("refreshAgentStatuses", {
          wslDistros: input.wslDistro ? [input.wslDistro] : [],
        });
        return {
          providers: [...response.windows, ...response.wsl]
            .filter((status) =>
              input.wslDistro
                ? status.envKind === "wsl" && status.envDistro === input.wslDistro
                : status.envKind !== "wsl",
            )
            .map(adminProviderSummary),
          profiles: Object.values(options.readSettings().agentInstances)
            .filter((instance) => isAgentProfileDriver(instance.driver))
            .map((instance) => ({
              id: instance.id,
              driver: instance.driver,
              displayName: instance.displayName,
              enabled: instance.enabled !== false,
              environmentNames: Object.keys(instance.environment ?? {}),
            })),
        };
      }
      case "providers-catalog": {
        const catalog = await options.call("listAcpRegistry", {});
        return {
          agents: catalog.agents.map((entry) => ({
            id: entry.id,
            name: entry.name,
            description: entry.description,
          })),
        };
      }
      case "providers-install": {
        await options.call("installAcpRegistryAgent", {
          agentId: input.agentId,
          target: input.wslDistro ? { kind: "wsl", distro: input.wslDistro } : { kind: "native" },
        });
        return { installed: input.agentId };
      }
      case "providers-prepare-configuration": {
        const instance = options.readSettings().agentInstances[input.instanceId];
        if (!instance || !isAgentProfileDriver(instance.driver))
          throw new Error(
            "Profile not found. Run providers list; registry agents are not saved profiles.",
          );
        return {
          profileId: instance.id,
          driver: instance.driver,
          ...(instance.displayName !== undefined ? { displayName: instance.displayName } : {}),
          profileRevision: profileRevision(instance),
        };
      }
      case "providers-add":
      case "providers-configure":
      case "providers-configure-checked": {
        if (input.action === "providers-add" && Object.keys(input.profile.environment ?? {}).length)
          options.assertCanPersistSecrets();
        if (input.action !== "providers-add" && Object.keys(input.environment ?? {}).length)
          options.assertCanPersistSecrets();
        const result = await options.settings.editSettingsField("agentInstances", (current) => {
          context.assertActive();
          if (input.action === "providers-add") {
            agentProfileDriver(input.profile.driver)?.validateConfig?.(input.profile.config);
            // All CLI environment values are sealed, including those whose
            // names are not known to a particular provider.
            const environment = Object.fromEntries(
              Object.entries(input.profile.environment ?? {}).map(([name, value]) => [
                name,
                { value: value.value, sensitive: true },
              ]),
            );
            const instances = applyCreateProfile(current, { ...input.profile, environment }, "")
              .settings.agentInstances;
            assertAgentProfileDependencies(current.agentInstances, instances);
            return instances;
          }
          const before = current.agentInstances[input.instanceId];
          if (!before || !isAgentProfileDriver(before.driver))
            throw new Error(
              "Profile does not exist. Use providers add for a new profile, or providers install for a registry provider.",
            );
          if (
            input.action === "providers-configure-checked" &&
            !timingSafeEqual(
              Buffer.from(input.expectedProfileRevision, "hex"),
              Buffer.from(profileRevision(before), "hex"),
            )
          )
            throw new Error(
              "The selected profile changed during configuration. Nothing was saved; run providers configure again and review the profile.",
            );
          let next = {
            ...before,
            ...(input.displayName ? { displayName: input.displayName } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.config !== undefined ? { config: input.config } : {}),
          };
          if (input.config !== undefined)
            agentProfileDriver(before.driver)?.validateConfig?.(input.config);
          if (input.environment !== undefined) {
            const environment = {
              ...before.environment,
              ...Object.fromEntries(
                Object.entries(input.environment).map(([name, value]) => [
                  name,
                  { value, sensitive: true },
                ]),
              ),
            };
            next = applyProfileEnvironment(
              { ...current, agentInstances: { ...current.agentInstances, [before.id]: next } },
              { instanceId: before.id, environment },
              "",
            ).instance;
          }
          const instances = { ...current.agentInstances, [before.id]: next };
          assertAgentProfileDependencies(current.agentInstances, instances);
          return instances;
        });
        if (result.status !== "committed")
          throw new Error(
            `Profile settings were not committed (${result.status}); retry the command.`,
          );
        return {
          profileId: input.action === "providers-add" ? input.profile.id : input.instanceId,
          saved: true,
        };
      }
      case "auth-methods": {
        const status = await readAdminAgentStatus(options.call, input);
        return {
          provider: adminProviderSummary(status),
          methods:
            status.authMethods?.map((method) => ({
              id: method.id,
              name: method.name,
              type: method.type ?? "agent",
              ...(method.type === "env_var" ? { variables: method.vars } : {}),
            })) ?? [],
          terminalLogin: Boolean(status.loginCommand),
          // Read-only reply hint; older owners omit it and clients keep their
          // terminal default. The closed request versions are unchanged.
          terminalPreferred: status.preferTerminalLogin === true,
          logout: status.authLogoutSupported === true,
        };
      }
      case "auth-login":
        return auth.login(input, context);
      case "auth-read":
        return auth.read(input.sessionId, input.cursor);
      case "auth-write":
        await auth.write(input.sessionId, input.data);
        return { accepted: true };
      case "auth-close":
        await auth.close(input.sessionId);
        return { closed: true };
      case "auth-logout": {
        const status = await readAdminAgentStatus(options.call, input);
        if (input.runtime && (input.credentialId || status.authLogoutSupported !== true))
          throw new Error(
            "The selected runtime does not support this logout operation. Use auth methods to inspect its account controls.",
          );
        const target = {
          envKind: input.wslDistro
            ? ("wsl" as const)
            : process.platform === "win32"
              ? ("windows" as const)
              : ("posix" as const),
          ...(input.wslDistro ? { wslDistro: input.wslDistro } : {}),
        };
        if (input.credentialId) {
          await options.call("manageAgentCredentials", {
            agentKind: input.agentKind,
            action: "remove",
            credentialId: input.credentialId,
            env: input.wslDistro ? { kind: "wsl", distro: input.wslDistro } : { kind: "native" },
          });
        } else {
          if (status.authLogoutSupported !== true)
            throw new Error(
              "This provider does not support account logout. Use --credential <id> for an upstream account listed by auth accounts <provider>.",
            );
          await options.call("logoutAcpAgent", { agentKind: input.agentKind, ...target });
        }
        return { loggedOut: true, agentKind: input.agentKind };
      }
      case "clients-list":
        return { clients: options.server.listAccessSessions() };
      case "clients-revoke": {
        if (!options.server.revokeAccessSession(input.sessionId))
          throw new Error("Client session not found. Run clients list.");
        return { revoked: input.sessionId };
      }
      case "pairings-list":
        return { pairings: options.server.listPairingCredentials() };
      case "pairings-revoke": {
        if (!options.server.revokePairingCredentialById(input.pairingId))
          throw new Error("Pairing link not found or already expired. Run pairings list.");
        return { revoked: input.pairingId };
      }
    }
  }
  return {
    async administer(
      input: HostAdminRequest,
      context: HostControlContext,
    ): Promise<HostAdminResult> {
      try {
        const data = await execute(input.command, context);
        context.assertActive();
        return {
          adminVersion: input.adminVersion,
          outcome: { ok: true, data: z.json().parse(JSON.parse(JSON.stringify(data))) },
        };
      } catch (error) {
        return {
          adminVersion: input.adminVersion,
          outcome: {
            ok: false,
            error: redactDiagnosticLine(
              error instanceof Error
                ? error.message
                : "Administration failed. Run doctor for diagnostics.",
            ).slice(0, 2_000),
          },
        };
      }
    },
    observe: (event: SupervisorEvent) => runs.observe(event),
    reset: () => runs.reset(),
    dispose: () =>
      joinRuntimeShutdown([() => auth.dispose(), () => exports.dispose(), () => runs.dispose()]),
  };
}
