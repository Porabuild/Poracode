/**
 * Neutral live config-option control for one ACP session.
 *
 * The shared session exposes two capabilities on the internal
 * `AcpSessionActionTransport` — a detached snapshot of the retained config
 * options, and a validated write to one advertised option. The write always
 * uses the standard ACP `session/set_config_option` wire method (never an
 * extension RPC), validates the exact advertised id and value before any
 * send, requires full echoed/confirmed state afterwards, and reconciles the
 * thread config through the normal config listener — without fabricating
 * prompt, turn or status changes.
 *
 * Fencing: owner (session id + reopen generation), dispose, and transport
 * state are checked before and after every await, so a stale write can never
 * mutate a newer session incarnation — including a reopen that reuses the
 * same native session id. All writes share the session's single config
 * writer with `applyTurnConfig`; a write that timed out or was aborted still
 * holds the writer until the unabortable SDK request settles, because a
 * second mutation issued over an unknown first outcome could land in either
 * order. Agent-owned `config_option_update` notifications remain
 * authoritative: the write only confirms what the agent reports back.
 */

import type {
  ClientSideConnection,
  SetSessionConfigOptionResponse,
} from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import { assertBoundedJson } from "@/shared/jsonBounds";
import type { AcpSessionConfigOptionWriteValue } from "../base/types";
import { findAdvertisedConfigOption, listAdvertisedSelectValueIds } from "./sessionConfigOptions";
import type { AcpSessionConfigSync } from "./sessionConfigSync";
import type { ConfigWriteLock } from "./sessionConfigWriteLock";

/** Upper bound for the detached config-options snapshot (bytes / nesting depth via the shared JSON bounds). */
export const CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES = 512 * 1024;

const DEFAULT_CONFIG_WRITE_TIMEOUT_MS = 10_000;

export type AcpConfigControlFailure =
  | "unavailable"
  | "unknown_option"
  | "unsupported_option"
  | "invalid_value"
  | "conflict"
  | "failed"
  | "unconfirmed"
  | "bounded";

/** Typed, bounded failure of a live config-option read or write. */
export class AcpConfigControlError extends Error {
  constructor(
    readonly reason: AcpConfigControlFailure,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AcpConfigControlError";
  }
}

/** The live-session owner a write is fenced against. */
export interface AcpSessionConfigOwner {
  readonly sessionId: string;
  /**
   * Bumped on every re-open and on dispose, so a reopen that reuses the same
   * native session id still fences a stale write out of the new incarnation.
   */
  readonly generation: number;
  readonly disposed: boolean;
  readonly transportClosed: boolean;
}

/**
 * Behavior opt-in for live select writes whose value the option does not
 * advertise. Consulted only after the standard strict membership check
 * failed, only for options whose exact current control type is `select`, and
 * only for string values; receives the config id, the exact unlisted value,
 * and a detached snapshot of the advertised option. Returning exactly `true`
 * admits the wire send of that value; `false` or a throw rejects the write
 * visibly before anything is sent. No option row is manufactured and no
 * alias is recorded — the value is sent as-is and must still be echoed back
 * by the session like any other write.
 */
export type AcpUnlistedSelectValueGuard = (
  configId: string,
  value: string,
  option: Record<string, unknown>,
) => boolean;

export interface AcpLiveConfigControlOptions {
  connection: ClientSideConnection;
  configSync: AcpSessionConfigSync;
  /** Single config writer shared with `applyTurnConfig`. */
  configWrites: ConfigWriteLock;
  /**
   * Behavior opt-in: admit unlisted select values the predicate explicitly
   * qualifies. Absent keeps advertised membership strictly required.
   */
  allowUnlistedSelectValue?: AcpUnlistedSelectValueGuard;
  /** Live-session owner probe, captured before the write and re-checked after every await. */
  getOwner: () => AcpSessionConfigOwner | undefined;
  /** The negotiated boolean config-option client capability. */
  isBooleanCapabilityNegotiated: () => boolean;
  /** True while a foreground prompt (startup config phase through prompt resolution) owns the session. */
  isForegroundPromptOpen: () => boolean;
  /** Behavior opt-in: a qualified provider may write config while a prompt is open. */
  allowDuringPrompt: () => boolean;
  getCurrentConfig: () => ThreadConfig | undefined;
  /** Emit the reconciled config through the normal config listener. */
  onConfigReconciled: (next: ThreadConfig | undefined) => void;
  configWriteTimeoutMs?: number;
}

