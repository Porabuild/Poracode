const DEVICE_ID_STORAGE_KEY = "poracode.browser.push-device-id.v1";
const LEGACY_DATABASE_NAME = "lightcode-mobile";
const LEGACY_PREFERENCE_KEY = "pushDeviceId";

let deviceIdPromise: Promise<string> | null = null;

async function readLegacyDeviceId(): Promise<string | null> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return null;
  const databases = await indexedDB.databases().catch(() => []);
  if (!databases.some((database) => database.name === LEGACY_DATABASE_NAME)) return null;

  return await new Promise<string | null>((resolve) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("preferences")) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction("preferences", "readonly");
      const read = transaction.objectStore("preferences").get(LEGACY_PREFERENCE_KEY);
      read.onerror = () => resolve(null);
      read.onsuccess = () => {
        const value = (read.result as { value?: unknown } | undefined)?.value;
        resolve(typeof value === "string" && value ? value : null);
      };
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    };
  });
}

async function createOrReadDeviceId(): Promise<string> {
  const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (stored) return stored;
  const deviceId = (await readLegacyDeviceId()) ?? crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

export function getOrCreateBrowserDeviceId(): Promise<string> {
  deviceIdPromise ??= createOrReadDeviceId().catch((error: unknown) => {
    deviceIdPromise = null;
    throw error;
  });
  return deviceIdPromise;
}

export function resetBrowserDeviceIdForTest(): void {
  deviceIdPromise = null;
}
