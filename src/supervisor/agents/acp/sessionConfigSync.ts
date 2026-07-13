import type { ClientSideConnection, SessionUpdate } from "@agentclientprotocol/sdk";
import { isThreadConfigEqual, type ThreadConfig } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import {
  applyAcpModeUpdateToConfig,
  findSelectConfigOption,
  findThoughtLevelConfig,
  resolveAcpMode,
  resolveModelConfigValue,
} from "./sessionConfig";
import { setUnstableSessionModel } from "./unstableModelCompat";

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

  constructor(private readonly connection: ClientSideConnection) {}

  get availableModeIds(): string[] {
    return this._availableModeIds;
  }

  rememberOptions(availableModeIds: string[], configOptions: unknown): void {
    this._availableModeIds = availableModeIds;
    this.currentConfigOptions = Array.isArray(configOptions) ? configOptions : [];
    this.modeConfigId = findSelectConfigOption(configOptions, "mode")?.id;
    const modelConfig = findSelectConfigOption(configOptions, "model");
    this.modelConfigValue = modelConfig?.currentValue;
    this.thoughtLevelConfigId = findThoughtLevelConfig(configOptions)?.id;
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
        const result = await this.connection.setSessionConfigOption({
          sessionId,
          configId: this.modeConfigId,
          value: nextModeId,
        });
        this.rememberOptions(this._availableModeIds, result.configOptions);
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
    if (
      nextConfig.model !== previousConfig?.model ||
      (modelConfig && modelConfig.value !== this.modelConfigValue)
    ) {
      if (modelConfig) {
        try {
          const result = await this.connection.setSessionConfigOption({
            sessionId,
            configId: modelConfig.configId,
            value: modelConfig.value,
          });
          this.rememberOptions(this._availableModeIds, result.configOptions);
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
          console.log("[acp] model set to:", nextConfig.model);
        } catch (error) {
          console.log("[acp] live model change rejected, continuing: %s", toErrorMessage(error));
        }
      }
    }

    if (
      nextConfig.effort &&
      this.thoughtLevelConfigId &&
      nextConfig.effort !== previousConfig?.effort
    ) {
      try {
        await this.connection.setSessionConfigOption({
          sessionId,
          configId: this.thoughtLevelConfigId,
          value: nextConfig.effort,
        });
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

    if (update.sessionUpdate === "config_option_update") {
      if (!("configOptions" in update) || !Array.isArray(update.configOptions)) {
        return undefined;
      }
      this.rememberOptions(this._availableModeIds, update.configOptions);
      const thoughtLevelConfig = findThoughtLevelConfig(update.configOptions);
      if (
        thoughtLevelConfig?.currentValue &&
        thoughtLevelConfig.currentValue !== currentConfig.effort
      ) {
        return { ...currentConfig, effort: thoughtLevelConfig.currentValue };
      }
    }

    return undefined;
  }
}