type WireWrite = { kind: "select"; value: string } | { kind: "boolean"; value: boolean };

type WireOutcome =
  | { kind: "echo"; echo: SetSessionConfigOptionResponse }
  | { kind: "echoError"; error: unknown }
  | { kind: "timeout" }
  | { kind: "aborted" };

function extractEchoOptions(echo: SetSessionConfigOptionResponse): unknown[] | undefined {
  const options = (echo as { configOptions?: unknown } | undefined)?.configOptions;
  return Array.isArray(options) ? options : undefined;
}

/**
 * Race the (unabortable) SDK write against the timeout and the caller's
 * signal. Losing the race surfaces promptly; the flight keeps running and
 * the caller must hold the config writer until it settles.
 */
function raceWire(
  flight: Promise<SetSessionConfigOptionResponse>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<WireOutcome> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    const onAbort = () => finish({ kind: "aborted" });
    if (signal) {
      if (signal.aborted) {
        finish({ kind: "aborted" });
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    function finish(outcome: WireOutcome): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    }
    flight.then(
      (echo) => finish({ kind: "echo", echo }),
      (error: unknown) => finish({ kind: "echoError", error }),
    );
  });
}

/** A compatibility confirmation wait must remain cancellable after the SDK reply settled. */
function awaitNotificationConfirmation(
  confirmation: Promise<boolean>,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      resolve(confirmed);
    };
    const cancel = () => finish(false);
    signal?.addEventListener("abort", cancel, { once: true });
    void confirmation.then(finish, () => finish(false));
  });
}

/**
 * Owns the live config-option read/write surface of one ACP session. All
 * state is reached through the supplied accessors, so the control can be
 * lazily constructed and fenced against session lifecycle changes.
 */
export class AcpLiveConfigControl {
  private readonly timeoutMs: number;

  constructor(private readonly options: AcpLiveConfigControlOptions) {
    this.timeoutMs = options.configWriteTimeoutMs ?? DEFAULT_CONFIG_WRITE_TIMEOUT_MS;
  }

  /**
   * Detached, bounded snapshot of the retained (normalized) options. A pure
   * cache view: mutating the snapshot never reaches session state, and later
   * session changes never reach an already-returned snapshot.
   */
  getConfigOptions(): readonly unknown[] {
    let snapshot: unknown[];
    try {
      snapshot = structuredClone(this.options.configSync.listRetainedConfigOptions()) as unknown[];
      assertBoundedJson(snapshot, CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES);
    } catch (error) {
      throw new AcpConfigControlError(
        "bounded",
        `Config option snapshot exceeds the detached snapshot bound: ${toErrorMessage(error)}`,
      );
    }
    return snapshot;
  }

