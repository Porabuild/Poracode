import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";

/**
 * Admission bookkeeping for persisted shared-settings writes, extracted from
 * `sharedSettingsStore` so the large store module does not grow. This module
 * owns only the authority state machine; the store keeps the orchestration
 * (transport facts, bridge calls, zustand publication).
 *
 * `wholeSettingsAuthority` means this client holds a whole-snapshot view of
 * the host's settings — from a successful authoritative read or a whole owner
 * push — so its whole-document bridge write is safe. A refused or still
 * pending initial read never grants it: persisting then would clobber the
 * host settings file with local fallback/cache defaults. Until authority
 * exists, setters still update the store and the localStorage cache, but the
 * bridge write is skipped.
 *
 * `boundedBridgeWrites` covers surfaces whose bridge write is not a
 * whole-document replacement but the mirror-bounded diff push
 * (`remoteSettingsSync.pushDesktopSettingsDiff` — the browser client and
 * Electron attached to a standalone owner alike): a delivered desktop mirror
 * push authorizes exactly that bounded path. On the managed Electron shell
 * the bridge write replaces the whole document, so only
 * `wholeSettingsAuthority` admits.
 *
 * Pushes are also tracked field-by-field while an initial read is in flight
 * (`beginInitialRead` → `takeInitialReadReconciliation`): when the read
 * settles after pushes landed, the read is still admitted — it is the only
 * complete authoritative base — but the newer pushed fields are reconciled
 * over it, so neither the read's older snapshot nor the partial push's
 * missing keys can win. A whole owner push is the exception: it grants
 * complete authority outright, which makes the read's older snapshot obsolete
 * by construction and the read is retired unpublished instead.
 */

let wholeSettingsAuthority = false;
let boundedBridgeWrites = false;
let initialReadRefused = false;
let initialReadRefusal: unknown;
let pushedFields: Partial<SharedSettings> = {};
let admittedWaiters: Array<() => void> = [];

/**
 * How an initial read may settle against the pushes that landed in flight.
 * `supersededByWholeAuthority` means a whole owner push granted complete
 * authority mid-read: the snapshot is obsolete and must not be published.
 * Otherwise the read stays the authoritative base and `pushedFields` holds
 * the newer pushed fields to reconcile over it (absent when the read can be
 * applied as-is).
 */
export type InitialReadReconciliation =
  | { supersededByWholeAuthority: true }
  | { supersededByWholeAuthority: false; pushedFields?: Partial<SharedSettings> };

/**
 * Bumped by every applied external push. The initial read records the epoch
 * it started at; when one has advanced by settlement time, a newer owner push
 * already superseded the read's older snapshot and its outcome must not
 * overwrite or downgrade what the push delivered.
 */
let authorityEpoch = 0;

export function settingsWritesAdmitted(): boolean {
  return wholeSettingsAuthority || boundedBridgeWrites;
}

/**
 * Boot grant for a surface with no client bridge at all: there is no host
 * settings document to clobber (persistence is device-local only), so writes
 * are admitted from the start.
 */
export function admitLocalSettingsWrites(): void {
  grantWholeSettingsAuthority();
}

const WHOLE_SHARED_SETTINGS_KEYS = Object.keys(
  defaultSharedSettings,
) as readonly (keyof SharedSettings)[];

/**
 * Whether `partial` holds an own, defined value for every settings key — the
 * shape `normalizeSharedSettings` (the production push) produces. `in` would
 * also match inherited properties and explicitly-`undefined` values, neither
 * of which delivers a setting.
 */
function ownsDefinedValue(key: keyof SharedSettings, partial: Partial<SharedSettings>): boolean {
  return Object.prototype.hasOwnProperty.call(partial, key) && partial[key] !== undefined;
}

export function isWholeSharedSettingsSnapshot(partial: Partial<SharedSettings>): boolean {
  return WHOLE_SHARED_SETTINGS_KEYS.every((key) => ownsDefinedValue(key, partial));
}

function notifyWritesAdmitted(): void {
  if (admittedWaiters.length === 0) return;
  const waiters = admittedWaiters;
  admittedWaiters = [];
  for (const resolve of waiters) resolve();
}

function grantWholeSettingsAuthority(): void {
  const wasAdmitted = settingsWritesAdmitted();
  wholeSettingsAuthority = true;
  // A whole owner push is successful authority: it re-opens persisted writes
  // and retires a preserved read refusal.
  initialReadRefused = false;
  initialReadRefusal = undefined;
  if (!wasAdmitted) notifyWritesAdmitted();
}

