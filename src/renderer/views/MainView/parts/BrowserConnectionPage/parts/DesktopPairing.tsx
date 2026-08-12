import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { WelcomeBackdrop } from "@/renderer/components/common/WelcomeBackdrop";
import type { Pairing } from "../usePairing";
import { InstallRecommendation, PairingErrors, PairingUrlForm } from "./PairingChrome";
import { PairingProgress } from "./PairingProgress";
import appIconUrl from "../../../../../../../build/icon.png";

/**
 * Pairing from a desktop browser. There is no camera to point at the desktop's
 * QR code here, so the pairing URL is the only transport: the field is the
 * primary control and submits on Enter, and no scan affordance is offered.
 *
 * This is the browser client's first launch, so it wears the welcome screen —
 * same backdrop, app icon, and wordmark stage — instead of a phone layout
 * stretched across a desktop window.
 */
export function DesktopPairing({ pairing }: { readonly pairing: Pairing }) {
  const [pairingUrl, setPairingUrl] = useState("");

  return (
    <WelcomeBackdrop className="min-h-full">
      <div className="poracode-welcome-stage flex w-full max-w-[460px] flex-col items-center gap-8 text-center">
        {pairing.busy ? (
          <PairingProgress className="size-24" />
        ) : (
          <div className="relative flex size-24 items-center justify-center">
            <span className="poracode-welcome-icon-glass absolute inset-2 rounded-[1.65rem]" />
            <img
              src={appIconUrl}
              alt=""
              draggable={false}
              className="relative size-20 rounded-[1.55rem]"
            />
          </div>
        )}

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
