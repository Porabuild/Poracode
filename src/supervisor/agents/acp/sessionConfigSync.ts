import type { ClientSideConnection, SessionUpdate } from "@agentclientprotocol/sdk";
import { isThreadConfigEqual, type ThreadConfig } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import { msg } from "@/shared/messages";
import { normalizeAcpModeId } from "./probe";
import { canonicalizeEffortId } from "@/shared/effortOrder";
import {
  findContextConfigOption,
  findFastConfigOption,
  resolveAdvertisedSelectValue,
  type AcpSelectBooleanConfigBinding,
} from "./modelConfigOptions";
import {
  describeConfigOptions,
  listBooleanConfigOptions,
  type AcpSessionConfigBooleanOption,
  type AcpSessionConfigOptionDescriptor,
} from "./sessionConfigOptions";
import {
  applyAcpModeUpdateToConfig,
  findSelectConfigOption,
  findThoughtLevelConfig,
  listSelectConfigOptionValues,
  resolveAcpMode,
  resolveModelConfigValue,
} from "./sessionConfig";
import {
  findThinkingToggleConfigOption,
  isThinkingToggleConfig,
  resolveThoughtLevelToggleValues,
} from "./thoughtLevel";
import { setUnstableSessionModel } from "./unstableModelCompat";
import type { AcpConfigOptionsNormalizer } from "../base/types";
import { ConfigWriteLock } from "./sessionConfigWriteLock";

const CONFIG_OPTION_UPDATE_TIMEOUT_MS = 5_000;

const identityConfigOptions: AcpConfigOptionsNormalizer = (configOptions) => configOptions;

export interface AcpConfigSyncBehavior {
  /** Reject unconfirmed selections before a prompt rather than continuing with different settings. */
  strictConfigSelection?: boolean;
  /**
   * Bind the ThreadConfig `fast` toggle onto one exact native select whose
   * advertised value ids are not the plain `true`/`false` pair the shared
   * classifier recognizes: `configId` names the select and `enabled`/
   * `disabled` its two exact wire value ids. The bound control is claimed
   * only when the retained options carry a select with exactly those two
   * distinct advertised values — a missing id, a non-select or boolean-typed
   * control, or a select with extra values keeps fast unbound rather than
   * guessing. Every fast path keys off the same binding: retained selector
   * discovery, the agent's native echo reduced back to the boolean, and the
   * exact native wire value pushed for a toggle. Absent keeps the default
   * boolean-pair classification.
   */
  fastConfigBinding?: AcpSelectBooleanConfigBinding;
  /**
   * Provider-owned proof that the model the session currently acknowledges —
   * the `model` select's own current value in `sessionOptions` — itself
   * carries `config.effort`, so no independent reasoning select is required
   * of it. Consulted by strict target validation only after a model
   * acknowledgement, against the refreshed acknowledged options, and only
   * when that inventory lacks a graded carrier for a meaningful requested
   * effort: a provider whose variant identity encodes the level declares
   * this instead of demanding a select from every model, while an undeclared
   * boolean thinking toggle never satisfies a graded request. Absent keeps
   * the default contract — the request must ride an advertised graded select.
   */
  modelCarriesEffort?: (config: ThreadConfig, sessionOptions: unknown) => boolean;
}

