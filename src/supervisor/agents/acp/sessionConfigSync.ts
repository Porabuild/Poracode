import type { ClientSideConnection, SessionUpdate } from "@agentclientprotocol/sdk";
import { isThreadConfigEqual, type ThreadConfig } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import {
  applyAcpModeUpdateToConfig,
  findSelectConfigOption,
  findThoughtLevelConfig,
  listSelectConfigOptionValues,
  resolveAcpMode,
  resolveModelConfigValue,
} from "./sessionConfig";
import { setUnstableSessionModel } from "./unstableModelCompat";

const CONFIG_OPTION_UPDATE_TIMEOUT_MS = 5_000;

type ConfigOptionUpdateWaiter = {
  configId: string;
  value: string;
  resolve: (matched: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Synchronizes Poracode thread configuration with one live ACP session.
 *
 * This object owns only the ACP-advertised configuration metadata needed to
 * translate subsequent updates. Session lifecycle and the committed
 * `ThreadConfig` remain owned by `AcpStructuredSession` and are passed in and
 * returned explicitly.
 */
export class AcpSessionConfigSync {
  private _availableModeIds: string[] = [];
  private currentConfigOptions: unknown[] = [];
  private modeConfigId: string | undefined;
  private modelConfigValue: string | undefined;
  private thoughtLevelConfigId: string | undefined;
  private readonly configOptionUpdateWaiters = new Set<ConfigOptionUpdateWaiter>();

  constructor(private readonly connection: ClientSideConnection) {}

  get availableModeIds(): string[] {
    return this._availableModeIds;
  }

  rememberAvailableModes(availableModeIds: string[]): void {
    this._availableModeIds = availableModeIds;
  }

  rememberOptions(availableModeIds: string[], configOptions: unknown): void {
    const configModeIds = listSelectConfigOptionValues(configOptions, "mode");
    this.rememberAvailableModes(configModeIds.length > 0 ? configModeIds : availableModeIds);
    this.currentConfigOptions = Array.isArray(configOptions) ? configOptions : [];
    this.modeConfigId = findSelectConfigOption(configOptions, "mode")?.id;
    const modelConfig = findSelectConfigOption(configOptions, "model");
    this.modelConfigValue = modelConfig?.currentValue;
    this.thoughtLevelConfigId = findThoughtLevelConfig(configOptions)?.id;
    this.resolveConfigOptionUpdateWaiters();
  }

  async applyTurnConfig(
    sessionId: string | undefined,
    nextConfig: ThreadConfig,
    previousConfig: ThreadConfig | undefined,
  ): Promise<ThreadConfig | undefined> {
    if (!sessionId) {
      return previousConfig;
    }

    const nextModeId = resolveAcpMode(nextConfig, this._availableModeIds);
    const previousModeId = previousConfig
      ? resolveAcpMode(previousConfig, this._availableModeIds)
      : undefined;

    if (nextModeId && nextModeId !== previousModeId && this.modeConfigId) {
      try {
        await this.setConfigOptionAndRefresh(sessionId, this.modeConfigId, nextModeId);
        console.log("[acp] mode config set to:", nextModeId);
      } catch (error) {
        console.log(
          "[acp] live mode config change rejected, continuing: %s",
          toErrorMessage(error),
        );
      }
    } else if (nextModeId && nextModeId !== previousModeId) {
      try {
        await this.connection.setSessionMode({ sessionId, modeId: nextModeId });
        console.log("[acp] mode set to:", nextModeId);
      } catch (error) {
        console.log("[acp] live mode change rejected, continuing: %s", toErrorMessage(error));
      }
    }

    const modelConfig = resolveModelConfigValue(nextConfig, this.currentConfigOptions);
    const modelSelectionChanged =
      nextConfig.model !== previousConfig?.model ||
      Boolean(modelConfig && modelConfig.value !== this.modelConfigValue);
    let modelChanged = false;
    if (modelSelectionChanged) {
      if (modelConfig) {
        try {
          await this.setConfigOptionAndRefresh(sessionId, modelConfig.configId, modelConfig.value);
          modelChanged = true;
          console.log("[acp] model config set to:", modelConfig.value);
        } catch (error) {
          console.log(
            "[acp] live model config change rejected, continuing: %s",
            toErrorMessage(error),
          );
        }
      } else {
        try {
          // Fallback for agents without a "model" config option that still
          // speak the removed pre-1.0 model API (see unstableModelCompat.ts).
          await setUnstableSessionModel(this.connection, {
            sessionId,
            modelId: nextConfig.model,
          });
          modelChanged = true;
          console.log("[acp] model set to:", nextConfig.model);
        } catch (error) {
          console.log("[acp] live model change rejected, continuing: %s", toErrorMessage(error));
        }
      }
    }

    if (
      nextConfig.effort &&
      this.thoughtLevelConfigId &&
      (modelChanged || nextConfig.effort !== previousConfig?.effort)
    ) {
      try {
        await this.setConfigOptionAndRefresh(
          sessionId,
          this.thoughtLevelConfigId,
          nextConfig.effort,
        );
        console.log("[acp] effort set to:", nextConfig.effort);
      } catch (error) {
        console.log("[acp] live effort change rejected, continuing: %s", toErrorMessage(error));
      }
    }

    return nextConfig;
  }

  reduceSessionUpdate(
    currentConfig: ThreadConfig | undefined,
    update: SessionUpdate,
  ): ThreadConfig | undefined {
    if (update.sessionUpdate === "config_option_update") {
      const configOptions = this.rememberConfigOptionUpdate(update);
      if (!currentConfig || !configOptions) {
        return undefined;
      }
      const thoughtLevelConfig = findThoughtLevelConfig(configOptions);
      if (
        thoughtLevelConfig?.currentValue &&
        thoughtLevelConfig.currentValue !== currentConfig.effort
      ) {
        return { ...currentConfig, effort: thoughtLevelConfig.currentValue };
      }
      return undefined;
    }

    if (!currentConfig) {
      return undefined;
    }

    if (update.sessionUpdate === "current_mode_update") {
      if (!("currentModeId" in update) || typeof update.currentModeId !== "string") {
        return undefined;
      }
      const nextConfig = applyAcpModeUpdateToConfig(currentConfig, update.currentModeId);
      return isThreadConfigEqual(currentConfig, nextConfig) ? undefined : nextConfig;
    }

    return undefined;
  }

  rememberConfigOptionUpdate(update: SessionUpdate): unknown[] | undefined {
    if (
      update.sessionUpdate !== "config_option_update" ||
      !("configOptions" in update) ||
      !Array.isArray(update.configOptions)
    ) {
      return undefined;
    }
    this.rememberOptions(this._availableModeIds, update.configOptions);
    return update.configOptions;
  }

  private async setConfigOptionAndRefresh(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    if (this.configOptionMatches(configId, value)) {
      return;
    }

    const waiter = this.waitForConfigOptionUpdate(configId, value);
    try {
      const result = await this.connection.setSessionConfigOption({ sessionId, configId, value });
      const configOptions = (result as { configOptions?: unknown } | undefined)?.configOptions;
      if (Array.isArray(configOptions)) {
        this.rememberOptions(this._availableModeIds, configOptions);
        return;
      }
      if (!(await waiter.promise)) {
        throw new Error(
          `Timed out waiting for ACP config option ${JSON.stringify(configId)} to become ${JSON.stringify(value)}`,
        );
      }
    } finally {
      waiter.cancel();
    }
  }

  private waitForConfigOptionUpdate(
    configId: string,
    value: string,
  ): { promise: Promise<boolean>; cancel: () => void } {
    let waiter: ConfigOptionUpdateWaiter;
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.configOptionUpdateWaiters.delete(waiter);
        resolve(false);
      }, CONFIG_OPTION_UPDATE_TIMEOUT_MS);
      if (typeof timer.unref === "function") timer.unref();
      waiter = { configId, value, resolve, timer };
      this.configOptionUpdateWaiters.add(waiter);
    });
    const cancel = () => {
      if (!this.configOptionUpdateWaiters.delete(waiter)) return;
      clearTimeout(waiter.timer);
    };
    return { promise, cancel };
  }

  private resolveConfigOptionUpdateWaiters(): void {
    for (const waiter of this.configOptionUpdateWaiters) {
      if (!this.configOptionMatches(waiter.configId, waiter.value)) continue;
      this.configOptionUpdateWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(true);
    }
  }

  private configOptionMatches(configId: string, value: string): boolean {
    return this.currentConfigOptions.some((option) => {
      if (typeof option !== "object" || option === null) return false;
      const candidate = option as { id?: unknown; currentValue?: unknown };
      return candidate.id === configId && String(candidate.currentValue ?? "") === value;
    });
  }
}
