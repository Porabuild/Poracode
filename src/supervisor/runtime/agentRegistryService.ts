import type {
  AgentKind,
  AgentStatus,
  AgentStatusesResponse,
  AcpRegistryListResult,
  AcpRegistryMutationResult,
  GetAgentStatusesPayload,
  AuthenticateAcpAgentPayload,
  InstallAcpRegistryAgentPayload,
  LogoutAcpAgentPayload,
  SetAcpRegistryAgentAuthPayload,
  UpdateAcpRegistryAgentPayload,
  UpdateAgentBinaryPayload,
  UpdateAgentBinaryResult,
  GetLatestAgentVersionPayload,
  GetLatestAgentVersionResult,
  ResolveAgentAccountPayload,
  ResolveAgentAccountResult,
  RemoveAcpRegistryAgentPayload,
} from "@/shared/contracts";
import { acpGenericKind, extractAcpGenericInstanceId } from "@/shared/contracts";
import { verifyAcpGenericAuthentication } from "../agents/acp-generic";
import {
  dispatchAcpAuthenticate,
  dispatchAcpLogout,
  envContextFromPayload,
  isUnsupportedAcpLogoutError,
} from "../agents/acp";
import { buildAgentRegistry } from "../agents/registry";
import {
  autoUpdateAcpRegistryAgents,
  backfillAcpRegistryAgentIcons,
  cacheLocalAcpRegistryIcons,
  fetchAcpRegistry,
  installAcpRegistryAgent as installAcpRegistryAgentFromRegistry,
  readAcpRegistrySettings,
  removeAcpRegistryAgent as removeAcpRegistryAgentFromRegistry,
  setAcpGenericAgentAuthAcknowledged,
  setAcpRegistryAgentAuth as setAcpRegistryAgentAuthInRegistry,
  updateAcpRegistryAgent as updateAcpRegistryAgentFromRegistry,
} from "../agents/acpRegistry";
import {
  detectProbeLocation,
  readDetectedVersion,
  type AgentAdapter,
  type AgentEnvContext,
} from "../agents/base";
import {
  getLatestSupportedNpmPackageVersion,
  getLatestVersionForAdapter,
  runUpdateCommandWithFallback,
} from "../agents/updateAgent";
import { clearAgentBinaryPathCache } from "../agents/binaryResolver";
import type { AgentStatusService } from "./agentStatusService";
import type { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

export interface AgentRegistryServiceDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  settingsPath: string;
  baseDir: string;
  acpIconsDir: string;
  sharedSettingsCache: SupervisorSharedSettingsCache;
  getAgentStatusService: () => AgentStatusService;
}

/**
 * Owns the agent/ACP registry cluster: adapter rebuilds from persisted registry
 * settings, agent status queries, the ACP registry
 * list/install/update/remove/auth surface, agent binary updates, and ACP
 * authenticate/logout. Extracted verbatim from
 * `SupervisorRuntime`; the runtime keeps thin delegates so its public API is
 * unchanged.
 */
export class AgentRegistryService {
  /** Short-lived per-kind cache for resolved provider accounts, so reopening
   * the settings page doesn't re-run a possibly process-spawning probe. */
  private readonly agentAccountCache = new Map<
    string,
    { value: NonNullable<ResolveAgentAccountResult["account"]>; at: number }
  >();

  constructor(private readonly deps: AgentRegistryServiceDeps) {}

  private get agentStatusService(): AgentStatusService {
    return this.deps.getAgentStatusService();
  }

  async listWslDistros(): Promise<string[]> {
    return this.agentStatusService.listWslDistros();
  }

  /**
   * Convert remote acp-generic icon URLs to locally-cached ones at launch so
   * the renderer receives `poracode-local://` icons this session (and
   * instantly on every future launch).
   */
  async cacheLocalAcpIconsOnLaunch(): Promise<void> {
    try {
      const changed = await cacheLocalAcpRegistryIcons({
        settingsPath: this.deps.settingsPath,
        iconsDir: this.deps.acpIconsDir,
      });
      if (changed) await this.propagateAcpRegistryChange();
    } catch (error) {
      console.warn("[supervisor] launch ACP icon cache failed", error);
    }
  }

