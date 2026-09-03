import type {
  AgentKind,
  AgentStatus,
  AgentStatusesResponse,
  AcpRegistryInstallTarget,
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
import { msg } from "@/shared/messages";
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
  persistAcpRegistrySettingsMigrations,
  pruneWslAcpRegistryPendingDeletes,
  readAcpRegistrySettings,
  repairAcpRegistryInstallLayouts,
  removeAcpRegistryAgent as removeAcpRegistryAgentFromRegistry,
  setAcpGenericAgentAuthAcknowledged,
  setAcpRegistryAgentAuth as setAcpRegistryAgentAuthInRegistry,
  updateAcpRegistryAgent as updateAcpRegistryAgentFromRegistry,
} from "../agents/acpRegistry";
import { pruneAcpRegistryPendingDeletes } from "../agents/acpRegistryInstallDir";
import {
  detectProbeLocation,
  readDetectedVersion,
  resolveAgentEnvContext,
  type AgentAdapter,
  type AgentEnvContext,
} from "../agents/base";
import {
  getLatestSupportedNpmPackageVersion,
  getLatestVersionForAdapter,
  runUpdateCommandWithFallback,
} from "../agents/updateAgent";
import { clearAgentBinaryPathCache } from "../agents/binaryResolver";
import { acpAutoInstallKey, collectFirstClassAcpAutoInstalls } from "./firstClassAcpAutoInstall";
import type { AgentStatusService } from "./agentStatusService";
import type { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

const FIRST_CLASS_ACP_AUTO_INSTALL_ATTEMPTS = 2;
const FIRST_CLASS_ACP_AUTO_INSTALL_RETRY_DELAY_MS = 10_000;
/**
 * How long a failed sweep is left alone before a later status query may try
 * again. Long enough that polling cannot hammer a download, short enough that a
 * machine which was offline (or whose CDN fetch blipped) at launch reconciles
 * without restarting the app.
 */
const FIRST_CLASS_ACP_AUTO_INSTALL_RETRY_COOLDOWN_MS = 15 * 60_000;

export interface AgentRegistryServiceDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  settingsPath: string;
  baseDir: string;
  acpIconsDir: string;
  sharedSettingsCache: SupervisorSharedSettingsCache;
  getAgentStatusService: () => AgentStatusService;
  getActiveWslProjectDistros: () => string[];
  /** Stop every live thread hosting `agentKind`. */
  closeThreadsForAgentKind: (agentKind: AgentKind) => Promise<void>;
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

  /**
   * Auto-install sweeps run so far this session, keyed by agent id +
   * environment. Recorded before the attempt so a status-query burst cannot
   * start several downloads of the same artifact, and kept unresolved on
   * failure so the next sweep past the cooldown can retry — a transient failure
   * used to disable chat for the rest of the session.
   */
  private readonly acpAutoInstallSweeps = new Map<string, { at: number; installed: boolean }>();
  /** Settings files confirmed free of legacy Antigravity ACP state on disk. */
  private readonly aliasPersistCheckedPaths = new Set<string>();

  constructor(private readonly deps: AgentRegistryServiceDeps) {}

  private get agentStatusService(): AgentStatusService {
    return this.deps.getAgentStatusService();
  }

  private firstClassAdapterForRegistryId(agentId: string): AgentAdapter | undefined {
    return [...this.deps.adapters.values()].find(
      (adapter) => adapter.firstClassAcpRegistryId === agentId,
    );
  }

  private adapterKindForRegistryId(agentId: string): AgentKind {
    return this.firstClassAdapterForRegistryId(agentId)?.kind ?? acpGenericKind(agentId);
  }

  private firstClassRegistryIdsByKind(): Map<AgentKind, string> {
    return new Map(
      [...this.deps.adapters.values()].flatMap((adapter) =>
        adapter.firstClassAcpRegistryId
          ? [[adapter.kind, adapter.firstClassAcpRegistryId] as const]
          : [],
      ),
    );
  }

  /** Run the reconciliation off the request path; it must never reject a status query. */
  private scheduleFirstClassAcpAutoInstall(response: AgentStatusesResponse): void {
    void this.autoInstallFirstClassAcpRuntimes(response).catch((error) => {
      console.warn("[supervisor] first-class ACP auto-install failed", error);
    });
  }

  /**
   * Complete a half-installed first-class provider: its CLI is detected but the
   * ACP registry artifact backing chat is not, so chat would silently stay
   * unavailable. Best-effort and fire-and-forget — a failed install just leaves
   * the terminal runtime, and an agent the user explicitly removed stays
   * removed (`acpRegistryAutoInstallOptOuts`).
   */
  private async autoInstallFirstClassAcpRuntimes(response: AgentStatusesResponse): Promise<void> {
    const now = Date.now();
    const candidates = collectFirstClassAcpAutoInstalls({
      statuses: [...response.windows, ...response.wsl],
      firstClassRegistryIds: this.firstClassRegistryIdsByKind(),
    }).filter((task) => {
      const sweep = this.acpAutoInstallSweeps.get(acpAutoInstallKey(task));
      if (!sweep) return true;
      return !sweep.installed && now - sweep.at >= FIRST_CLASS_ACP_AUTO_INSTALL_RETRY_COOLDOWN_MS;
    });
    if (candidates.length === 0) return;

    const optedOut = new Set(
      readAcpRegistrySettings(this.deps.settingsPath).acpRegistryAutoInstallOptOuts,
    );
    const installedKinds = new Set<AgentKind>();
    for (const task of candidates) {
      const sweepKey = acpAutoInstallKey(task);
      this.acpAutoInstallSweeps.set(sweepKey, { at: Date.now(), installed: false });
      // An opt-out is the user's decision, not a failure: settle it so the
      // cooldown never reopens the question.
      if (optedOut.has(task.agentId)) {
        this.acpAutoInstallSweeps.set(sweepKey, { at: Date.now(), installed: true });
        continue;
      }
      for (let attempt = 1; attempt <= FIRST_CLASS_ACP_AUTO_INSTALL_ATTEMPTS; attempt += 1) {
        try {
          await installAcpRegistryAgentFromRegistry({
            agentId: task.agentId,
            baseDir: this.deps.baseDir,
            settingsPath: this.deps.settingsPath,
            iconsDir: this.deps.acpIconsDir,
            target: task.target,
            adapterKind: task.agentKind,
            installKind: "first-class",
            respectAutoInstallOptOut: true,
          });
          installedKinds.add(task.agentKind);
          this.acpAutoInstallSweeps.set(sweepKey, { at: Date.now(), installed: true });
          break;
        } catch (error) {
          console.warn(
            `[supervisor] auto-install of ${task.agentId} for ${task.agentKind} failed (attempt ${attempt}/${FIRST_CLASS_ACP_AUTO_INSTALL_ATTEMPTS}):`,
            error instanceof Error ? error.message : String(error),
          );
          if (attempt < FIRST_CLASS_ACP_AUTO_INSTALL_ATTEMPTS) {
            if (
              readAcpRegistrySettings(
                this.deps.settingsPath,
              ).acpRegistryAutoInstallOptOuts.includes(task.agentId)
            ) {
              break;
            }
            await new Promise((resolve) =>
              setTimeout(resolve, FIRST_CLASS_ACP_AUTO_INSTALL_RETRY_DELAY_MS),
            );
          } else {
            console.warn(
              `[supervisor] ${task.agentId} stays uninstalled for ${task.agentKind}; retrying no sooner than ${Math.round(
                FIRST_CLASS_ACP_AUTO_INSTALL_RETRY_COOLDOWN_MS / 60_000,
              )} minutes from now. Its agent settings page offers a manual install.`,
            );
          }
        }
      }
    }
    if (installedKinds.size === 0) return;
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatuses([...installedKinds]);
  }

  private firstClassRegistryAgents(): Readonly<Record<string, AgentKind>> {
    return Object.fromEntries(
      [...this.deps.adapters.values()].flatMap((adapter) =>
        adapter.firstClassAcpRegistryId
          ? [[adapter.firstClassAcpRegistryId, adapter.kind] as const]
          : [],
      ),
    );
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
      .map(([id]) => this.adapterKindForRegistryId(id));
    if (acpKinds.length === 0) return;
    try {
      await this.agentStatusService.refreshAgentStatuses({
        wslDistros: this.deps.getActiveWslProjectDistros(),
        scope: { agentKinds: acpKinds },
      });
    } catch (error) {
      console.warn("[supervisor] refresh after acp-generic settings change failed", error);
    }
  }

  refreshAgentRegistryAdapters(): void {
    // The migration persist reads and parses the whole settings file; once it
    // reports the file clean, skip it on every later status poll.
    if (!this.aliasPersistCheckedPaths.has(this.deps.settingsPath)) {
      if (persistAcpRegistrySettingsMigrations(this.deps.settingsPath)) {
        this.deps.sharedSettingsCache.invalidate();
      } else {
        this.aliasPersistCheckedPaths.add(this.deps.settingsPath);
      }
    }
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
      await this.agentStatusService.refreshAgentStatuses({
        wslDistros: this.deps.getActiveWslProjectDistros(),
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
    const response = await this.agentStatusService.getAgentStatuses(payload);
    this.scheduleFirstClassAcpAutoInstall(response);
    return response;
  }

  async refreshAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatusesResponse> {
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    const response = await this.agentStatusService.refreshAgentStatuses(payload);
    this.scheduleFirstClassAcpAutoInstall(response);
    return response;
  }

  /**
   * Delete install directories a previous session had to park because the agent
   * binary was still locked (see `removeAcpRegistryInstallDir`). Distros with
   * recorded WSL installs sweep their own side — the Windows sweep cannot reach
   * into a distro where a running server forced the same park.
   */
  async pruneAcpRegistryLeftoversOnLaunch(): Promise<void> {
    await pruneAcpRegistryPendingDeletes(this.deps.baseDir);
    const wslDistros = new Set(
      Object.values(
        readAcpRegistrySettings(this.deps.settingsPath).acpRegistryInstalledAgents,
      ).flatMap((record) => Object.keys(record.installations?.wsl ?? {})),
    );
    await Promise.all(
      [...wslDistros].map((distro) =>
        pruneWslAcpRegistryPendingDeletes(distro).catch((error) => {
          console.warn(`[supervisor] WSL ACP leftover sweep failed for ${distro}`, error);
        }),
      ),
    );
  }

  /**
   * Bring already-extracted registry artifacts up to the current install
   * layout (see `ACP_REGISTRY_INSTALL_LAYOUT_VERSION`) and refresh the affected
   * statuses when a repair landed, so a chat runtime that failed its first
   * probe for a layout reason recovers this session.
   */
  async repairAcpRegistryInstallLayoutsOnLaunch(): Promise<void> {
    try {
      const changed = await repairAcpRegistryInstallLayouts({
        settingsPath: this.deps.settingsPath,
      });
      if (changed) await this.propagateAcpRegistryChange();
    } catch (error) {
      console.warn("[supervisor] launch ACP install layout repair failed", error);
    }
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
      firstClassAgents: this.firstClassRegistryAgents(),
    });
    if (autoUpdate.changed.length > 0) changed = true;
    if (changed) await this.propagateAcpRegistryChange();
    return registry;
  }

  /**
   * Payload additions shared by install/update: the requested environment plus
   * the first-class alias bookkeeping when a built-in adapter adopts this id.
   */
  private registryInstallOverrides(payload: {
    agentId: string;
    target?: AcpRegistryInstallTarget | undefined;
  }) {
    return {
      ...(payload.target ? { target: payload.target } : {}),
      ...(this.firstClassAdapterForRegistryId(payload.agentId)
        ? {
            adapterKind: this.adapterKindForRegistryId(payload.agentId),
            installKind: "first-class" as const,
          }
        : {}),
    };
  }

  async installAcpRegistryAgent(
    payload: InstallAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult> {
    const installed = await installAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.deps.baseDir,
      settingsPath: this.deps.settingsPath,
      iconsDir: this.deps.acpIconsDir,
      ...this.registryInstallOverrides(payload),
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatus(this.adapterKindForRegistryId(payload.agentId));
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
      ...this.registryInstallOverrides(payload),
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    await this.refreshAffectedAgentStatus(this.adapterKindForRegistryId(payload.agentId));
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
    const executionContext = await resolveAgentEnvContext(adapter, envContext);

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
        ? await runUpdateCommandWithFallback(adapter, status, executionContext, {
            verifyBuiltInSuccess: async () => {
              const refreshedVersion = await readDetectedVersion(
                detectProbeLocation(executionContext),
                status.executablePath,
                ["--version"],
              );
              return refreshedVersion !== undefined && refreshedVersion !== status.version;
            },
          })
        : await runUpdateCommandWithFallback(adapter, status, executionContext);
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
    // A thread still hosting the agent keeps its process alive, and on Windows
    // the running binary locks its own install directory — the delete would
    // fail with EPERM after the agent was already dropped from settings.
    await this.deps.closeThreadsForAgentKind(this.adapterKindForRegistryId(payload.agentId));
    const installed = await removeAcpRegistryAgentFromRegistry({
      agentId: payload.agentId,
      baseDir: this.deps.baseDir,
      settingsPath: this.deps.settingsPath,
    });
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(this.adapterKindForRegistryId(payload.agentId));
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
    void this.refreshAffectedAgentStatus(this.adapterKindForRegistryId(payload.agentId));
    return { installed };
  }

  async authenticateAcpAgent(payload: AuthenticateAcpAgentPayload): Promise<void> {
    const adapter = this.deps.adapters.get(payload.agentKind);
    if (!adapter) {
      throw new Error(`Unknown agent: ${payload.agentKind}`);
    }
    const ctx = envContextFromPayload(payload.envKind, payload.wslDistro);
    const executionCtx = await dispatchAcpAuthenticate({
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
    const instanceId =
      extractAcpGenericInstanceId(payload.agentKind) ?? adapter.firstClassAcpRegistryId;
    if (instanceId !== undefined) {
      const instance = readAcpRegistrySettings(this.deps.settingsPath).agentInstances[instanceId];
      const verified =
        instance !== undefined && (await verifyAcpGenericAuthentication(instance, executionCtx));
      if (!verified) {
        setAcpGenericAgentAuthAcknowledged(
          this.deps.settingsPath,
          instanceId,
          executionCtx ?? ctx,
          false,
        );
        this.deps.sharedSettingsCache.invalidate();
        this.refreshAgentRegistryAdapters();
        void this.refreshAffectedAgentStatus(payload.agentKind);
        throw new Error(msg("acp.authenticationUnverified", { agent: adapter.label }));
      }
      setAcpGenericAgentAuthAcknowledged(
        this.deps.settingsPath,
        instanceId,
        executionCtx ?? ctx,
        true,
      );
    } else {
      const status = await adapter.detectInstall(executionCtx);
      if (status.authState === "missing") {
        void this.refreshAffectedAgentStatus(payload.agentKind);
        throw new Error(msg("acp.authenticationUnverified", { agent: adapter.label }));
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
    const instanceId =
      extractAcpGenericInstanceId(payload.agentKind) ?? adapter.firstClassAcpRegistryId;
    // Best-effort ACP-side logout only applies to generic ACP instances. The
    // local ack is their source of truth, so unsupported ACP logout can still
    // clear the UI state. Native adapters must not report success unless the
    // agent actually accepts the logout request.
    try {
      const executionCtx = await dispatchAcpLogout({
        adapter,
        ...(payload.envKind ? { envKind: payload.envKind } : {}),
        ...(payload.wslDistro ? { wslDistro: payload.wslDistro } : {}),
      });
      if (instanceId !== undefined) {
        setAcpGenericAgentAuthAcknowledged(
          this.deps.settingsPath,
          instanceId,
          executionCtx ?? ctx,
          false,
        );
      }
    } catch (error) {
      if (instanceId === undefined || !isUnsupportedAcpLogoutError(error)) throw error;
      setAcpGenericAgentAuthAcknowledged(this.deps.settingsPath, instanceId, ctx, false);
    }
    this.deps.sharedSettingsCache.invalidate();
    this.refreshAgentRegistryAdapters();
    void this.refreshAffectedAgentStatus(payload.agentKind);
  }
}
