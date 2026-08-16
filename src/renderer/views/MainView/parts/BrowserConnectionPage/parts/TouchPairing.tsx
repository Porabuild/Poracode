import { useEffect, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { WelcomeAppIcon } from "@/renderer/components/common/WelcomeAppIcon";
import { WelcomeBackdrop } from "@/renderer/components/common/WelcomeBackdrop";
import type { Pairing } from "../usePairing";
import {
  InstallRecommendation,
  OtherWaysDrawer,
  PairingErrors,
  PairingScannerOverlay,
  ScanCard,
  ScanFileInput,
} from "./PairingChrome";
import { PairingProgress } from "./PairingProgress";

/**
 * Pairing on a device with a camera. Scanning the desktop's code is the one
 * visible route; pasting a link lives in a bottom drawer, because the endpoint
 * and token a link carries are exactly what the code encodes, and typing either
 * on a phone keyboard is busywork almost nobody should have to do.
 *
 * The QR action remains primary even when camera capability cannot be established
 * up front. The scanner handles permission and secure-context failures after the
 * user taps it, with a manual fallback; the drawer never obscures first launch.
 *
 * Wears the shared first-launch dressing (same backdrop, app icon, wordmark) as
 * the welcome and desktop-pairing surfaces, so a phone's first screen reads as the
 * same product as everyone else's.
 */
export function TouchPairing({ pairing }: { readonly pairing: Pairing }) {
  const [pairingUrl, setPairingUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [otherWaysOpen, setOtherWaysOpen] = useState(false);
  // The icon's landing animation belongs to the first paint of this screen. Held
  // in state, not a ref, so ordinary re-renders can't truncate it mid-flight.
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    if (pairing.busy) setIntro(false);
  }, [pairing.busy]);

  return (
    <WelcomeBackdrop className="min-h-full">
      <div className="poracode-touch-pairing flex min-h-[calc(100svh-6rem)] w-full max-w-sm flex-col items-center pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
        <div className="poracode-touch-pairing-hero flex w-full flex-1 translate-y-[4svh] flex-col items-center justify-center">
          {pairing.busy ? (
            <PairingProgress className="size-24" />
          ) : (
            <WelcomeAppIcon intro={intro} />
          )}

          <div className="mt-6 flex flex-col items-center gap-2">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
              <BrandWordmark />
            </h1>
            <p className="text-sm leading-6 text-muted">
              <Trans>Scan the pairing code shown in Remote Access on your desktop.</Trans>
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col">
          <ScanCard pairing={pairing} />

          {!otherWaysOpen ? <PairingErrors pairing={pairing} /> : null}

          <OtherWaysDrawer
            open={otherWaysOpen}
            onOpenChange={setOtherWaysOpen}
            pairing={pairing}
            pairingUrl={pairingUrl}
            onPairingUrlChange={setPairingUrl}
            endpoint={endpoint}
            onEndpointChange={setEndpoint}
            token={token}
            onTokenChange={setToken}
            className="mt-3"
          />

          <InstallRecommendation busy={pairing.busy} label={<Trans>Add to Home Screen</Trans>} />
        </div>

        <ScanFileInput pairing={pairing} />
      </div>

      {/* Falling back from the scanner reveals the paste route it was hiding. */}
      <PairingScannerOverlay pairing={pairing} onEnterManually={() => setOtherWaysOpen(true)} />
    </WelcomeBackdrop>
  );
}
