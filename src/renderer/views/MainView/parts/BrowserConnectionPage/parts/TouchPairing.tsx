import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, Link2, QrCode } from "lucide-react";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import type { Pairing } from "../usePairing";
import {
  DesktopHint,
  InstallRecommendation,
  PairingErrors,
  PairingUrlForm,
  ScanFileInput,
} from "./PairingChrome";
import { PairingProgress } from "./PairingProgress";

/** Camera-viewfinder corner brackets framing the QR glyph. */
function ScanFrame() {
  const corner = "absolute size-9 border-accent/60 transition-colors group-active:border-accent";
  return (
    <span aria-hidden="true" className="relative flex size-40 items-center justify-center">
      <span className={`${corner} left-0 top-0 rounded-tl-xl border-l-2 border-t-2`} />
      <span className={`${corner} right-0 top-0 rounded-tr-xl border-r-2 border-t-2`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-2 border-l-2`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-xl border-b-2 border-r-2`} />
      <QrCode className="size-20 text-accent" strokeWidth={1.25} />
    </span>
  );
}

/**
 * Pairing on a device with a camera. Scanning is the single primary action —
 * the viewfinder itself is the target, with no button chrome around it — and
 * typing a URL on a phone keyboard is the fallback, on its own step so the
 * landing screen keeps one obvious next tap.
 */
export function TouchPairing({ pairing }: { readonly pairing: Pairing }) {
  const { t } = useLingui();
  const [step, setStep] = useState<"scan" | "manual">("scan");
  const [pairingUrl, setPairingUrl] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex h-11 items-center">
        {step === "manual" ? (
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={t`Back`}
            className="-ml-2 size-11 text-muted"
            onPress={() => {
              setStep("scan");
              pairing.setValidationError(null);
            }}
          >
            <ArrowLeft className="size-5" />
          </Button>
        ) : null}
      </div>

      {step === "scan" ? (
        <>
          <div className="flex flex-col items-center text-center">
            <BrandWordmark className="text-xl text-foreground" />
            <h1 className="mt-6 text-[26px] font-bold leading-tight tracking-tight text-foreground">
              <Trans>Connect to Your Desktop</Trans>
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              <Trans>
                Pair with Poracode on your desktop to sync threads, projects, and settings.
              </Trans>
            </p>
          </div>

          {/* The viewfinder itself is the scan action — no button chrome. */}
          <button
            type="button"
            aria-label={t`Scan QR code`}
            disabled={pairing.busy}
            onClick={() => pairing.scanInputRef.current?.click()}
            className="group mt-10 flex w-full touch-manipulation flex-col items-center gap-5 transition-transform active:scale-[0.98] disabled:opacity-70"
          >
            {pairing.busy ? <PairingProgress className="size-40" /> : <ScanFrame />}
            <span className="flex flex-col gap-1 text-center">
              <span className="text-base font-semibold text-foreground">
                {pairing.busy ? <Trans>Pairing…</Trans> : <Trans>Scan QR code</Trans>}
              </span>
              <span className="text-xs leading-5 text-muted">
                <Trans>Scan the pairing code shown on your desktop</Trans>
              </span>
            </span>
          </button>

          <PairingErrors pairing={pairing} />

          <Button
            fullWidth
            variant="ghost"
            className="mt-10 h-12 touch-manipulation justify-center gap-2 text-muted"
            isDisabled={pairing.busy}
            onPress={() => setStep("manual")}
          >
            <Link2 className="size-4" />
            <Trans>Manual URL</Trans>
          </Button>

          <InstallRecommendation busy={pairing.busy} label={<Trans>Add to Home Screen</Trans>} />

          <DesktopHint />
        </>
      ) : (
        <>
          <div className="mt-6 flex flex-col items-center text-center">
            <Link2 className="size-7 text-accent" strokeWidth={1.75} />
            <h1 className="mt-4 text-[22px] font-bold leading-tight tracking-tight text-foreground">
              <Trans>Manual URL</Trans>
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              <Trans>Paste the pairing URL from your desktop</Trans>
            </p>
          </div>

          <PairingUrlForm
            pairing={pairing}
            value={pairingUrl}
            onValueChange={setPairingUrl}
            className="mt-8"
          />

          <PairingErrors pairing={pairing} />

          <DesktopHint />
        </>
      )}

      <ScanFileInput pairing={pairing} />
    </div>
  );
}
