import {
  installAttachedElectronClientRuntime,
  installBrowserClientRuntime,
  installElectronClientRuntime,
  resolveElectronAttachBootstrap,
  startDesktopLoopbackEventIntake,
} from "./clientRuntime";
import { msg } from "@lingui/core/macro";
import { normalizePairingEndpoint, parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { friendlyError } from "@/shared/messages";
import { initializeAdaptiveLayout } from "./adaptiveLayout";

initializeAdaptiveLayout();

const handledPairingCredentials = new Set<string>();

async function pairBrowserDesktopFromUrl(href: string, cleanCurrentUrl = false): Promise<unknown> {
  const pairing = parsePairingUrlParts(href);
  if (!pairing) return null;
  const pairingKey = `${pairing.host ?? pairing.url.origin}\0${pairing.token}`;
  if (handledPairingCredentials.has(pairingKey)) return null;
  handledPairingCredentials.add(pairingKey);

  try {
    const [{ useRemoteServersStore }, { useAppStore }] = await Promise.all([
      import("./state/remoteServersStore"),
      import("./state/appStore"),
    ]);
    await Promise.all([useRemoteServersStore.persist.rehydrate(), useAppStore.persist.rehydrate()]);
    const record = await useRemoteServersStore.getState().pairServer({
      endpoint: normalizePairingEndpoint(pairing.host ?? pairing.url.toString()),
      token: pairing.token,
    });
    if (cleanCurrentUrl) {
      const nextUrl = new URL(window.location.href);
      nextUrl.pathname = "/";
      nextUrl.search = "";
      nextUrl.hash = "";
      window.history.replaceState(null, "", nextUrl);
    }
    return record;
  } catch (error) {
    handledPairingCredentials.delete(pairingKey);
    throw error;
  }
}

async function showBrowserPairing(href: string, cleanCurrentUrl = false): Promise<void> {
  if (!parsePairingUrlParts(href)) return;
  const [{ toast }, { i18n }] = await Promise.all([import("@heroui/react"), import("./i18n/i18n")]);
  const toastKey = toast.info(i18n._(msg`Connecting…`), { isLoading: true, timeout: 0 });
  try {
    await pairBrowserDesktopFromUrl(href, cleanCurrentUrl);
    toast.close(toastKey);
    toast.success(i18n._(msg`Connected`));
  } catch (error) {
    toast.close(toastKey);
    console.error("[renderer-bootstrap] browser desktop pairing failed:", error);
    toast.danger(friendlyError(error), {
      actionProps: {
        children: i18n._(msg`Retry`),
        onPress: () => void showBrowserPairing(href, cleanCurrentUrl),
      },
      timeout: 0,
    });
  }
}

if (window.poracodeHost) {
  // Malformed attach info (present getter that threw/rejected or returned an
  // invalid payload) throws out of the selection: fail closed with the
  // existing boot-failure path, never the managed runtime. Absence or
  // explicit null selects managed and preserves older preload compatibility.
  let selection: Awaited<ReturnType<typeof resolveElectronAttachBootstrap>>;
  try {
    selection = await resolveElectronAttachBootstrap(window.poracodeHost);
  } catch (error) {
    console.error("[renderer-bootstrap] standalone owner attach failed:", error);
    throw error;
  }
  if (selection.kind === "attached") {
    const standaloneAttach = selection.attach;
    // Electron as a client of the already-running headless owner: boot the
    // existing remote stack (RemoteDesktopClient over the bridge-2 utility
    // process) against the authenticated endpoint, then pair via the existing
    // owner control + OAuth. No local backend fork, lease, or key init comes
    // from this path. Failures here stay local to bootstrap (console) and
    // never start another authority; without attach info the managed path
    // below is unchanged.
    installAttachedElectronClientRuntime(window.poracodeHost, standaloneAttach);
    try {
      const [{ useRemoteServersStore }, { useAppStore }] = await Promise.all([
        import("./state/remoteServersStore"),
        import("./state/appStore"),
      ]);
      await Promise.all([
        useRemoteServersStore.persist.rehydrate(),
        useAppStore.persist.rehydrate(),
      ]);
      await useRemoteServersStore.getState().ensureStandaloneOwner(standaloneAttach);
    } catch (error) {
      console.error("[renderer-bootstrap] standalone owner attach failed:", error);
    }
  } else {
    installElectronClientRuntime(window.poracodeHost);
    // V5 plan 2.5 (loopback unification): the co-located remote server becomes
    // the preferred event leg when it is reachable; the desktop-IPC relay
    // stays the documented fallback. Fire-and-forget and non-fatal by design.
    void startDesktopLoopbackEventIntake();
  }
  const { readBridge } = await import("./bridge");
  window.poracode = readBridge();
} else {
  const { installRemoteBridge } = await import("./browser/remoteBridge");
  installRemoteBridge();
  if (!window.poracode) throw new Error("Browser client bridge failed to initialize.");
  installBrowserClientRuntime(window.poracode);
}

await import("./main");

if (!window.poracodeHost) {
  void showBrowserPairing(window.location.href, true);
  void import("./pwa/registerServiceWorker").then(({ registerCanonicalServiceWorker }) => {
    registerCanonicalServiceWorker();
  });
}
