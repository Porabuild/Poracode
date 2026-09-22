import type { EnvironmentRecord, EnvironmentRuntime } from "@/shared/environments";
import type { EnvironmentStore } from "./EnvironmentStore";
import { EnvironmentRevisionConflictError } from "./environmentStoreErrors";
import { EnvironmentRuntimeError, environmentRuntimeError } from "./environmentRuntimeErrors";

/**
 * Runtime-owned durable store writes.
 *
 * The runtime service converges host-observed facts (adopted system trust,
 * first child identity, explicit upgrade runtime) onto the record it does not
 * author: another writer may have bumped the revision, so these three writes
 * re-read the current revision and retry a CAS conflict a bounded number of
 * times. Route/management mutations keep the full `EnvironmentStore` API and
 * their strict, non-retried `expectedRevision` contract.
 *
 * Every failure — including the retry exhaustion — maps through
 * `environmentRuntimeError`, so no raw store error escapes this module.
 */

export type EnvironmentRuntimeWriteStore = Pick<
  EnvironmentStore,
  "getRecord" | "recordObservedTrust" | "pinTrust" | "recordChildIdentity" | "setRuntime"
>;

const CAS_ATTEMPTS = 4;

export async function recordObservedTrust(
  store: EnvironmentRuntimeWriteStore,
  environmentId: string,
  observedFingerprint: string,
): Promise<EnvironmentRecord> {
  return mutateWithCas(store, environmentId, (revision) =>
    store.recordObservedTrust({
      environmentId,
      expectedRevision: revision,
      observedFingerprint,
    }),
  );
}

export async function pinTrust(
  store: EnvironmentRuntimeWriteStore,
  environmentId: string,
  expectedRevision: number,
  hostKeyFingerprint: string,
): Promise<EnvironmentRecord> {
  try {
    return await store.pinTrust({
      environmentId,
      expectedRevision,
      hostKeyFingerprint,
      observedFingerprint: hostKeyFingerprint,
    });
  } catch (error) {
    throw environmentRuntimeError(error);
  }
}

export async function recordChildIdentity(
  store: EnvironmentRuntimeWriteStore,
  environmentId: string,
  desktopId: string,
): Promise<EnvironmentRecord> {
  return mutateWithCas(store, environmentId, (revision) =>
    store.recordChildIdentity({
      environmentId,
      expectedRevision: revision,
      desktopId,
    }),
  );
}

export async function setRuntime(
  store: EnvironmentRuntimeWriteStore,
  environmentId: string,
  runtime: EnvironmentRuntime,
): Promise<EnvironmentRecord> {
  return mutateWithCas(store, environmentId, (revision) =>
    store.setRuntime({ environmentId, expectedRevision: revision, runtime }),
  );
}

/**
 * Internal CAS retry for runtime-owned writes (observed trust, child
 * identity, selected runtime). Route CAS remains strict: an explicit
 * expectedRevision mismatch is never retried.
 */
async function mutateWithCas<T>(
  store: EnvironmentRuntimeWriteStore,
  environmentId: string,
  mutate: (revision: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const record = requireRecord(store, environmentId);
    try {
      return await mutate(record.revision);
    } catch (error) {
      if (error instanceof EnvironmentRevisionConflictError) continue;
      throw environmentRuntimeError(error);
    }
  }
  throw new EnvironmentRuntimeError("environment/revision-conflict");
}

function requireRecord(
  store: EnvironmentRuntimeWriteStore,
  environmentId: string,
): EnvironmentRecord {
  const record = store.getRecord(environmentId);
  if (record === undefined) throw new EnvironmentRuntimeError("environment/not-found");
  return record;
}