  /**
   * Set one advertised config option. Resolves only after the session's own
   * echoed/confirmed state carries the written value; the reconciled thread
   * config is emitted through `onConfigReconciled`. Every failure is a typed
   * {@link AcpConfigControlError}; validation failures happen before any
   * wire send.
   */
  async setConfigOption(
    configId: string,
    value: AcpSessionConfigOptionWriteValue,
    callOptions?: { signal?: AbortSignal },
  ): Promise<void> {
    const signal = callOptions?.signal;
    if (signal?.aborted) {
      throw this.unavailable("Configuration change cancelled before it was sent.", configId);
    }

    // Fail fast while any config write is in flight or queued — never a
    // second mutation over an unknown first outcome.
    const lock = this.options.configWrites.tryAcquire();
    if (!lock) {
      throw new AcpConfigControlError("conflict", "Another configuration write is in progress.", {
        configId,
      });
    }
    const release = lock.release;

    let waiter: { promise: Promise<boolean>; cancel: () => void } | undefined;
    let flight: Promise<SetSessionConfigOptionResponse> | undefined;
    let flightSettled = false;
    try {
      const owner = this.assertLiveOwner(configId);
      if (this.options.isForegroundPromptOpen() && !this.options.allowDuringPrompt()) {
        throw new AcpConfigControlError(
          "conflict",
          "A foreground prompt owns the session; live config changes during a prompt are rejected by default.",
          { configId },
        );
      }

      // Validate against the retained normalized options BEFORE any wire send.
      const option = findAdvertisedConfigOption(
        this.options.configSync.listRetainedConfigOptions(),
        configId,
      );
      if (!option) {
        throw new AcpConfigControlError(
          "unknown_option",
          `The session does not advertise config option ${JSON.stringify(configId)}.`,
          { configId },
        );
      }
      const wire = this.buildWireWrite(option, configId, value);
      if (signal?.aborted) {
        throw this.unavailable("Configuration change cancelled before it was sent.", configId);
      }

      // Register the confirmation waiter before the send so a fast
      // agent-owned config_option_update cannot slip past it.
      const confirmValue = typeof value === "boolean" ? (value ? "true" : "false") : value;
      waiter = this.options.configSync.waitForConfigOption(configId, confirmValue, this.timeoutMs);

      const params =
        wire.kind === "boolean"
          ? { sessionId: owner.sessionId, configId, value: wire.value, type: "boolean" as const }
          : { sessionId: owner.sessionId, configId, value: wire.value };
      flight = this.options.connection.setSessionConfigOption(params);
      void flight.then(
        () => {
          flightSettled = true;
        },
        () => {
          flightSettled = true;
        },
      );

      const outcome = await raceWire(flight, this.timeoutMs, signal);
      if (outcome.kind === "timeout") {
        throw new AcpConfigControlError(
          "unconfirmed",
          `Timed out setting config option ${JSON.stringify(configId)}; the wire write may still be in flight.`,
          { configId },
        );
      }
      if (outcome.kind === "aborted") {
        throw this.unavailable(
          "Configuration change cancelled while the write was in flight.",
          configId,
        );
      }

      // Post-await fencing: an echo from a disposed, closed, or reopened
      // session belongs to a dead incarnation and must not touch the
      // new one's cache or config.
      if (signal?.aborted || !this.sameOwner(owner)) {
        throw this.unavailable(
          "The session changed during the configuration write; its confirmation was discarded.",
          configId,
        );
      }
      if (outcome.kind === "echoError") {
        throw new AcpConfigControlError(
          "failed",
          `The session rejected the configuration change: ${toErrorMessage(outcome.error)}`,
          { configId },
        );
      }

      // Fold the authoritative reply (normalized, like every ingestion lane)
      // into the cache, or fall back to the agent's config_option_update.
      const echoed = extractEchoOptions(outcome.echo);
      if (echoed) {
        try {
          assertBoundedJson(echoed, CONFIG_OPTIONS_SNAPSHOT_MAX_BYTES);
        } catch {
          throw new AcpConfigControlError(
            "bounded",
            "The session's configuration reply exceeds JSON bounds.",
            { configId },
          );
        }
        if (
          !this.options.configSync.rememberOptions(this.options.configSync.availableModeIds, echoed)
        ) {
          throw new AcpConfigControlError(
            "unconfirmed",
            "The session's configuration reply could not be normalized.",
            { configId },
          );
        }
      } else {
        const confirmed = await awaitNotificationConfirmation(waiter.promise, signal);
        if (signal?.aborted || !this.sameOwner(owner)) {
          throw this.unavailable(
            "The configuration confirmation no longer belongs to this session.",
            configId,
          );
        }
        if (!confirmed) {
          throw new AcpConfigControlError(
            "unconfirmed",
            `The session did not confirm config option ${JSON.stringify(configId)}.`,
            { configId },
          );
        }
      }

      // The retained normalized state must carry the written value —
      // silently accepting a different config is forbidden.
      if (!this.optionNowMatches(configId, wire)) {
        throw new AcpConfigControlError(
          "unconfirmed",
          `The session reports a different value for config option ${JSON.stringify(configId)}.`,
          { configId },
        );
      }

      // Reconcile the thread config (standard categories included) and emit
      // it through the normal config listener — no prompt/turn/status change.
      const current = this.options.getCurrentConfig();
      if (current) {
        this.options.onConfigReconciled(
          this.options.configSync.reduceConfigOptions(
            current,
            this.options.configSync.listRetainedConfigOptions(),
          ),
        );
      }
    } finally {
      waiter?.cancel();
      if (!flight || flightSettled) {
        release();
      } else {
        // The SDK write is unabortable and its outcome unknown: keep the
        // writer held until it settles so no second mutation can start.
        void flight.catch(() => {}).then(() => release());
      }
    }
  }

  private unavailable(message: string, configId: string): AcpConfigControlError {
    return new AcpConfigControlError("unavailable", message, { configId });
  }

