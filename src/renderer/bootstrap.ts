import { installBrowserClientRuntime, installElectronClientRuntime } from "./clientRuntime";
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
  installElectronClientRuntime(window.poracodeHost);
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
