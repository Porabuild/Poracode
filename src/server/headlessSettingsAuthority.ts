import type { McpServer } from "@/shared/contracts";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import { pickRemoteSettings, remoteHostWorkspaces } from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult, SettingsOwnerEdit } from "@/shared/settingsTransactions";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { SettingsCompatWriter } from "@/backend/settings/settingsCompatWrites";
import type { OwnedHostRuntime } from "@/backend/ownership/HostOwnerController";
import {
  createRemoteAgentProfilesGateway,
  type RemoteAgentProfilesGateway,
} from "@/host/remote/RemoteAgentProfilesGateway";
import {
  createRemoteMcpSettingsGateway,
  type RemoteMcpSettingsGateway,
} from "@/host/remote/RemoteMcpSettingsGateway";

/**
 * Headless settings custody. The owned runtime's lease and credential
 * capabilities back one `SettingsAuthority`; every headless settings writer —
 * durable-services writes, the MCP settings gateway, the remote
 * `POST /api/settings` patch — commits through it as scoped compare-and-swap
 * edits instead of patching the file behind the authority's back. A session-only
 * key refuses new durable secret ciphertext at the authority's persistence
 * guard, which completes the HOST_OWNERSHIP.md writer obligation.
 */
export interface HeadlessSettingsComposition {
  /** Compute a guarded preference edit from the latest authority snapshot. */
  editPreferences(
    compute: (current: SharedSettings) => SharedSettings,
  ): Promise<SettingsMutationResult>;
  /** Trusted single-field CAS edit (learned routing records, MCP servers). */
  editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult>;
  editSettingsFields<F extends keyof SharedSettings>(
    fields: readonly F[],
    compute: (current: SharedSettings) => Pick<SharedSettings, F>,
  ): Promise<SettingsMutationResult>;
  /** Trusted owner-runtime subject edits (supervisor registry records). */
  commitOwnerEdits(edits: readonly SettingsOwnerEdit[]): Promise<void>;
  /** Remote `POST /api/settings` patch as scoped CAS edits. */
  updateRemoteSettings(patch: RemoteSettingsPatch): Promise<RemoteSettings>;
  /** The MCP settings gateway, persisting global servers through the authority. */
  readonly mcpSettings: RemoteMcpSettingsGateway;
  /** Full `RemoteAccessServer` settings surface; MCP delegates come from the gateway. */
  remoteSettingsGateway(
    mcp: Pick<RemoteMcpSettingsGateway, "command" | "read" | "resolveScope" | "resolveServer">,
  ): Pick<RemoteMcpSettingsGateway, "resolveScope" | "resolveServer"> & {
    read(): RemoteSettings;
    update(patch: RemoteSettingsPatch): Promise<RemoteSettings>;
    readMcpServers(): { servers: McpServer[] };
    commandMcpServers: RemoteMcpSettingsGateway["command"];
    readAgentProfiles: RemoteAgentProfilesGateway["read"];
    commandAgentProfiles: RemoteAgentProfilesGateway["command"];
  };
  /** Push-coordinator projection of the committed settings. */
  pushSettings(): { enabled: boolean; redactContent: boolean };
  /** Thread-notification projection of the committed settings. */
  threadNotificationSettings(): Pick<
    SharedSettings,
    "notificationsEnabled" | "notificationStatuses" | "notifyL2Cli"
  >;
  /** Drains queued commits before the runtime's lease is released. */
  dispose(): Promise<void>;
}

export async function composeHeadlessSettingsAuthority(
  runtime: OwnedHostRuntime,
  options: {
    assertPreparedDatabaseForWrite(): void;
    readSettings(): SharedSettings;
    readProject: Parameters<typeof createRemoteMcpSettingsGateway>[0]["readProject"];
    writeProject: Parameters<typeof createRemoteMcpSettingsGateway>[0]["writeProject"];
    projectsChanged(): void;
    settingsCommitted?(settings: SharedSettings): void;
    reportError?: (error: unknown) => void;
  },
): Promise<HeadlessSettingsComposition> {
  // Host-root preparation and key initialization completed before composition;
  // re-assert the lease so an aborted or lost runtime never opens an authority.
  runtime.lease.assertActive();
  const authority = await SettingsAuthority.open({
    lease: runtime.lease,
    onCommitted: (_result, settings) => options.settingsCommitted?.(settings),
    assertPreparedDatabaseForWrite: options.assertPreparedDatabaseForWrite,
    assertPersistentCredentials: () => runtime.credentialCapabilities.assertCanPersistSecrets(),
    ...(options.reportError ? { reportError: options.reportError } : {}),
  });
  const writes = new SettingsCompatWriter(authority);
  const mcpSettings = createRemoteMcpSettingsGateway({
    readSettings: options.readSettings,
    editGlobalServers: async (edit) => {
      const result = await writes.editSettingsField("mcpServers", (current) =>
        edit(current.mcpServers),
      );
      if (result.status !== "committed") {
        throw new Error(`MCP server settings were not committed (${result.status}).`);
      }
    },
    readProject: options.readProject,
    writeProject: options.writeProject,
    projectsChanged: options.projectsChanged,
  });
  const agentProfiles = createRemoteAgentProfilesGateway({
    readSettings: options.readSettings,
    editSettingsFields: (fields, compute) => writes.editSettingsFields(fields, compute),
  });
  return {
    editPreferences: (compute) => writes.editPreferences(compute),
    editSettingsField: (field, compute) => writes.editSettingsField(field, compute),
    editSettingsFields: (fields, compute) => writes.editSettingsFields(fields, compute),
    commitOwnerEdits: (edits) => writes.commitOwnerEdits(edits),
    updateRemoteSettings: async (patch) =>
      pickRemoteSettings(await writes.commitCompatPatch(patch)),
    mcpSettings,
    remoteSettingsGateway: (mcp) => ({
      read: () => pickRemoteSettings(options.readSettings()),
      readWorkspaces: () => remoteHostWorkspaces(options.readSettings()),
      update: async (patch) => pickRemoteSettings(await writes.commitCompatPatch(patch)),
      readMcpServers: () => mcp.read(),
      commandMcpServers: (command) => mcp.command(command),
      readAgentProfiles: () => agentProfiles.read(),
      commandAgentProfiles: (command) => agentProfiles.command(command),
      resolveScope: (scope) => mcp.resolveScope(scope),
      resolveServer: (scope, serverId) => mcp.resolveServer(scope, serverId),
    }),
    pushSettings: () => {
      const settings = options.readSettings();
      return {
        enabled: settings.remotePushEnabled,
        redactContent: settings.remotePushRedactContent,
      };
    },
    threadNotificationSettings: () => {
      const settings = options.readSettings();
      return {
        notificationsEnabled: settings.notificationsEnabled,
        notificationStatuses: settings.notificationStatuses,
        notifyL2Cli: settings.notifyL2Cli,
      };
    },
    dispose: () => authority.close(),
  };
}