  private assertLiveOwner(configId: string): AcpSessionConfigOwner {
    const owner = this.options.getOwner();
    if (!owner || owner.sessionId.length === 0) {
      throw this.unavailable("ACP session is not open.", configId);
    }
    if (owner.disposed) throw this.unavailable("ACP session was disposed.", configId);
    if (owner.transportClosed) throw this.unavailable("ACP transport is closed.", configId);
    return owner;
  }

  private sameOwner(owner: AcpSessionConfigOwner): boolean {
    const current = this.options.getOwner();
    if (!current) return false;
    return (
      current.sessionId === owner.sessionId &&
      current.generation === owner.generation &&
      !current.disposed &&
      !current.transportClosed
    );
  }

  private buildWireWrite(
    option: Record<string, unknown>,
    configId: string,
    value: AcpSessionConfigOptionWriteValue,
  ): WireWrite {
    if (typeof value === "boolean") {
      if (option.type !== "boolean" || typeof option.currentValue !== "boolean") {
        throw new AcpConfigControlError(
          "invalid_value",
          `Config option ${JSON.stringify(configId)} does not advertise a boolean control.`,
          { configId },
        );
      }
      if (!this.options.isBooleanCapabilityNegotiated()) {
        throw new AcpConfigControlError(
          "invalid_value",
          `Boolean config options were not negotiated for this session; ${JSON.stringify(configId)} cannot be set.`,
          { configId },
        );
      }
      return { kind: "boolean", value };
    }
    if (typeof value !== "string") {
      throw new AcpConfigControlError(
        "invalid_value",
        `Config option ${JSON.stringify(configId)} requires a select value id or a boolean.`,
        { configId },
      );
    }
    if (option.type === "boolean") {
      throw new AcpConfigControlError(
        "invalid_value",
        `Boolean config option ${JSON.stringify(configId)} requires a boolean value.`,
        { configId },
      );
    }
    if (option.type !== "select") {
      throw new AcpConfigControlError(
        "unsupported_option",
        `Config option ${JSON.stringify(configId)} does not advertise a settable control type.`,
        { configId, controlType: typeof option.type === "string" ? option.type : undefined },
      );
    }
    // Exact advertised membership; empty-string values are legitimate value
    // ids and are honored like any other.
    const advertised = listAdvertisedSelectValueIds(option);
    if (advertised.includes(value)) {
      return { kind: "select", value };
    }
    // Unlisted values stay rejected unless a declared predicate explicitly
    // qualifies this exact (configId, value, option) triple. The predicate
    // sees a detached option snapshot and its verdict is final: false or a
    // throw fails the write before any send, and no option row or alias is
    // manufactured — the echo confirmation below still has to carry the
    // exact value back.
    const guard = this.options.allowUnlistedSelectValue;
    if (!guard) {
      throw new AcpConfigControlError(
        "invalid_value",
        `Value ${JSON.stringify(value)} is not advertised for config option ${JSON.stringify(configId)}.`,
        { configId },
      );
    }
    let detachedOption: Record<string, unknown>;
    try {
      detachedOption = structuredClone(option) as Record<string, unknown>;
    } catch (error) {
      throw new AcpConfigControlError(
        "invalid_value",
        `The unlisted-value guard for config option ${JSON.stringify(configId)} could not detach the option snapshot: ${toErrorMessage(error)}`,
        { configId },
      );
    }
    let allowed: boolean;
    try {
      allowed = guard(configId, value, detachedOption) === true;
    } catch (error) {
      throw new AcpConfigControlError(
        "invalid_value",
        `The unlisted-value guard rejected config option ${JSON.stringify(configId)}: ${toErrorMessage(error)}`,
        { configId },
      );
    }
    if (!allowed) {
      throw new AcpConfigControlError(
        "invalid_value",
        `Value ${JSON.stringify(value)} is not advertised for config option ${JSON.stringify(configId)} and the unlisted-value guard declined it.`,
        { configId },
      );
    }
    return { kind: "select", value };
  }

  private optionNowMatches(configId: string, wire: WireWrite): boolean {
    const option = findAdvertisedConfigOption(
      this.options.configSync.listRetainedConfigOptions(),
      configId,
    );
    if (!option) return false;
    return option.type === wire.kind && option.currentValue === wire.value;
  }
}
