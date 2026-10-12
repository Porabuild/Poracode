import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { normalizeSharedSettings, type SharedSettings } from "@/shared/settings";

/**
 * Initial-read lifecycle of the shared settings store. Every test loads a
 * fresh module instance so the module-scope hydration block runs against the
 * bridge mock installed for that scenario (refused read, held read, whole or
 * partial owner push, attached runtime, or no bridge at all).
 */

type SharedSettingsStoreModule = typeof import("./sharedSettingsStore");

const originalPoracode = window.poracode;
const originalPoracodeHost = window.poracodeHost;

// The attached-Electron dispatch intercepts `setSharedSettings` and forwards
// it through these modules (dynamic imports inside clientRuntime); mocking
// them keeps the real transport dispatch observable without a paired owner.
const attachSettingsSync = vi.hoisted(() => ({
  push: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("../browser/remoteBridge", () => ({
  getRemoteBridgeClient: () => null,
}));
vi.mock("../browser/remoteSettingsSync", () => ({
  pushDesktopSettingsDiff: attachSettingsSync.push,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installBridge(surface: "electron" | "web", read: () => Promise<SharedSettings>) {
  const bridge = {
    // The read is created lazily so a pre-rejected promise only exists once
    // the fresh module attaches its own handler to it.
    getSharedSettings: vi.fn<() => Promise<SharedSettings>>(read),
    setSharedSettings: vi.fn<(settings: SharedSettings) => Promise<void>>(() => Promise.resolve()),
  };
  if (surface === "electron") {
    // A truthy poracodeHost marks the Electron shell surface: the preload
    // bridge exists, but the write path (whole-document vs mirror-bounded
    // diff) comes from the installed client runtime, not from this flag.
    window.poracodeHost = { channel: "test" } as unknown as NonNullable<typeof window.poracodeHost>;
  }
  // The browser surface's bridge shim identifies itself with `arch: "web"`,
  // which makes its runtime a remote-session transport whose settings write
  // is the mirror-bounded diff push.
  window.poracode = {
    ...(surface === "web" ? { arch: "web" } : {}),
    ...bridge,
  } as unknown as typeof window.poracode;
  return bridge;
}

/** Installs the real attached-Electron runtime, then loads the store in the
 * same module graph — the sequencing the attach bootstrap produces (the
 * runtime is installed before the store module first evaluates). */
async function loadAttachedElectronStore(): Promise<SharedSettingsStoreModule> {
  vi.resetModules();
  const { installAttachedElectronClientRuntime } = await import("../clientRuntime");
  const host = {
    channel: "test",
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: async () => undefined,
  } as unknown as NonNullable<typeof window.poracodeHost>;
  window.poracodeHost = host;
  const attachInfo: StandaloneAttachInfo = {
    profileNamespace: "/tmp/profile",
    dataRoot: "/tmp/profile.host-v1",
    endpoint: "http://127.0.0.1:49152/",
    ownerGeneration: "11111111-1111-4111-8111-111111111111",
    remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    pairingUrl: "http://127.0.0.1:49152/#token=fixture-pairing-credential",
    capabilities: {
      ssh: true,
      browserPanel: false,
      chromeBridge: true,
      computerUse: true,
      nativeSecrets: false,
      portForward: true,
      autoUpdate: false,
      osNotifications: false,
    },
  };
  installAttachedElectronClientRuntime(host, attachInfo);
  return await import("./sharedSettingsStore");
}

async function loadFreshStore(): Promise<SharedSettingsStoreModule> {
  vi.resetModules();
  return await import("./sharedSettingsStore");
}

/**
 * Loads the store with a transparent test-side wrapper around the admission
 * helper that counts subscription creation and release. The production module
 * exposes no waiter introspection — this observes the public seam only.
 */
async function loadStoreWithAdmissionWaiterCounts(): Promise<{
  store: SharedSettingsStoreModule;
  waiters: { created: number; released: number };
}> {
  vi.resetModules();
  const waiters = { created: 0, released: 0 };
  vi.doMock("./sharedSettingsAuthority", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./sharedSettingsAuthority")>();
    return {
      ...actual,
      whenWritesAdmitted: () => {
        const handle = actual.whenWritesAdmitted();
        waiters.created += 1;
        return {
          promise: handle.promise,
          unsubscribe: () => {
            waiters.released += 1;
            handle.unsubscribe();
          },
        };
      },
    };
  });
  const store = await import("./sharedSettingsStore");
  vi.doUnmock("./sharedSettingsAuthority");
  return { store, waiters };
}

/** Lets the module's initial read settle without performing a bridge write. */
async function settleRead(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function cachedSettings(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem("poracode-shared-settings") ?? "null") as Record<
    string,
    unknown
  >;
}

describe("sharedSettingsStore hydration authority", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    if (originalPoracode !== undefined) window.poracode = originalPoracode;
    else Reflect.deleteProperty(window, "poracode");
    if (originalPoracodeHost !== undefined) window.poracodeHost = originalPoracodeHost;
    else Reflect.deleteProperty(window, "poracodeHost");
  });

  it("keeps persisted writes blocked and preserves the refusal when the authoritative read fails", async () => {
    const refusal = new Error("Settings document could not be read");
    const bridge = installBridge("electron", () => Promise.reject(refusal));
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadFreshStore();

    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));

    // A refused read never becomes authority: setters still update the store
    // and the local cache, but nothing may be persisted to the host document.
    useSharedSettings.getState().setThemeMode("light");
    expect(useSharedSettings.getState().themeMode).toBe("light");
    expect(cachedSettings()).toMatchObject({ themeMode: "light" });
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();

    // A passive flush stays non-throwing; a required confirmation must
    // surface the actual read refusal instead of claiming a write that never
    // happened.
    await expect(flushSharedSettings()).resolves.toBeUndefined();
    await expect(flushSharedSettings({ requireSuccess: true })).rejects.toBe(refusal);

    // A successful whole owner push restores the write authority.
    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "system" }));
    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
  });

  it("recovers persisted writes from a whole owner push after a refused read without echoing it", async () => {
    const refusal = new Error("Settings document could not be read");
    const bridge = installBridge("electron", () => Promise.reject(refusal));
    const { applyExternalSharedSettings, useSharedSettings } = await loadFreshStore();
    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));

    const pushed = normalizeSharedSettings({ themeMode: "light" });
    applyExternalSharedSettings(pushed);
    expect(useSharedSettings.getState().themeMode).toBe("light");
    // The push itself applies without echoing a persist.
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();

    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
    expect(bridge.setSharedSettings.mock.calls[0]?.[0]).toMatchObject({ themeMode: "dark" });
  });

  it("does not let a partial push admit persisted writes before an authoritative read", async () => {
    const refusal = new Error("Settings document could not be read");
    const bridge = installBridge("electron", () => Promise.reject(refusal));
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadFreshStore();
    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));

    // A partial push carries authoritative values only for the keys it
    // holds; the rest of the store is still fallback state, so it must not
    // open whole-document persistence.
    applyExternalSharedSettings({ themeMode: "light" });
    expect(useSharedSettings.getState().themeMode).toBe("light");
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true);

    useSharedSettings.getState().setThemeMode("dark");
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();

    await expect(flushSharedSettings({ requireSuccess: true })).rejects.toBe(refusal);
  });

  it("does not treat an explicitly undefined key as delivered whole-snapshot authority", async () => {
    const refusal = new Error("Settings document could not be read");
    const bridge = installBridge("electron", () => Promise.reject(refusal));
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadFreshStore();
    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));

    // Whole-snapshot detection counts own, defined values: a payload that
    // merely lists every key while delivering `undefined` for one carries no
    // setting for it, so it must not admit the whole-document write. The
    // hostile payload is constructed past the type's optional-property
    // discipline on purpose.
    const undefinedKeyPush = {
      ...normalizeSharedSettings({}),
      themeMode: undefined,
    } as unknown as Partial<SharedSettings>;
    applyExternalSharedSettings(undefinedKeyPush);

    useSharedSettings.getState().setThemeMode("dark");
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();
    await expect(flushSharedSettings({ requireSuccess: true })).rejects.toBe(refusal);
  });

  it("holds persisted writes until a pending authoritative read succeeds", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { flushSharedSettings, useSharedSettings } = await loadFreshStore();
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(false);

    useSharedSettings.getState().setThemeMode("light");
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();
    expect(cachedSettings()).toMatchObject({ themeMode: "light" });

    // A required flush cannot confirm anything while the authority question
    // is open, so it waits for the read to settle.
    let confirmed = false;
    const confirmation = flushSharedSettings({ requireSuccess: true }).then(() => {
      confirmed = true;
    });
    await Promise.resolve();
    expect(confirmed).toBe(false);

    read.resolve(normalizeSharedSettings({ themeMode: "dark" }));
    await confirmation;
    expect(useSharedSettings.getState().themeMode).toBe("dark");
    expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1);
  });

  it("surfaces the read refusal when a held read fails during a required flush and keeps writes blocked", async () => {
    const refusal = new Error("Settings authority refused the read");
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { flushSharedSettings, useSharedSettings } = await loadFreshStore();

    const confirmation = flushSharedSettings({ requireSuccess: true });
    read.reject(refusal);
    await expect(confirmation).rejects.toBe(refusal);

    useSharedSettings.getState().setThemeMode("light");
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();
    // Hydration waiters still proceed with the best-available view.
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true);
  });

  it("proceeds with a required flush confirmed by a whole owner push while the read never settles", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadFreshStore();
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(false);

    let confirmed = false;
    const confirmation = flushSharedSettings({ requireSuccess: true }).then(() => {
      confirmed = true;
    });
    await Promise.resolve();
    expect(confirmed).toBe(false);

    // The full owner push answers the authority question while the read is
    // still held: the flush must proceed instead of starving on it.
    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    await confirmation;

    expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1);
    expect(bridge.setSharedSettings.mock.calls[0]?.[0]).toMatchObject({ themeMode: "light" });

    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(2));
    expect(bridge.setSharedSettings.mock.calls[1]?.[0]).toMatchObject({ themeMode: "dark" });
  });

  it("proceeds with a required flush started after a whole owner push even while the read never settles", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, flushSharedSettings } = await loadFreshStore();

    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    await expect(flushSharedSettings({ requireSuccess: true })).resolves.toBeUndefined();
    expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1);
  });

  it("reconciles a partial native push over the authoritative read instead of dropping either", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadFreshStore();

    // A partial native push lands while the initial read is still in flight.
    applyExternalSharedSettings({ themeMode: "light" });

    read.resolve(normalizeSharedSettings({ themeMode: "dark", staleThreadUnloadMinutes: 33 }));
    await settleRead();

    // The newer pushed field survives the older snapshot, and the keys the
    // push lacked come from the authoritative read — not from fallback
    // defaults. The read is still admitted: a whole push arriving later or
    // none at all, this is the only complete base the client will get.
    expect(useSharedSettings.getState().themeMode).toBe("light");
    expect(useSharedSettings.getState().staleThreadUnloadMinutes).toBe(33);
    expect(cachedSettings()).toMatchObject({
      themeMode: "light",
      staleThreadUnloadMinutes: 33,
    });

    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
    await expect(flushSharedSettings({ requireSuccess: true })).resolves.toBeUndefined();
  });

  it("admits persisted writes after a normal successful load", async () => {
    const bridge = installBridge("electron", () =>
      Promise.resolve(normalizeSharedSettings({ themeMode: "light" })),
    );
    const { useSharedSettings } = await loadFreshStore();
    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));
    expect(useSharedSettings.getState().themeMode).toBe("light");
    expect(cachedSettings()).toMatchObject({ themeMode: "light" });

    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
    expect(bridge.setSharedSettings.mock.calls[0]?.[0]).toMatchObject({ themeMode: "dark" });
  });

  it("does not let a late successful read roll back an accepted local edit made after a whole owner push", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, useSharedSettings, waitForPendingSharedSettings } =
      await loadFreshStore();

    // A whole owner push grants complete authority mid-read, so the local
    // edit is accepted and persisted immediately.
    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    useSharedSettings.getState().setThemeMode("system");
    await waitForPendingSharedSettings();
    expect(useSharedSettings.getState().themeMode).toBe("system");
    expect(cachedSettings()).toMatchObject({ themeMode: "system" });
    expect(bridge.setSharedSettings.mock.calls[0]?.[0]).toMatchObject({ themeMode: "system" });

    // The read snapshot predates both the push and the accepted edit:
    // settling it must retire the obsolete snapshot, not publish it over the
    // newer store and cache.
    read.resolve(normalizeSharedSettings({ themeMode: "dark" }));
    await settleRead();

    expect(useSharedSettings.getState().themeMode).toBe("system");
    expect(cachedSettings()).toMatchObject({ themeMode: "system" });

    // The next outgoing write carries the accepted edit, not the stale read.
    useSharedSettings.getState().setScrollSpeed(3);
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(2));
    expect(bridge.setSharedSettings.mock.calls[1]?.[0]).toMatchObject({
      themeMode: "system",
      scrollSpeed: 3,
    });
  });

  it("keeps an accepted local edit over a late read while its write is in flight and a delayed notification follows", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, useSharedSettings, waitForPendingSharedSettings } =
      await loadFreshStore();

    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    const pendingWrites: Array<() => void> = [];
    bridge.setSharedSettings.mockImplementation(() => {
      const gate = deferred<void>();
      pendingWrites.push(gate.resolve);
      return gate.promise;
    });

    // The accepted edit's whole-document write is still in flight when the
    // late read settles.
    useSharedSettings.getState().setThemeMode("system");
    await Promise.resolve();
    expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1);
    expect(bridge.setSharedSettings.mock.calls[0]?.[0]).toMatchObject({ themeMode: "system" });

    read.resolve(normalizeSharedSettings({ themeMode: "dark" }));
    await settleRead();
    expect(useSharedSettings.getState().themeMode).toBe("system");
    expect(cachedSettings()).toMatchObject({ themeMode: "system" });

    // A setter queued while the write is in flight must not capture the
    // stale read snapshot either.
    useSharedSettings.getState().setScrollSpeed(3);
    pendingWrites[0]?.();
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(2));
    pendingWrites[1]?.();
    await waitForPendingSharedSettings();
    expect(bridge.setSharedSettings.mock.calls[1]?.[0]).toMatchObject({
      themeMode: "system",
      scrollSpeed: 3,
    });

    // The delayed owner notification echoing the accepted edit (as a managed
    // commit would) leaves the newer state in place.
    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "system" }));
    expect(useSharedSettings.getState().themeMode).toBe("system");
    expect(cachedSettings()).toMatchObject({ themeMode: "system" });
  });

  it("releases the admission subscription when a held read rejects during a required flush", async () => {
    const refusal = new Error("Settings authority refused the read");
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { store, waiters } = await loadStoreWithAdmissionWaiterCounts();

    const confirmation = store.flushSharedSettings({ requireSuccess: true });
    read.reject(refusal);
    await expect(confirmation).rejects.toBe(refusal);

    // The read answered the race, so the flush's admission subscription must
    // be released instead of staying registered until some future grant.
    expect(waiters).toEqual({ created: 1, released: 1 });
    expect(bridge.setSharedSettings).not.toHaveBeenCalled();
  });

  it("leaves no admission subscriptions behind across repeated settled-refusal flushes", async () => {
    const refusal = new Error("Settings document could not be read");
    const bridge = installBridge("electron", () => Promise.reject(refusal));
    const { store, waiters } = await loadStoreWithAdmissionWaiterCounts();
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } = store;
    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));

    for (let attempt = 0; attempt < 25; attempt += 1) {
      await expect(flushSharedSettings({ requireSuccess: true })).rejects.toBe(refusal);
    }
    // Every created subscription was released: the count of losing waiters
    // does not grow with the retry count.
    expect(waiters).toEqual({ created: 25, released: 25 });

    // A whole owner push still recovers the surface afterwards.
    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
  });

  it("does not let a late successful read overwrite a newer whole owner push", async () => {
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, useSharedSettings } = await loadFreshStore();

    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true);

    // The read snapshot predates the owner push; settling it must not roll
    // the store or the persisted cache back to the older values.
    read.resolve(normalizeSharedSettings({ themeMode: "dark" }));
    await settleRead();

    expect(useSharedSettings.getState().themeMode).toBe("light");
    expect(cachedSettings()).toMatchObject({ themeMode: "light" });

    useSharedSettings.getState().setThemeMode("system");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
  });

  it("does not let a late refused read downgrade a newer whole owner push", async () => {
    const refusal = new Error("Late settings read failure");
    const read = deferred<SharedSettings>();
    const bridge = installBridge("electron", () => read.promise);
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadFreshStore();

    applyExternalSharedSettings(normalizeSharedSettings({ themeMode: "light" }));
    read.reject(refusal);
    await settleRead();

    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true);
    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
    // The stale failure must not reintroduce a refusal against the authority
    // the push established: a required confirmation proceeds.
    await expect(flushSharedSettings({ requireSuccess: true })).resolves.toBeUndefined();
  });

  it("persists locally and hydrates immediately without any client bridge", async () => {
    const { flushSharedSettings, useSharedSettings, whenSharedSettingsHydrated } =
      await loadFreshStore();

    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true);
    await whenSharedSettingsHydrated();

    useSharedSettings.getState().setThemeMode("light");
    expect(cachedSettings()).toMatchObject({ themeMode: "light" });
    await expect(flushSharedSettings()).resolves.toBeUndefined();
    await expect(flushSharedSettings({ requireSuccess: true })).resolves.toBeUndefined();
  });

  it("admits the browser surface's bounded diff write after a partial mirror push", async () => {
    const refusal = new Error('"getSharedSettings" is not available in a remote session.');
    const bridge = installBridge("web", () => Promise.reject(refusal));
    const { applyExternalSharedSettings, useSharedSettings } = await loadFreshStore();
    await vi.waitFor(() => expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true));

    // The browser surface has no local settings authority read; its bridge
    // write is the mirror-bounded diff push, authorized by the delivered
    // desktop mirror values.
    applyExternalSharedSettings({ themeMode: "light" });
    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(bridge.setSharedSettings).toHaveBeenCalledTimes(1));
    expect(bridge.setSharedSettings.mock.calls[0]?.[0]).toMatchObject({ themeMode: "dark" });
  });

  it("admits the attached Electron surface's bounded mirror write via the real attach dispatch", async () => {
    const { applyExternalSharedSettings, flushSharedSettings, useSharedSettings } =
      await loadAttachedElectronStore();

    // No local settings read starts on the attach surface: the owner's
    // values arrive over the remote pull/push sync instead.
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(false);

    // Before any mirror push there is no authority and no preserved read
    // refusal, so a required confirmation fails with the localized
    // availability error instead of claiming a write.
    await expect(flushSharedSettings({ requireSuccess: true })).rejects.toThrow(
      "Settings aren't available yet",
    );

    // A partial mirror push applies without echoing a persist, then grants
    // the bounded write admission.
    applyExternalSharedSettings({ themeMode: "light" });
    expect(useSharedSettings.getState().sharedSettingsHydrated).toBe(true);
    expect(useSharedSettings.getState().themeMode).toBe("light");
    expect(attachSettingsSync.push).not.toHaveBeenCalled();

    useSharedSettings.getState().setThemeMode("dark");
    await vi.waitFor(() => expect(attachSettingsSync.push).toHaveBeenCalledTimes(1));
    // The write went through the attach transport's interception: it is
    // forwarded as the mirror diff push (with the remote bridge client —
    // none paired in this fixture), never to the local host handler.
    expect(attachSettingsSync.push.mock.calls[0]?.[0]).toBeNull();

    await expect(flushSharedSettings({ requireSuccess: true })).resolves.toBeUndefined();
  });
});
