export function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export function writeStoredNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export function readStoredString(key: string, fallback: string | null = null): string | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Parsed JSON stored under `key`, or null when missing, unreadable, or malformed. */
export function readStoredJson(key: string): unknown {
  const raw = readStoredString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  writeStoredString(key, JSON.stringify(value));
}

export function removeStoredKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const QUOTA_ERROR_NAMES = new Set(["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"]);

/** True for the storage error browsers throw when a write does not fit the origin's quota. */
export function isQuotaExceededError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    QUOTA_ERROR_NAMES.has(String((error as { name: unknown }).name))
  );
}

type PressureRelief = (minBytes: number) => number;
const pressureReliefs = new Set<PressureRelief>();

/**
 * Registers how a disposable cache gives up room. `relieveLocalStoragePressure`
 * asks it to free at least `minBytes`; a cache that keeps timestamps gives up
 * its oldest data first. It returns the bytes it freed.
 */
export function registerLocalStoragePressureRelief(relief: PressureRelief): void {
  pressureReliefs.add(relief);
}

/**
 * Makes room for an essential write (unsent composer text) that the origin
 * quota rejected, by asking every registered disposable cache to free at least
 * `minBytes`. Returns the bytes reportedly freed; 0 means nothing is disposable.
 */
export function relieveLocalStoragePressure(minBytes: number): number {
  let freed = 0;
  for (const relief of pressureReliefs) {
    try {
      freed += Math.max(0, relief(minBytes) || 0);
    } catch {
      /* One unavailable cache must not block the others. */
    }
  }
  return freed;
}

export function resetLocalStoragePressureReliefsForTest(): void {
  pressureReliefs.clear();
}