/**
 * Records an external push (a remote client's edit or a paired desktop's
 * mirror). Every push advances the epoch; a whole snapshot grants whole
 * authority, and on a surface whose write path is the bounded mirror diff a
 * delivered push grants exactly that bounded admission.
 */
export function noteExternalPush(
  partial: Partial<SharedSettings>,
  boundedWritePath: boolean,
): void {
  authorityEpoch += 1;
  let delivered: Partial<SharedSettings> = {};
  for (const key of WHOLE_SHARED_SETTINGS_KEYS) {
    const value = partial[key];
    if (value !== undefined && Object.prototype.hasOwnProperty.call(partial, key)) {
      delivered = { ...delivered, [key]: value };
    }
  }
  pushedFields = { ...pushedFields, ...delivered };
  if (isWholeSharedSettingsSnapshot(partial)) {
    grantWholeSettingsAuthority();
  } else if (boundedWritePath && !boundedBridgeWrites) {
    boundedBridgeWrites = true;
    notifyWritesAdmitted();
  }
}

/** Marks the start of the module's authoritative initial read. */
export function beginInitialRead(): number {
  return authorityEpoch;
}

/**
 * Consumes the pushes that landed while the read was in flight. Returns
 * `supersededByWholeAuthority` when a whole owner push granted complete
 * authority mid-read — the snapshot is then obsolete and must be retired
 * without publication (the push already hydrated the store, and publishing
 * the older snapshot would roll back the push and any local edit accepted
 * since). Otherwise the read is still the only complete authoritative base:
 * `pushedFields` carries the newer pushed fields to reconcile over its
 * snapshot, and the read result must be published before `admitInitialRead`
 * is called so a flush woken by the admission never observes stale store
 * state. Note the superseded decision reads whole-document authority, not
 * `settingsWritesAdmitted()`: a bounded mirror push admits exactly the
 * bounded write path and still needs the read as its complete base.
 */
export function takeInitialReadReconciliation(readEpoch: number): InitialReadReconciliation {
  const settlement: InitialReadReconciliation = wholeSettingsAuthority
    ? { supersededByWholeAuthority: true }
    : authorityEpoch !== readEpoch && Object.keys(pushedFields).length > 0
      ? { supersededByWholeAuthority: false, pushedFields: { ...pushedFields } }
      : { supersededByWholeAuthority: false };
  pushedFields = {};
  return settlement;
}

/** Grants whole authority for a successfully settled initial read. */
export function admitInitialRead(): void {
  grantWholeSettingsAuthority();
}

/**
 * Records a failed initial read. Returns `false` — recording nothing — when a
 * newer push superseded the read while it was in flight: that late failure
 * must not reintroduce a refusal against authority the push already
 * established. Returns `true` when the failure is current and the refusal is
 * now the preserved one.
 */
export function noteInitialReadFailure(error: unknown, readEpoch: number): boolean {
  if (authorityEpoch !== readEpoch) return false;
  initialReadRefused = true;
  initialReadRefusal = error;
  return true;
}

/** The read refusal preserved for a required flush to surface, if any. */
export function preservedReadRefusal(): { refused: boolean; error: unknown } {
  return { refused: initialReadRefused, error: initialReadRefusal };
}

/**
 * A cancellable wait for write admission. `unsubscribe` removes the wait's
 * subscription so a caller that stops awaiting (a race the read settled
 * first) does not keep a waiter registered until some future grant; it is
 * inert once the promise resolved and safe to call repeatedly.
 */
export interface WritesAdmissionWait {
  promise: Promise<void>;
  unsubscribe: () => void;
}

/**
 * Resolves as soon as write admission exists — immediately when it already
 * does, otherwise at the next granting push or read. A required flush with no
 * verdict yet races this against the initial read's settlement so an owner
 * push answers it without waiting for the read; it unsubscribes in a
 * `finally` because `Promise.race` never cancels its losing promise.
 */
export function whenWritesAdmitted(): WritesAdmissionWait {
  if (settingsWritesAdmitted()) {
    return { promise: Promise.resolve(), unsubscribe: () => {} };
  }
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  const unsubscribe = (): void => {
    const index = admittedWaiters.indexOf(resolve);
    if (index !== -1) admittedWaiters.splice(index, 1);
  };
  admittedWaiters.push(resolve);
  return { promise, unsubscribe };
}