export class AcpConfigSelectionError extends Error {
  constructor(
    cause: unknown,
    readonly confirmedConfig: ThreadConfig | undefined,
  ) {
    super(msg("thread.configSelectionRejected"), { cause });
    this.name = "AcpConfigSelectionError";
  }
}

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
  /**
   * The mode the agent last told us it is in — from `SessionModeState` at
   * session open, from a `current_mode_update` notification, or from a mode we
   * successfully pushed. Used to skip re-asserting a mode the agent already
   * holds: a redundant `session/set_mode` is not a no-op for every agent (Kimi
   * records a `plan_mode.cancel` for it), so pushing one on resume can drop
   * session state the agent had restored.
   */
  private agentCurrentModeId: string | undefined;
  private currentConfigOptions: unknown[] = [];
  private modeConfigId: string | undefined;
  private modelConfigValue: string | undefined;
  private thoughtLevelConfigId: string | undefined;
  private thoughtLevelToggleOnly = false;
  private thoughtLevelToggleValues: { disabled: string; enabled: string } | undefined;
  private thinkingToggleConfigId: string | undefined;
  private thinkingToggleValues: { disabled: string; enabled: string } | undefined;
  private fastConfigId: string | undefined;
  private contextConfigId: string | undefined;
  private readonly configOptionUpdateWaiters = new Set<ConfigOptionUpdateWaiter>();

  /**
   * Single writer across this sync's own `applyTurnConfig` push and the live
   * config-option setter — a menu write can never interleave with the
   * prompt's startup config phase.
   */
  readonly configWrites = new ConfigWriteLock();

  constructor(
    private readonly connection: ClientSideConnection,
    private readonly resolveMode: typeof resolveAcpMode = resolveAcpMode,
    private readonly resolveModelConfig: typeof resolveModelConfigValue = resolveModelConfigValue,
    private readonly behavior: AcpConfigSyncBehavior = {},
    private readonly normalizeConfigOptions: AcpConfigOptionsNormalizer = identityConfigOptions,
  ) {}

  get availableModeIds(): string[] {
    return this._availableModeIds;
  }

  /**
   * Typed inventory of the standard config-option shapes the agent currently
   * advertises (select, grouped select, boolean, unsupported). Recomputed
   * from the retained option list, so it always matches the last
   * `config_option_update` / session-open snapshot.
   */
  listConfigOptionDescriptors(): readonly AcpSessionConfigOptionDescriptor[] {
    return describeConfigOptions(this.currentConfigOptions);
  }

  /**
   * Boolean config options the agent advertises. Recorded observation only —
   * the shared session has no generic boolean control to drive them with, so
   * nothing here sets one.
   */
  listBooleanConfigOptions(): readonly AcpSessionConfigBooleanOption[] {
    return listBooleanConfigOptions(this.currentConfigOptions);
  }

  /**
   * The retained, normalized wire options — the cache every consumer
   * (snapshot getter, setter validation, reduction) must read from.
   */
  listRetainedConfigOptions(): readonly unknown[] {
    return this.currentConfigOptions;
  }

  rememberAvailableModes(availableModeIds: string[]): void {
    this._availableModeIds = availableModeIds;
  }

  /** Record `SessionModeState.currentModeId` from a session open/load/resume. */
  rememberCurrentMode(modeId: string | undefined): void {
    this.agentCurrentModeId = modeId;
  }

  /**
   * Fold an agent-reported mode change into the thread config. Returns
   * `undefined` when the config is already in that mode.
   */
  reduceModeChange(
    currentConfig: ThreadConfig | undefined,
    modeId: string,
  ): ThreadConfig | undefined {
    this.agentCurrentModeId = modeId;
    if (!currentConfig) return undefined;
    const nextConfig = applyAcpModeUpdateToConfig(currentConfig, modeId);
    return isThreadConfigEqual(currentConfig, nextConfig) ? undefined : nextConfig;
  }

  /**
   * Fold an agent-reported plan-mode *exit* into the thread config. Unlike
   * {@link reduceModeChange} this keeps the thread's approval policy: leaving
   * plan mode says nothing about which approvals the user picked, and mapping
   * through a mode id would rewrite `auto` to `default`. The agent's mode is
   * then unknown again — it left plan mode for whatever it was in before — so
   * the remembered mode is cleared rather than guessed.
   */
  reduceLeavePlanMode(currentConfig: ThreadConfig | undefined): ThreadConfig | undefined {
    this.agentCurrentModeId = undefined;
    if (!currentConfig || currentConfig.mode !== "plan") return undefined;
    return { ...currentConfig, mode: "agent" };
  }

  /** True when the agent already reported being in `modeId`. */
  private agentHoldsMode(modeId: string): boolean {
    if (!this.agentCurrentModeId) return false;
    return (
      normalizeAcpModeId(this.agentCurrentModeId).toLowerCase() ===
      normalizeAcpModeId(modeId).toLowerCase()
    );
  }

  /** The Poracode mode id for plan mode as this agent names it. */
  resolvePlanModeId(): string {
    return this.resolveMode({ model: "", mode: "plan" }, this._availableModeIds) ?? "plan";
  }

  /**
   * Notified after every successful normalized `rememberOptions` ingest —
   * session open/load/resume, an agent-owned `config_option_update`, and
   * setter replies alike. The synthetic inter-incarnation clear
   * (`clearRetainedOptions`) does not notify; a fresh agent list does.
   */
  onOptionsIngested?: () => void;

  rememberOptions(availableModeIds: string[], configOptions: unknown): boolean {
    // Every ingestion lane funnels through here — session open/load/resume,
    // agent-owned `config_option_update`, and setter replies — so the
    // provider normalizer is applied exactly once per agent-supplied list.
    // The retained cache, the derived standard-control ids, confirmation
    // checks and the reduction all see the normalized view; the raw update
    // is never reduced.
    const normalized = this.normalizeIngestedOptions(configOptions);
    if (!normalized) return false;
    this.retainOptions(normalized, availableModeIds);
    this.onOptionsIngested?.();
    return true;
  }

  /**
   * Drop the retained inventory between incarnations of one handle (re-open).
   * A synthetic clear, not a native ingest: derived ids reset and pending
   * confirmation waiters are re-checked, but no change notification fires —
   * the fresh agent list will announce itself.
   */
  clearRetainedOptions(): void {
    this.retainOptions([], []);
  }

  private retainOptions(normalized: unknown[], availableModeIds: string[]): void {
    const configModeIds = listSelectConfigOptionValues(normalized, "mode");
    this.rememberAvailableModes(configModeIds.length > 0 ? configModeIds : availableModeIds);
    this.currentConfigOptions = normalized;
    this.modeConfigId = findSelectConfigOption(normalized, "mode")?.id;
    const modelConfig = findSelectConfigOption(normalized, "model");
    this.modelConfigValue = modelConfig?.currentValue;
    const thoughtLevelConfig = findThoughtLevelConfig(normalized);
    this.thoughtLevelConfigId = thoughtLevelConfig?.id;
    this.thoughtLevelToggleOnly = isThinkingToggleConfig(thoughtLevelConfig);
    this.thoughtLevelToggleValues = resolveThoughtLevelToggleValues(thoughtLevelConfig);
    const thinkingToggle = findThinkingToggleConfigOption(normalized);
    this.thinkingToggleConfigId = thinkingToggle?.id;
    this.thinkingToggleValues = resolveThoughtLevelToggleValues(thinkingToggle);
    this.fastConfigId = findFastConfigOption(normalized, this.behavior.fastConfigBinding)?.id;
    this.contextConfigId = findContextConfigOption(normalized)?.id;
    this.resolveConfigOptionUpdateWaiters();
  }

  private normalizeIngestedOptions(configOptions: unknown): unknown[] | undefined {
    if (!Array.isArray(configOptions)) return [];
    try {
      const normalized = this.normalizeConfigOptions(configOptions);
      return Array.isArray(normalized) ? [...normalized] : undefined;
    } catch (error) {
      // A throwing normalizer is a provider bug: keep the previously
      // retained options rather than letting the raw list into the cache or
      // the reduction.
      console.warn(
        "[acp] config options normalizer failed; keeping previous options: %s",
        toErrorMessage(error),
      );
      return undefined;
    }
  }

  applyTurnConfig(
    sessionId: string | undefined,
    nextConfig: ThreadConfig,
    previousConfig: ThreadConfig | undefined,
    // Capture ownership before calling: checked after queue admission and
    // every async write, before its reply can replace retained metadata.
    assertCurrent: () => void = () => {},
  ): Promise<ThreadConfig | undefined> {
    // One config writer across this push and the live setter: the prompt's
    // startup config phase completes before `promptInFlight` would guard it,
    // so the lock — not the prompt flag — is what keeps a menu write from
    // interleaving mid-push. Queues behind a write already in flight rather
    // than racing a second mutation.
    return this.configWrites.runExclusive(() =>
      this.applyTurnConfigLocked(sessionId, nextConfig, previousConfig, assertCurrent),
    );
  }

  private async applyTurnConfigLocked(
    sessionId: string | undefined,
    nextConfig: ThreadConfig,
    previousConfig: ThreadConfig | undefined,
    assertCurrent: () => void,
  ): Promise<ThreadConfig | undefined> {
    assertCurrent();
    if (!sessionId) {
      return previousConfig;
    }

    let confirmedConfig = previousConfig;
    const confirm = (fields: Partial<ThreadConfig>) => {
      if (confirmedConfig) confirmedConfig = { ...confirmedConfig, ...fields };
    };
    const reject = (error: unknown): void => {
      assertCurrent();
      if (this.behavior.strictConfigSelection) {
        const reported =
          confirmedConfig && this.reduceConfigOptions(confirmedConfig, this.currentConfigOptions);
        throw new AcpConfigSelectionError(error, reported ?? confirmedConfig);
      }
    };
    // Resolve opaque selections before sending any configuration writes. A
    // provider resolver may reject a catalog choice that is no longer advertised.
    let modelConfig: ReturnType<typeof resolveModelConfigValue>;
    try {
      modelConfig = this.behavior.strictConfigSelection
        ? this.resolveModelConfig(nextConfig, this.currentConfigOptions)
        : undefined;
      if (this.behavior.strictConfigSelection && nextConfig.model && !modelConfig) {
        throw new Error("The session did not advertise the requested model selection");
      }
    } catch (error) {
      throw new AcpConfigSelectionError(error, previousConfig);
    }
    const nextModeId = this.resolveMode(nextConfig, this._availableModeIds);
    if (
      this.behavior.strictConfigSelection &&
      this._availableModeIds.length > 0 &&
      !nextModeId &&
      (nextConfig.mode === "plan" || nextConfig.approvalPolicy)
    ) {
      reject(new Error("The session did not advertise the requested permission mode"));
    }
    const previousModeId = previousConfig
      ? this.resolveMode(previousConfig, this._availableModeIds)
      : undefined;
    // The agent's own report wins over `previousConfig` for "is a push needed?".
    // On the first turn after a session open there is no previous config, so
    // without this every open re-asserted a mode the agent already held.
    const modeChangeNeeded =
      Boolean(nextModeId) &&
      nextModeId !== previousModeId &&
      !this.agentHoldsMode(nextModeId as string);

    if (modeChangeNeeded && this.modeConfigId) {
      try {
        await this.setConfigOptionAndRefresh(
          sessionId,
          this.modeConfigId,
          nextModeId as string,
          assertCurrent,
        );
        this.agentCurrentModeId = nextModeId;
        confirm({
          ...(nextConfig.mode ? { mode: nextConfig.mode } : {}),
          ...(nextConfig.approvalPolicy ? { approvalPolicy: nextConfig.approvalPolicy } : {}),
        });
        console.log("[acp] mode config set to:", nextModeId);
      } catch (error) {
        reject(error);
        console.log(
          "[acp] live mode config change rejected, continuing: %s",
          toErrorMessage(error),
        );
      }
    } else if (modeChangeNeeded) {
      try {
        assertCurrent();
        await this.connection.setSessionMode({ sessionId, modeId: nextModeId as string });
        assertCurrent();
        this.agentCurrentModeId = nextModeId;
        confirm({
          ...(nextConfig.mode ? { mode: nextConfig.mode } : {}),
          ...(nextConfig.approvalPolicy ? { approvalPolicy: nextConfig.approvalPolicy } : {}),
        });
        console.log("[acp] mode set to:", nextModeId);
      } catch (error) {
        reject(error);
        console.log("[acp] live mode change rejected, continuing: %s", toErrorMessage(error));
      }
    }

    // A mode change can replace the advertised option IDs and variants.
    try {
      modelConfig = this.resolveModelConfig(nextConfig, this.currentConfigOptions);
      if (this.behavior.strictConfigSelection && nextConfig.model && !modelConfig) {
        throw new Error("The session did not advertise the requested model selection");
      }
    } catch (error) {
      if (!this.behavior.strictConfigSelection) throw error;
      reject(error);
    }
    const modelSelectionChanged =
      (!this.behavior.strictConfigSelection || Boolean(nextConfig.model)) &&
      (nextConfig.model !== previousConfig?.model ||
        Boolean(modelConfig && modelConfig.value !== this.modelConfigValue));
    let modelChanged = false;
    if (modelSelectionChanged) {
      if (modelConfig) {
        try {
          await this.setConfigOptionAndRefresh(
            sessionId,
            modelConfig.configId,
            modelConfig.value,
            assertCurrent,
          );
          modelChanged = true;
          confirm({ model: nextConfig.model });
          console.log("[acp] model config set to:", modelConfig.value);
        } catch (error) {
          reject(error);
          console.log(
            "[acp] live model config change rejected, continuing: %s",
            toErrorMessage(error),
          );
        }
      } else {
        try {
          // Fallback for agents without a "model" config option that still
          // speak the removed pre-1.0 model API (see unstableModelCompat.ts).
          assertCurrent();
          await setUnstableSessionModel(this.connection, {
            sessionId,
            modelId: nextConfig.model,
          });
          assertCurrent();
          modelChanged = true;
          confirm({ model: nextConfig.model });
          console.log("[acp] model set to:", nextConfig.model);
        } catch (error) {
          reject(error);
          console.log("[acp] live model change rejected, continuing: %s", toErrorMessage(error));
        }
      }
    }

    const nextThoughtLevelValue = this.thoughtLevelToggleOnly
      ? this.thoughtLevelToggleValues
        ? nextConfig.thinking === false
          ? this.thoughtLevelToggleValues.disabled
          : this.thoughtLevelToggleValues.enabled
        : undefined
      : this.resolveEffortConfigValue(nextConfig.effort);
    const thoughtLevelChanged = this.thoughtLevelToggleOnly
      ? nextConfig.thinking !== previousConfig?.thinking
      : nextConfig.effort !== previousConfig?.effort;
    if (
      this.behavior.strictConfigSelection &&
      this.thoughtLevelConfigId &&
      thoughtLevelChanged &&
      nextConfig.effort &&
      nextConfig.effort !== "default" &&
      !nextThoughtLevelValue
    ) {
      reject(new Error("The session did not advertise the requested reasoning level"));
    }
    // The model acknowledgement replaced the retained inventory with the
    // target model's. Validate the requested level against THAT target
    // inventory — independently of what the source advertised — before any
    // level or toggle write consumes it: a reduced ladder, a vanished
    // independent select, or a boolean thinking toggle standing in for a
    // graded level must fail the turn typed before the prompt instead of
    // silently running on a different level or leaving the config claiming
    // a level nothing carries. An effort encoded in the model identity is
    // proven provider-owned through `modelCarriesEffort`, consulted only
    // here with the acknowledged model already current. The rejection
    // reports the acknowledged native state — the model write has already
    // taken effect, so the reported config folds the refreshed options
    // rather than imagining a rollback.
    const targetCarriesEffort =
      !this.thoughtLevelToggleOnly &&
      this.thoughtLevelConfigId !== undefined &&
      this.resolveEffortConfigValue(nextConfig.effort) !== undefined;
    if (
      this.behavior.strictConfigSelection &&
      modelChanged &&
      nextConfig.effort &&
      nextConfig.effort !== "default" &&
      !targetCarriesEffort &&
      this.behavior.modelCarriesEffort?.(nextConfig, this.currentConfigOptions) !== true
    ) {
      reject(
        new Error(
          "The refreshed options for the selected model do not carry the requested reasoning level",
        ),
      );
    }
    if (
      nextThoughtLevelValue &&
      this.thoughtLevelConfigId &&
      (modelChanged || thoughtLevelChanged)
    ) {
      try {
        await this.setConfigOptionAndRefresh(
          sessionId,
          this.thoughtLevelConfigId,
          nextThoughtLevelValue,
          assertCurrent,
        );
        confirm(
          this.thoughtLevelToggleOnly
            ? nextConfig.thinking !== undefined
              ? { thinking: nextConfig.thinking }
              : {}
            : nextConfig.effort !== undefined
              ? { effort: nextConfig.effort }
              : {},
        );
        console.log("[acp] thought level set to:", nextThoughtLevelValue);
      } catch (error) {
        reject(error);
        console.log(
          "[acp] live thought level change rejected, continuing: %s",
          toErrorMessage(error),
        );
      }
    }

    const pending = [
      () =>
        this.applyOptionalSelect(
          sessionId,
          this.thinkingToggleConfigId,
          this.resolveThinkingConfigValue(nextConfig.thinking),
          modelChanged || nextConfig.thinking !== previousConfig?.thinking,
          "thinking",
          reject,
          assertCurrent,
        ),
      () => {
        // The target model's setter may retire its independent toggle. An
        // explicit enable must not silently become a no-op after that echo.
        if (this.behavior.fastConfigBinding && nextConfig.fast === true && !this.fastConfigId) {
          reject(new Error("The session did not advertise the requested fast-mode selector"));
        }
        return this.applyOptionalSelect(
          sessionId,
          this.fastConfigId,
          this.resolveFastConfigValue(nextConfig.fast),
          modelChanged || nextConfig.fast !== previousConfig?.fast,
          "fast",
          reject,
          assertCurrent,
        );
      },
      () =>
        this.applyOptionalSelect(
          sessionId,
          this.contextConfigId,
          this.resolveContextConfigValue(nextConfig.contextSize),
          modelChanged || nextConfig.contextSize !== previousConfig?.contextSize,
          "context",
          reject,
          assertCurrent,
        ),
    ];
    for (const task of pending) {
      const update = task();
      if (update) await update;
    }

    assertCurrent();
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
      const next = this.reduceConfigOptions(currentConfig, configOptions);
      return next && !isThreadConfigEqual(currentConfig, next) ? next : undefined;
    }

    if (!currentConfig) {
      return undefined;
    }

    if (update.sessionUpdate === "current_mode_update") {
      if (!("currentModeId" in update) || typeof update.currentModeId !== "string") {
        return undefined;
      }
      return this.reduceModeChange(currentConfig, update.currentModeId);
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
    if (!this.rememberOptions(this._availableModeIds, update.configOptions)) return undefined;
    // The normalized retained view — never the raw update, which callers
    // must not reduce.
    return this.currentConfigOptions;
  }

  /**
   * Register a bounded wait for the retained options to report `value` on
   * `configId` — the promise resolves as soon as an ingested list (setter
   * reply or agent-owned `config_option_update`) carries the value, or false
   * on timeout. Always `cancel()` the handle when done.
   */
  waitForConfigOption(
    configId: string,
    value: string,
    timeoutMs: number = CONFIG_OPTION_UPDATE_TIMEOUT_MS,
  ): { promise: Promise<boolean>; cancel: () => void } {
    return this.waitForConfigOptionUpdate(configId, value, timeoutMs);
  }

  private async setConfigOptionAndRefresh(
    sessionId: string,
    configId: string,
    value: string,
    assertCurrent: () => void,
  ): Promise<void> {
    assertCurrent();
    if (this.configOptionMatches(configId, value)) {
      return;
    }

    const waiter = this.waitForConfigOptionUpdate(configId, value);
    try {
      const result = await this.connection.setSessionConfigOption({ sessionId, configId, value });
      assertCurrent();
      const configOptions = (result as { configOptions?: unknown } | undefined)?.configOptions;
      if (Array.isArray(configOptions)) {
        if (!this.rememberOptions(this._availableModeIds, configOptions)) {
          throw new Error("The session's configuration reply could not be normalized.");
        }
        if (this.behavior.strictConfigSelection && !this.configOptionMatches(configId, value)) {
          throw new Error("The session did not confirm the requested config option");
        }
        return;
      }
      const matched = await waiter.promise;
      assertCurrent();
      if (!matched) {
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
    timeoutMs: number = CONFIG_OPTION_UPDATE_TIMEOUT_MS,
  ): { promise: Promise<boolean>; cancel: () => void } {
    let waiter: ConfigOptionUpdateWaiter;
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.configOptionUpdateWaiters.delete(waiter);
        resolve(false);
      }, timeoutMs);
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

  /**
   * Fold an authoritative (normalized) option list into the thread config.
   * Covers the standard categories — mode and model selects included, since
   * the agent's current value is what it is actually running (mid-session
   * fallbacks, clamped selections after a write) — plus the thought-level,
   * thinking, fast and context controls.
   */
  reduceConfigOptions(
    currentConfig: ThreadConfig,
    configOptions: unknown,
  ): ThreadConfig | undefined {
    let next = currentConfig;
    const modeConfig = findSelectConfigOption(configOptions, "mode");
    const modeId = modeConfig?.currentValue;
    if (typeof modeId === "string" && modeId.length > 0) {
      // The mode select's current value is the agent's own mode report:
      // remembering it keeps `applyTurnConfig` from pushing the same mode back.
      this.agentCurrentModeId = modeId;
      next = applyAcpModeUpdateToConfig(next, modeId);
    }

    const modelConfig = findSelectConfigOption(configOptions, "model");
    const modelValue = modelConfig?.currentValue;
    const thoughtLevelConfig = findThoughtLevelConfig(configOptions);
    // Category metadata is a hint: a reasoning selector must not replace
    // model identity merely because the agent files both in one category.
    if (
      modelConfig?.id !== thoughtLevelConfig?.id &&
      typeof modelValue === "string" &&
      modelValue !== next.model
    ) {
      next = { ...next, model: modelValue };
    }

    if (isThinkingToggleConfig(thoughtLevelConfig) && thoughtLevelConfig) {
      const toggleValues = resolveThoughtLevelToggleValues(thoughtLevelConfig);
      if (
        toggleValues &&
        (thoughtLevelConfig.currentValue === toggleValues.disabled ||
          thoughtLevelConfig.currentValue === toggleValues.enabled)
      ) {
        const thinking = thoughtLevelConfig.currentValue === toggleValues.enabled;
        if (thinking !== next.thinking) next = { ...next, thinking };
      }
    } else if (thoughtLevelConfig?.currentValue) {
      const effort = canonicalizeEffortId(thoughtLevelConfig.currentValue);
      if (effort !== next.effort) next = { ...next, effort };
    }

    const thinkingToggle = findThinkingToggleConfigOption(configOptions);
    const thinkingValues = resolveThoughtLevelToggleValues(thinkingToggle);
    if (
      thinkingToggle?.currentValue &&
      thinkingValues &&
      (thinkingToggle.currentValue === thinkingValues.disabled ||
        thinkingToggle.currentValue === thinkingValues.enabled)
    ) {
      const thinking = thinkingToggle.currentValue === thinkingValues.enabled;
      if (thinking !== next.thinking) next = { ...next, thinking };
    }

    // The fast echo folds only a recognized current value onto the boolean —
    // the declared enabled/disabled pair when a binding is in force, the plain
    // `true`/`false` pair otherwise. Anything else leaves `fast` untouched
    // rather than guessing `false`.
    const fastBinding = this.behavior.fastConfigBinding;
    const fast = findFastConfigOption(configOptions, fastBinding);
    const fastBoolean = fast ? this.reduceFastEcho(fast.currentValue) : undefined;
    if (fastBoolean !== undefined && fastBoolean !== next.fast) {
      next = { ...next, fast: fastBoolean };
    }

    const context = findContextConfigOption(configOptions);
    if (context?.currentValue && context.currentValue !== next.contextSize) {
      next = { ...next, contextSize: context.currentValue };
    }

    return next;
  }

  private applyOptionalSelect(
    sessionId: string,
    configId: string | undefined,
    value: string | undefined,
    changed: boolean,
    label: string,
    reject: (error: unknown) => void,
    assertCurrent: () => void,
  ): Promise<void> | undefined {
    if (!configId || value === undefined || !changed) return undefined;
    return this.setConfigOptionAndRefresh(sessionId, configId, value, assertCurrent)
      .then(() => {
        console.log("[acp] %s set to: %s", label, value);
      })
      .catch((error: unknown) => {
        reject(error);
        console.log("[acp] live %s change rejected, continuing: %s", label, toErrorMessage(error));
      });
  }

  private currentSelectOption(configId: string | undefined): { options?: unknown } | undefined {
    if (!configId) return undefined;
    return this.currentConfigOptions.find((option) => {
      if (typeof option !== "object" || option === null) return false;
      return (option as { id?: unknown }).id === configId;
    }) as { options?: unknown } | undefined;
  }

  private resolveEffortConfigValue(effort: string | undefined): string | undefined {
    return resolveAdvertisedSelectValue(
      this.currentSelectOption(this.thoughtLevelConfigId),
      effort,
    );
  }

  private resolveThinkingConfigValue(thinking: boolean | undefined): string | undefined {
    if (thinking !== true && thinking !== false) return undefined;
    return thinking ? this.thinkingToggleValues?.enabled : this.thinkingToggleValues?.disabled;
  }

  /**
   * The exact native wire value for a toggle state: the declared binding's
   * `enabled`/`disabled` id when one is in force, else the advertised plain
   * `true`/`false` row.
   */
  private resolveFastConfigValue(fast: boolean | undefined): string | undefined {
    if (fast !== true && fast !== false) return undefined;
    const binding = this.behavior.fastConfigBinding;
    if (binding) return fast ? binding.enabled : binding.disabled;
    return resolveAdvertisedSelectValue(
      this.currentSelectOption(this.fastConfigId),
      fast ? "true" : "false",
    );
  }

  /** Fold one native fast echo onto the boolean; unrecognized values fold to nothing. */
  private reduceFastEcho(currentValue: string | undefined): boolean | undefined {
    if (currentValue === undefined) return undefined;
    const binding = this.behavior.fastConfigBinding;
    if (binding) {
      if (currentValue === binding.enabled) return true;
      if (currentValue === binding.disabled) return false;
      return undefined;
    }
    if (currentValue === "true") return true;
    if (currentValue === "false") return false;
    return undefined;
  }

  private resolveContextConfigValue(contextSize: string | undefined): string | undefined {
    if (!contextSize || contextSize === "default") return undefined;
    return resolveAdvertisedSelectValue(
      this.currentSelectOption(this.contextConfigId),
      contextSize,
    );
  }

  private configOptionMatches(configId: string, value: string): boolean {
    return this.currentConfigOptions.some((option) => {
      if (typeof option !== "object" || option === null) return false;
      const candidate = option as { id?: unknown; currentValue?: unknown };
      return candidate.id === configId && String(candidate.currentValue ?? "") === value;
    });
  }
}
