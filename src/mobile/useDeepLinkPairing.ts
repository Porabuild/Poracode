import { useEffect } from "react";
import { App } from "@capacitor/app";
import { useNavigate } from "@tanstack/react-router";
import { parsePairingLaunch, parsePairingUrl, setPairingLaunch } from "./pairing";

/**
 * Universal Links: a pairing link (`https://poracode.com/pair?host=…#token=…`)
 * opens the installed app through the associated-domains entitlement instead of
 * the hosted PWA. Capacitor's App plugin delivers the tapped URL — on a cold
 * start via `getLaunchUrl()`, and while the app is already running via the
 * `appUrlOpen` event.
 *
 * Pairing is NEVER completed here: a tapped link carries an attacker-chosen
 * `host`, so binding to it silently would let one tap pair the device to a
 * malicious endpoint. Instead the offer is routed to the /desktops screen with
 * the endpoint + token prefilled, where the user must confirm (tap "Pair",
 * seeing the target host). This mirrors the PWA boot path, whose launch params
 * `capturePairingLaunch()` reads from `window.location`.
 */
export function useDeepLinkPairing(): void {
  const navigate = useNavigate();
  useEffect(() => {
    let disposed = false;

    // A launch captured at boot (PWA `?host=…#token=…`) — surface the pending
    // offer for confirmation on the connections screen.
    if (parsePairingLaunch().credential) {
      void navigate({ to: "/desktops" });
    }

    function offerFromUrl(url: string | null | undefined): void {
      if (!url) return;
      const launch = parsePairingUrl(url);
      if (!launch?.credential || !launch.endpoint) return;
      setPairingLaunch(launch);
      if (!disposed) void navigate({ to: "/desktops" });
    }

    // Cold start: the link that launched the app (if any).
    void App.getLaunchUrl().then((result) => offerFromUrl(result?.url));
    // Warm start: a link tapped while the app is already foregrounded.
    const listener = App.addListener("appUrlOpen", (event) => offerFromUrl(event.url));

    return () => {
      disposed = true;
      void listener.then((handle) => handle.remove());
    };
  }, [navigate]);
}
