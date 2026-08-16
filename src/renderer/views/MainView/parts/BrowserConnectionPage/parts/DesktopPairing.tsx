import { useEffect, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { WelcomeAppIcon } from "@/renderer/components/common/WelcomeAppIcon";
import { WelcomeBackdrop } from "@/renderer/components/common/WelcomeBackdrop";
import type { Pairing } from "../usePairing";
import { InstallRecommendation, PairingErrors, PairingUrlForm } from "./PairingChrome";
import { PairingProgress } from "./PairingProgress";

/**
 * Pairing from a desktop browser. Pasting the link is the only route here: the
 * desktop showing the code is usually the same screen this page is open on, so
 * pointing a webcam at it is not a real option, and copying the link is a
 * keystroke away. The field is therefore the primary control and is shown
 * outright rather than tucked behind a disclosure — with nothing to demote it in
 * favour of, hiding it would only add a click.
 *
 * Same hero as every other first-launch surface — backdrop, app icon, wordmark —
 * so the layout reads as one product across web, iOS, and Android.
 */
export function DesktopPairing({ pairing }: { readonly pairing: Pairing }) {
  const [pairingUrl, setPairingUrl] = useState("");
  // The icon's landing animation belongs to the first paint of this screen. Once
  // a handshake takes over the icon slot, the intro is spent: coming back to the
  // form after a failed attempt should show the icon already landed, not replay
  // a 2s reveal that starts by hiding it. Held in state (not a ref) so ordinary
  // re-renders — typing in the URL field — can't truncate the intro mid-flight.
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    if (pairing.busy) setIntro(false);
  }, [pairing.busy]);

  return (
    <WelcomeBackdrop className="min-h-full">
      <div className="poracode-welcome-stage flex w-full max-w-[460px] flex-col items-center gap-8 text-center">
        {pairing.busy ? <PairingProgress className="size-24" /> : <WelcomeAppIcon intro={intro} />}

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[clamp(2.25rem,4vw,3rem)] font-semibold leading-[1.15] tracking-tight">
            <BrandWordmark />
          </h1>
          <p className="max-w-sm text-sm leading-6 text-muted">
            <Trans>
              Pair with Poracode on your desktop to sync threads, projects, and settings.
            </Trans>
          </p>
        </div>

        <div className="flex w-full flex-col">
          <PairingUrlForm
            pairing={pairing}
            value={pairingUrl}
            onValueChange={setPairingUrl}
            layout="inline"
          />

          <PairingErrors pairing={pairing} />

          <InstallRecommendation
            busy={pairing.busy}
            variant="secondary"
            compact
            label={<Trans>Install app</Trans>}
          />
        </div>

        <p className="max-w-sm text-xs leading-5 text-muted">
          <Trans>
            Open Settings → Remote Access in Poracode on your desktop, then copy the pairing URL
            shown there.
          </Trans>
        </p>
      </div>
    </WelcomeBackdrop>
  );
}
