/** Browser-managed lifetime locks distinguish crashed windows from suspended ones. */
export const WINDOW_LEASE_PREFIX = "poracode-client-draft-window-v1:";
const windowId = crypto.randomUUID();
const key = WINDOW_LEASE_PREFIX + windowId;
const lockName = "poracode.client-draft.window." + windowId;
let registered = false;
let generation = 0;
let registration: Promise<void> | undefined;
let lifetime: Promise<unknown> | undefined;
let release: (() => void) | undefined;
const listeners = new Set<() => void>();
const closeFlushers = new Set<() => void>();
const locks = () => (globalThis.navigator as Navigator | undefined)?.locks;

function mark(value: string) {
  try {
    localStorage.setItem(key, value);
    registered = true;
    for (const listener of listeners) listener();
  } catch {
    // Without cross-window proof, reclamation stays conservative.
  }
}

export function registerClientDraftWindow() {
  if (registered || registration || typeof window === "undefined") return;
  // Publish custody before an async lock request or asset write can yield.
  mark("active");
  if (!registered) return;
  const manager = locks();
  if (!manager?.request) return;
  const incarnation = generation;
  registration = new Promise<void>((ready) => {
    lifetime = manager
      .request(lockName, async () => {
        if (incarnation !== generation) {
          ready();
          return;
        }
        mark(JSON.stringify({ formatVersion: 1, lockName }));
        ready();
        if (registered)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
      })
      .catch(() => {
        if (incarnation === generation) mark("active");
        ready();
      })
      .finally(() => {
        if (incarnation === generation && !registered) registration = undefined;
      });
  });
}

export function ownsOnlyActiveDraftWindow(): boolean {
  registerClientDraftWindow();
  if (!registered) return false;
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (name?.startsWith(WINDOW_LEASE_PREFIX) && name !== key) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** No TTL on drafts: remove a marker only while holding its abandoned lifetime lock. */
export async function reconcileClientDraftWindows(): Promise<boolean> {
  registerClientDraftWindow();
  await registration;
  const manager = locks();
  if (!manager?.request) return false;
  let removed = false;
  const markers: Array<[string, string]> = [];
  for (let index = 0; index < localStorage.length; index++) {
    const name = localStorage.key(index);
    if (!name?.startsWith(WINDOW_LEASE_PREFIX) || name === key) continue;
    const raw = localStorage.getItem(name);
    if (raw) markers.push([name, raw]);
  }
  for (const [name, raw] of markers) {
    let marker: { formatVersion?: unknown; lockName?: unknown };
    try {
      marker = JSON.parse(raw) as typeof marker;
    } catch {
      continue;
    }
    if (
      marker.formatVersion !== 1 ||
      marker.lockName !== "poracode.client-draft.window." + name.slice(WINDOW_LEASE_PREFIX.length)
    )
      continue;
    await manager.request(marker.lockName, { ifAvailable: true }, (lock) => {
      if (lock && localStorage.getItem(name) === raw) {
        localStorage.removeItem(name);
        removed = true;
      }
    });
  }
  return removed;
}

export function onClientDraftWindowReady(listener: () => void) {
  listeners.add(listener);
}

export function registerClientDraftCloseFlusher(flush: () => void): () => void {
  closeFlushers.add(flush);
  return () => {
    closeFlushers.delete(flush);
  };
}

async function retireWindow() {
  generation++;
  try {
    localStorage.removeItem(key);
  } catch {
    /* preserve on storage failure */
  }
  release?.();
  release = undefined;
  registered = false;
  registration = undefined;
  const previous = lifetime;
  lifetime = undefined;
  await previous;
}
if (typeof window !== "undefined")
  window.addEventListener("pagehide", (event) => {
    // Native events can run microtasks between listeners. Checkpoint and retire
    // in one callback so released custody always follows the durable references.
    for (const flush of closeFlushers) flush();
    if (!event.persisted) void retireWindow();
  });
export const resetClientDraftWindowForTest = retireWindow;
