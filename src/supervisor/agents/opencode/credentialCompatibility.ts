import type { ProjectLocation } from "@/shared/contracts";
import type { AcquiredOpenCodeServer } from "./client";
import type { CredentialEntry } from "./clientTypes";
import type { OpenCodeDatabase } from "./database";
import { openOpenCodeCredentialJournal } from "./credentialJournal";

type Acquire = (database: OpenCodeDatabase) => Promise<AcquiredOpenCodeServer>;
const queues = new Map<string, Promise<unknown>>();
const initialized = new Set<string>();
const stores = new Map<string, ReturnType<typeof openOpenCodeCredentialJournal>>();
const options = () => ({ signal: AbortSignal.timeout(30_000) });
const runtimeKey = (location: ProjectLocation) =>
  location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;

async function serialized<T>(location: ProjectLocation, operation: () => Promise<T>): Promise<T> {
  const key = runtimeKey(location);
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  queues.set(key, next);
  try {
    return await next;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}

async function storeFor(location: ProjectLocation) {
  const key = runtimeKey(location);
  let store = stores.get(key);
  if (!store) {
    store = openOpenCodeCredentialJournal(location);
    stores.set(key, store);
    void store.catch(() => {
      if (stores.get(key) === store) stores.delete(key);
    });
  }
  return store;
}

function createInput(entry: CredentialEntry, activate = entry.active) {
  return {
    id: entry.id,
    integrationID: entry.integrationID,
    label: entry.label,
    value: entry.value,
    activate,
  };
}

/**
 * Import pre-upgrade key/external credentials once. Native storage is authoritative
 * afterward; a missing native copy must never resurrect from a resumed legacy DB.
 * Conversation/form state stays in its original database without lossy transfer.
 * OAuth grants stay in their original database: copying rotating refresh tokens
 * into two servers is unsafe. New native sessions require a native OAuth login.
 */
export async function synchronizeOpenCodeCredentials(
  location: ProjectLocation,
  acquired: AcquiredOpenCodeServer,
  acquire: Acquire,
): Promise<void> {
  await serialized(location, async () => {
    const key = runtimeKey(location);
    const store = await storeFor(location);
    const release = await store.lock();
    try {
      const journal = await store.read();
      const pending = Object.values(journal.credentials).some(
        (state) => state === "pending-import" || state === "pending-revoke",
      );
      if (acquired.database === "native" && initialized.has(key) && !pending) return;
      const other = await acquire(acquired.database === "native" ? "legacy-isolated" : "native");
      const native = acquired.database === "native" ? acquired.client : other.client;
      const legacy = acquired.database === "legacy-isolated" ? acquired.client : other.client;
      try {
        // Revocation is persisted before either deletion, so an interrupted logout
        // is retried before any credential import or session can use a stale copy.
        for (const [id, state] of Object.entries(journal.credentials)) {
          if (state !== "pending-revoke" && state !== "revoked") continue;
          await native.credential.remove({ credentialID: id }, options());
          await legacy.credential.remove({ credentialID: id }, options());
          if (state === "pending-revoke") {
            journal.credentials[id] = "revoked";
            await store.write(journal);
          }
        }
        const nativeEntries = new Map(
          (await native.credential.list(options())).map((entry) => [entry.id, entry]),
        );
        const legacyEntries = await legacy.credential.list(options());
        for (const entry of legacyEntries) {
          const state = journal.credentials[entry.id];
          if (state === "revoked" || entry.value.type === "oauth") continue;
          if (!nativeEntries.has(entry.id) && state !== "imported") {
            journal.credentials[entry.id] = "pending-import";
            await store.write(journal);
            const hasActive = [...nativeEntries.values()].some(
              (candidate) => candidate.integrationID === entry.integrationID && candidate.active,
            );
            const imported = await native.credential.create(
              createInput(entry, entry.active && !hasActive),
              options(),
            );
            nativeEntries.set(entry.id, imported);
          }
          if (state !== "imported") {
            journal.credentials[entry.id] = "imported";
            await store.write(journal);
          }
        }
        if (acquired.database === "legacy-isolated") {
          const targetEntries = new Map(legacyEntries.map((entry) => [entry.id, entry]));
          const oauthSelections = legacyEntries.filter(
            (entry) => entry.value.type === "oauth" && entry.active,
          );
          for (const entry of legacyEntries) {
            if (entry.value.type !== "oauth" && !nativeEntries.has(entry.id))
              await legacy.credential.remove({ credentialID: entry.id }, options());
          }
          for (const entry of nativeEntries.values()) {
            // Neither side of an OAuth ID collision may be replaced or copied.
            if (entry.value.type === "oauth" || targetEntries.get(entry.id)?.value.type === "oauth")
              continue;
            if (journal.credentials[entry.id] !== "imported") {
              journal.credentials[entry.id] = "imported";
              await store.write(journal);
            }
            const target = targetEntries.get(entry.id);
            if (
              target &&
              JSON.stringify(target.value) === JSON.stringify(entry.value) &&
              target.label === entry.label &&
              target.integrationID === entry.integrationID
            )
              continue;
            if (target) await legacy.credential.remove({ credentialID: entry.id }, options());
            await legacy.credential.create(createInput(entry, false), options());
          }
          for (const entry of nativeEntries.values()) {
            if (
              entry.active &&
              entry.value.type !== "oauth" &&
              !oauthSelections.some((selected) => selected.integrationID === entry.integrationID) &&
              targetEntries.get(entry.id)?.value.type !== "oauth"
            )
              await legacy.credential.activate({ credentialID: entry.id }, options());
          }
          // Upstream may select a new inactive credential by creation order.
          for (const entry of oauthSelections)
            await legacy.credential.activate({ credentialID: entry.id }, options());
        }
        initialized.add(key);
      } finally {
        await other.dispose();
      }
    } finally {
      await release();
    }
  });
}

export async function revokeOpenCodeCredential(
  location: ProjectLocation,
  id: string,
  acquire: Acquire,
): Promise<void> {
  await serialized(location, async () => {
    initialized.delete(runtimeKey(location));
    const store = await storeFor(location);
    const release = await store.lock();
    try {
      const journal = await store.read();
      journal.credentials[id] = "pending-revoke";
      await store.write(journal);
      const native = await acquire("native");
      try {
        await native.client.credential.remove({ credentialID: id }, options());
        const legacy = await acquire("legacy-isolated");
        try {
          await legacy.client.credential.remove({ credentialID: id }, options());
          journal.credentials[id] = "revoked";
          await store.write(journal);
        } finally {
          await legacy.dispose();
        }
      } finally {
        await native.dispose();
      }
    } finally {
      await release();
    }
  });
}

export function clearOpenCodeCredentialCompatibility(): void {
  initialized.clear();
  stores.clear();
}