  /**
   * Propagate an acp-generic settings change (icon localization, registry
   * update): invalidate the settings cache, rebuild adapters, and refresh the
   * affected acp-generic statuses so the renderer picks up fresh icons/auth.
   * Best-effort — refresh failures are swallowed so callers stay resilient.
   */
  private async propagateAcpRegistryChange(): Promise<void> {
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    const settings = readAcpRegistrySettings(this.deps.settingsPath);
    const acpKinds = Object.entries(settings.agentInstances)
      .filter(([, instance]) => instance.driver === "acp-generic")
      .map(([id]) => acpGenericKind(id));
    if (acpKinds.length === 0) return;
    try {
      const wslDistros = await this.agentStatusService.listWslDistros();
      await this.agentStatusService.refreshAgentStatuses({
        wslDistros,
        scope: { agentKinds: acpKinds },
      });
    } catch (error) {
      console.warn("[supervisor] refresh after acp-generic settings change failed", error);
    }
  }

  refreshAgentRegistryAdapters(): void {
    const settings = readAcpRegistrySettings(this.deps.settingsPath);
    const adapters = buildAgentRegistry(Object.values(settings.agentInstances));
    const nextKinds = new Set(adapters.map((adapter) => adapter.kind));
    for (const kind of [...this.deps.adapters.keys()]) {
      if (!nextKinds.has(kind)) {
        this.deps.adapters.delete(kind);
      }
    }
    for (const adapter of adapters) {
      this.deps.adapters.set(adapter.kind, adapter);
    }
  }

  private async refreshAffectedAgentStatus(agentKind: string): Promise<void> {
    await this.refreshAffectedAgentStatuses([agentKind]);
  }

  private async refreshAffectedAgentStatuses(agentKinds: AgentKind[]): Promise<void> {
    try {
      const wslDistros = await this.agentStatusService.listWslDistros();
      await this.agentStatusService.refreshAgentStatuses({
        wslDistros,
        scope: { agentKinds },
      });
    } catch (error) {
      console.warn(
        `[supervisor] refreshAffectedAgentStatuses failed for ${agentKinds.join(", ")}`,
        error,
      );
    }
  }

  private sharedInstallationAgentKinds(
    updatedStatus: AgentStatus,
    candidateStatuses: readonly AgentStatus[],
  ): AgentKind[] {
    const executablePath = updatedStatus.executablePath;
    if (!executablePath) return [updatedStatus.kind];
    const kinds = [
      ...new Set(
        candidateStatuses
          .filter(
            (candidate) =>
              candidate.installed &&
              candidate.executablePath === executablePath &&
              candidate.envKind === updatedStatus.envKind &&
              candidate.envDistro === updatedStatus.envDistro,
          )
          .map((candidate) => candidate.kind),
      ),
    ];
    return kinds.length > 0 ? kinds : [updatedStatus.kind];
  }

