import type { McpServer } from "@/shared/contracts";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import { pickRemoteSettings } from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import { reportSettingsError } from "@/backend/BackendSettingsNotifications";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { SettingsCompatWriter } from "@/backend/settings/settingsCompatWrites";
import type { OwnedHostRuntime } from "@/backend/ownership/HostOwnerController";
import {
  createRemoteMcpSettingsGateway,
  type RemoteMcpSettingsGateway,
} from "@/main/remote/RemoteMcpSettingsGateway";

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
  /** Compat whole-snapshot write for `BackendDurableServices` (fire-and-forget). */
  writeSharedSettings(next: SharedSettings): void;
  /** Trusted single-field CAS edit (learned routing records, MCP servers). */
  editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult>;
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
    commandMcpServers(command: Parameters<RemoteMcpSettingsGateway["command"]>[0]): {
      servers: McpServer[];
    };
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
    readSettings(): SharedSettings;
    readProject: Parameters<typeof createRemoteMcpSettingsGateway>[0]["readProject"];
    writeProject: Parameters<typeof createRemoteMcpSettingsGateway>[0]["writeProject"];
    projectsChanged(): void;
    reportError?: (error: unknown) => void;
  },
): Promise<HeadlessSettingsComposition> {
  const report = (error: unknown): void => reportSettingsError(error, options.reportError);
  // Host-root preparation and key initialization completed before composition;
  // re-assert the lease so an aborted or lost runtime never opens an authority.
  runtime.lease.assertActive();
  const authority = await SettingsAuthority.open({
    lease: runtime.lease,
    assertPersistentCredentials: () => runtime.credentialCapabilities.assertCanPersistSecrets(),
    ...(options.reportError ? { reportError: options.reportError } : {}),
  });
  const writes = new SettingsCompatWriter(authority);
  const mcpSettings = createRemoteMcpSettingsGateway({
    readSettings: options.readSettings,
    writeGlobalServers: (mcpServers) => {
      void writes
        .editSettingsField("mcpServers", () => mcpServers)
        .then((result) => {
          if (result.status !== "committed")
            report(new Error(`MCP server settings were not committed (${result.status}).`));
        })
        .catch(report);
    },
    readProject: options.readProject,
    writeProject: options.writeProject,
    projectsChanged: options.projectsChanged,
  });
  return {
    writeSharedSettings: (next) => {
      void writes.commitCompatSnapshot(next).catch(report);
    },
    editSettingsField: (field, compute) => writes.editSettingsField(field, compute),
    updateRemoteSettings: async (patch) =>
      pickRemoteSettings(await writes.commitCompatPatch(patch)),
    mcpSettings,
    remoteSettingsGateway: (mcp) => ({
      read: () => pickRemoteSettings(options.readSettings()),
      update: async (patch) => pickRemoteSettings(await writes.commitCompatPatch(patch)),
      readMcpServers: () => mcp.read(),
      commandMcpServers: (command) => mcp.command(command),
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
