import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import jsQR from "jsqr";
import { CameraOff, Loader2, X } from "lucide-react";

/** Why the live scanner can't run; each maps to a distinct help message. */
type ScanError = "insecure" | "denied" | "no-camera" | "error";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<readonly { readonly rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options?: {
  readonly formats?: readonly string[];
}) => BarcodeDetectorLike;

/**
 * Fast path on browsers that ship the Barcode Detection API (Android Chrome,
 * desktop Chromium). Everywhere else (notably iOS Safari) we fall back to
 * decoding frames with jsQR, so the scanner works the same across platforms.
 */
function getBarcodeDetector(): BarcodeDetectorLike | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

const ERROR_COPY: Record<ScanError, { title: MessageDescriptor; hint: MessageDescriptor }> = {
  insecure: {
    title: msg`Scanning needs a secure connection`,
    hint: msg`In-app camera scanning only works over HTTPS. Use your phone's camera app to scan the desktop QR code, or enter the endpoint and token below.`,
  },
  denied: {
    title: msg`Camera access blocked`,
    hint: msg`Allow camera access for this site in your browser settings and try again — or enter the endpoint and token below.`,
  },
  "no-camera": {
    title: msg`No camera found`,
    hint: msg`This device has no usable camera. Enter the endpoint and token below to pair instead.`,
  },
  error: {
    title: msg`Couldn't start the camera`,
    hint: msg`Something went wrong starting the camera. Enter the endpoint and token below to pair instead.`,
  },
};

/**
 * Full-screen camera scanner for pairing QR codes. Emits the raw decoded text
 * via `onResult` (the caller parses it with `parsePairingUrl`); surfaces a
 * helpful fallback message when the camera is unavailable so pairing never
 * dead-ends.
 */
export function QrScanner(props: {
  readonly onResult: (value: string) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLingui();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onResultRef = useRef(props.onResult);
  onResultRef.current = props.onResult;
  const [error, setError] = useState<ScanError | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement("canvas");
    const detector = getBarcodeDetector();

    function finish(value: string) {
      if (stopped || !value) return;
      stopped = true;
      onResultRef.current(value);
    }

    async function scanFrame() {
      const video = videoRef.current;
      if (stopped) return;
      // HAVE_CURRENT_DATA — there is a frame to read.
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          if (detector) {
            const results = await detector.detect(video);
            const hit = results.find((result) => result.rawValue);
            if (hit) return finish(hit.rawValue);
          } else {
            const width = video.videoWidth;
            const height = video.videoHeight;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, width, height);
              const image = ctx.getImageData(0, 0, width, height);
              const code = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
              if (code?.data) return finish(code.data);
            }
          }
        } catch {
          // Transient per-frame decode failure; keep scanning.
        }
      }
      if (!stopped) raf = requestAnimationFrame(scanFrame);
    }

    async function start() {
      if (!window.isSecureContext) {
        setError("insecure");
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("error");
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            stream.getTracks().forEach((track) => track.stop());
            stream = null;
            setError("error");
            setStarting(false);
            return;
          }
        }
        setStarting(false);
        raf = requestAnimationFrame(scanFrame);
      } catch (err) {
        setStarting(false);
        const name = (err as { readonly name?: string }).name;
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "no-camera"
              : "error",
        );
      }
    }
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera lifecycle runs once; onResult is read through a ref
  }, []);

  // Portaled to <body>: mounted from a tab route inside `.m-main`, whose
  // view-transition-name forces a stacking context — rendered inline, the
  // fixed fullscreen overlay would paint under the tab bar regardless of
  // z-index.
  return createPortal(
    <div className="m-scanner" role="dialog" aria-label={t`Scan pairing QR code`}>
      <div className="m-scanner__stage">
        {error ? (
          <div className="m-scanner__error">
            <CameraOff className="size-7" />
            <strong>{t(ERROR_COPY[error].title)}</strong>
            <p>{t(ERROR_COPY[error].hint)}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="m-scanner__video" playsInline muted autoPlay />
            <div className="m-scanner__reticle" />
            <p className="m-scanner__caption">
              {starting ? (
                <>
                  <Loader2 className="size-4 m-spin" />
                  <Trans>Starting camera…</Trans>
                </>
              ) : (
                <Trans>Point at the QR code in Settings → Remote Access</Trans>
              )}
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        className="m-scanner__close"
        aria-label={t`Close scanner`}
        onClick={props.onCancel}
      >
        <X className="size-5" />
      </button>
    </div>,
    document.body,
  );
}