  async getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    return this.agentStatusService.getAgentStatuses(payload);
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    return this.agentStatusService.refreshAgentStatuses(payload);
  }

  async listAcpRegistry(): Promise<AcpRegistryListResult> {
    const registry = await fetchAcpRegistry();
    let changed = await backfillAcpRegistryAgentIcons({
      registry,
      settingsPath: this.deps.settingsPath,
      iconsDir: this.deps.acpIconsDir,
    });
    const autoUpdate = await autoUpdateAcpRegistryAgents({
      registry,
      baseDir: this.deps.baseDir,
      settingsPath: this.deps.settingsPath,
      iconsDir: this.deps.acpIconsDir,
    });
    if (autoUpdate.updated.length > 0) changed = true;
    if (changed) await this.propagateAcpRegistryChange();
    return registry;
  }

  async installAcpRegistryAgent(
    payload: InstallAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = await installAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.deps.baseDir,
      settingsPath: this.deps.settingsPath,
      iconsDir: this.deps.acpIconsDir,
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatus(acpGenericKind(payload.agentId));
    return { installed };
  }

  async updateAcpRegistryAgent(
    payload: UpdateAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = await updateAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.deps.baseDir,
      settingsPath: this.deps.settingsPath,
      iconsDir: this.deps.acpIconsDir,
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatus(acpGenericKind(payload.agentId));
    return { installed };
  }

  async updateAgentBinary(payload: UpdateAgentBinaryPayload): Promise<UpdateAgentBinaryResult> {
    const adapter = this.deps.adapters.get(payload.agentKind);
    if (!adapter) {
      return {
        ok: false,
        strategy: "unsupported",
        output: `No adapter registered for agent kind "${payload.agentKind}".`,
      };
    }

    const envContext: AgentEnvContext = {
      envKind: payload.envKind,
      ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
      baseDir: this.deps.baseDir,
    };

    const wslDistros = payload.envKind === "wsl" && payload.wslDistro ? [payload.wslDistro] : [];
    const statuses = await this.agentStatusService.refreshAgentStatuses({
      wslDistros,
      scope: {
        agentKinds: [payload.agentKind],
        envs:
          payload.envKind === "wsl" && payload.wslDistro
            ? [{ kind: "wsl", distro: payload.wslDistro }]
            : [{ kind: "native" }],
      },
    });
    const pool = payload.envKind === "wsl" ? statuses.wsl : statuses.windows;
    const status = pool.find(
      (entry) =>
        entry.kind === payload.agentKind &&
        (payload.envKind !== "wsl" || entry.envDistro === payload.wslDistro),
    );
    if (!status || !status.installed) {
      return {
        ok: false,
        strategy: "unsupported",
        output: `${adapter.label} is not installed in the requested environment.`,
      };
    }

    const verifyBuiltInVersionChange = (status.update ?? adapter.update)
      ?.verifyBuiltInVersionChange;
    const result =
      verifyBuiltInVersionChange && status.version
        ? await runUpdateCommandWithFallback(adapter, status, envContext, {
            verifyBuiltInSuccess: async () => {
              const refreshedVersion = await readDetectedVersion(
                detectProbeLocation(envContext),
                status.executablePath,
                ["--version"],
              );
              return refreshedVersion !== undefined && refreshedVersion !== status.version;
            },
          })
        : await runUpdateCommandWithFallback(adapter, status, envContext);
    if (result.ok) {
      // Drop the cached executable path so the next detection probe runs a
      // fresh `command -v` / `where.exe`. Without this we keep returning the
      // old path; for most package managers the path doesn't change after
      // an update, but for nvm/fnm/asdf and similar version-managed setups
      // the new binary can land at a different prefix and the cached entry
      // would resolve to a stale shim.
      clearAgentBinaryPathCache();
      await this.refreshAffectedAgentStatuses(this.sharedInstallationAgentKinds(status, pool));
    }
    return result;
  }

  async getLatestAgentVersion(
    payload: GetLatestAgentVersionPayload,
  ): Promise<GetLatestAgentVersionResult> {
    // A provider-managed package (Cursor's SDK, for example) has its own
    // release window, independent of the agent's CLI channel.
    if (payload.npmPackage) {
      return getLatestSupportedNpmPackageVersion(payload.npmPackage);
    }
    const adapter = this.deps.adapters.get(payload.agentKind);
    if (!adapter) return { source: "unknown" };
    return getLatestVersionForAdapter(adapter);
  }

  async resolveAgentAccount(
    payload: ResolveAgentAccountPayload,
  ): Promise<ResolveAgentAccountResult> {
    const adapter = this.deps.adapters.get(payload.agentKind);
    if (!adapter?.resolveAccount) return {};

    const ACCOUNT_TTL_MS = 5 * 60_000;
    const cached = this.agentAccountCache.get(payload.agentKind);
    if (cached && Date.now() - cached.at < ACCOUNT_TTL_MS) return { account: cached.value };

    const wslDistros = payload.wslDistros ?? [];
    const { windows } = await this.agentStatusService.getAgentStatuses({ wslDistros });
    const native = windows.find((status) => status.kind === payload.agentKind && status.installed);
    const account = await adapter
      .resolveAccount({ ...(native ? { status: native } : {}), wslDistros })
      .catch((error) => {
        console.warn(`[supervisor] ${payload.agentKind} account probe failed:`, error);
        return undefined;
      });
    if (account) {
      this.agentAccountCache.set(payload.agentKind, { value: account, at: Date.now() });
    }
    return account ? { account } : {};
  }

  async removeAcpRegistryAgent(
    payload: RemoveAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = removeAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.deps.baseDir,
      settingsPath: this.deps.settingsPath,
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    return { installed };
  }

  async setAcpRegistryAgentAuth(
    payload: SetAcpRegistryAgentAuthPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = setAcpRegistryAgentAuthInRegistry({
      agentId: payload.agentId,
      environment: payload.environment,
      settingsPath: this.deps.settingsPath,
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(acpGenericKind(payload.agentId));
    return { installed };
  }

  async authenticateAcpAgent(payload: AuthenticateAcpAgentPayload): Promise<void> {
    const adapter = this.deps.adapters.get(payload.agentKind);
    if (!adapter) {
      throw new Error(`Unknown agent: ${payload.agentKind}`);
    }
    const ctx = envContextFromPayload(payload.envKind, payload.wslDistro);
    await dispatchAcpAuthenticate({
      adapter,
      methodId: payload.methodId,
      ...(payload.envKind ? { envKind: payload.envKind } : {}),
      ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
    });
    // Generic ACP instances persist a per-env login acknowledgement so the
    // detection probe (which can't always tell whether the agent is signed in)
    // reports `authState: "authenticated"` on the next refresh. Native ACP
    // adapters (copilot/gemini/cursor) probe their own auth state directly
    // and don't need an ack.
    const instanceId = extractAcpGenericInstanceId(payload.agentKind);
    if (instanceId !== undefined) {
      const instance = readAcpRegistrySettings(this.deps.settingsPath).agentInstances[instanceId];
      const verified =
        instance !== undefined && (await verifyAcpGenericAuthentication(instance, ctx));
      if (!verified) {
        setAcpGenericAgentAuthAcknowledged(this.deps.settingsPath, instanceId, ctx, false);
        this.deps.sharedSettingsCache.invalidate();
        this.refreshAgentRegistryAdapters();
        void this.refreshAffectedAgentStatus(payload.agentKind);
        throw new Error("ACP authentication was not completed.");
      }
      setAcpGenericAgentAuthAcknowledged(this.deps.settingsPath, instanceId, ctx, true);
    } else {
      const status = await adapter.detectInstall(ctx);
      if (status.authState === "missing") {
        void this.refreshAffectedAgentStatus(payload.agentKind);
        throw new Error("ACP authentication was not completed.");
      }
    }
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(payload.agentKind);
  }

  async logoutAcpAgent(payload: LogoutAcpAgentPayload): Promise<void> {
    const adapter = this.deps.adapters.get(payload.agentKind);
    if (!adapter) {
      throw new Error(`Unknown agent: ${payload.agentKind}`);
    }
    const ctx = envContextFromPayload(payload.envKind, payload.wslDistro);
    const instanceId = extractAcpGenericInstanceId(payload.agentKind);
    // Best-effort ACP-side logout only applies to generic ACP instances. The
    // local ack is their source of truth, so unsupported ACP logout can still
    // clear the UI state. Native adapters must not report success unless the
    // agent actually accepts the logout request.
    try {
      await dispatchAcpLogout({
        adapter,
        ...(payload.envKind ? { envKind: payload.envKind } : {}),
        ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
      });
    } catch (error) {
      if (instanceId === undefined || !isUnsupportedAcpLogoutError(error)) throw error;
    }
    if (instanceId !== undefined) {
      setAcpGenericAgentAuthAcknowledged(this.deps.settingsPath, instanceId, ctx, false);
    }
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(payload.agentKind);
  }
}
