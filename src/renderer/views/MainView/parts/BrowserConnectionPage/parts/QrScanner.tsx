import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@heroui/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CameraOff, Image as ImageIcon, Link2, Loader2, X } from "lucide-react";
import { createQrDecoder } from "@/renderer/utils/qrDecode";

/** Why the live scanner can't run; each maps to distinct, actionable help. */
type ScanError = "insecure" | "denied" | "no-camera" | "error";

/**
 * Longest edge handed to the decoder. A 1080p frame costs ~4x a 540p one to
 * rasterize and scan, and the extra pixels buy nothing: a pairing QR fills a
 * good part of the reticle by the time it is in focus.
 */
const MAX_DECODE_EDGE = 640;

/**
 * Decode cadence. Scanning every animation frame pins a phone's CPU and warms
 * it enough to throttle; ten looks per second still feels instant to someone
 * lining up a code.
 */
const DECODE_INTERVAL_MS = 100;

/** HTMLMediaElement.HAVE_CURRENT_DATA — there is a frame worth reading. */
const HAVE_CURRENT_DATA = 2;

const ERROR_COPY: Record<ScanError, { title: MessageDescriptor; hint: MessageDescriptor }> = {
  insecure: {
    title: msg`Scanning needs a secure connection`,
    hint: msg`In-app camera scanning only works over HTTPS or on localhost. Scan the desktop code with your phone's camera app instead, or paste the pairing link.`,
  },
  denied: {
    title: msg`Camera access blocked`,
    hint: msg`Allow camera access for this site in your browser settings and try again, or paste the pairing link instead.`,
  },
  "no-camera": {
    title: msg`No camera found`,
    hint: msg`This device has no usable camera. Paste the pairing link or pick a photo of the code instead.`,
  },
  error: {
    title: msg`Couldn't start the camera`,
    hint: msg`Something went wrong starting the camera. Paste the pairing link or pick a photo of the code instead.`,
  },
};

/** Caps the longest edge while preserving the frame's aspect ratio. */
function decodeSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function scanErrorFor(error: unknown): ScanError {
  const name = (error as { readonly name?: string }).name;
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  return "error";
}

/**
 * Full-screen live camera scanner for pairing codes. Emits the raw decoded text
 * through `onResult`; the caller decides whether that text is a pairing link and
 * says so by returning true (accepted) or false (not a pairing code).
 *
 * Returning false keeps the camera running so the caller can correct the user —
 * an unrelated QR code drifting through frame should not dump them back to the
 * start. Returning true stops the scan loop immediately: the pairing token is
 * single-use, and the loop would otherwise keep decoding the same code for the
 * frame or two before React unmounts us, spending the token more than once.
 *
 * Every failure path offers both remaining routes (pick a photo, paste a link)
 * so an unavailable camera never leaves the user stuck on this screen.
 */
export function QrScanner(props: {
  readonly onResult: (value: string) => boolean;
  readonly onCancel: () => void;
  readonly onPickPhoto: () => void;
  readonly onEnterManually: () => void;
  /** Shown under the reticle when the caller rejected the last decoded code. */
  readonly rejection?: string | null;
}) {
  const { t } = useLingui();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Read through a ref so the camera effect never restarts on a parent re-render;
  // tearing down a live MediaStream mid-scan makes the preview flicker.
  const onResultRef = useRef(props.onResult);
  onResultRef.current = props.onResult;
  const [error, setError] = useState<ScanError | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastDecodeAt = 0;
    const decoder = createQrDecoder();

    async function scanFrame(now: number) {
      if (stopped) return;
      const video = videoRef.current;
      if (
        video &&
        video.readyState >= HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        now - lastDecodeAt >= DECODE_INTERVAL_MS
      ) {
        lastDecodeAt = now;
        const size = decodeSize(video.videoWidth, video.videoHeight);
        try {
          const value = await decoder.decode(video, size.width, size.height);
          // An accepted code ends the session here rather than waiting for
          // unmount, so the single-use token is never handed over twice.
          if (value && onResultRef.current(value)) {
            stopped = true;
            return;
          }
        } catch {
          // Transient per-frame decode failure; the next frame gets a fresh look.
        }
      }
      if (!stopped) frame = requestAnimationFrame((next) => void scanFrame(next));
    }

    async function start() {
      // getUserMedia is gated on a secure context. Over plain http on a LAN IP —
      // how a desktop's remote server is usually reached — it never resolves, so
      // say why instead of spinning forever.
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
          await video.play();
        }
        setStarting(false);
        frame = requestAnimationFrame((next) => void scanFrame(next));
      } catch (caught) {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        setStarting(false);
        setError(scanErrorFor(caught));
      }
    }
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera lifecycle runs once; callbacks are read through a ref
  }, []);

  // Portaled to <body> so the fixed overlay escapes any transformed ancestor on
  // the pairing screen, which would otherwise become its containing block and
  // clip it to the card.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t`Scan pairing QR code`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-white/10 text-white">
            <CameraOff className="size-7" strokeWidth={1.5} />
          </span>
          <strong className="text-lg font-semibold text-white">{t(ERROR_COPY[error].title)}</strong>
          <p className="max-w-xs text-sm leading-6 text-white/70">{t(ERROR_COPY[error].hint)}</p>
          <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
            <Button
              fullWidth
              variant="tertiary"
              className="h-12 touch-manipulation justify-center gap-2"
              onPress={props.onEnterManually}
            >
              <Link2 className="size-4" />
              <Trans>Paste pairing link</Trans>
            </Button>
            <Button
              fullWidth
              variant="ghost"
              className="h-12 touch-manipulation justify-center gap-2 text-white/70"
              onPress={props.onPickPhoto}
            >
              <ImageIcon className="size-4" />
              <Trans>Choose a photo</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            playsInline
            muted
            autoPlay
          />

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {/* The window dims everything outside itself with one huge spread
                shadow, so the clear area can never drift out of register with
                the brackets drawn on its edges. */}
            <div className="poracode-scan-window relative">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 size-10 rounded-tl-[1.5rem] border-l-[3px] border-t-[3px] border-accent"
              />
              <span
                aria-hidden="true"
                className="absolute right-0 top-0 size-10 rounded-tr-[1.5rem] border-r-[3px] border-t-[3px] border-accent"
              />
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 size-10 rounded-bl-[1.5rem] border-b-[3px] border-l-[3px] border-accent"
              />
              <span
                aria-hidden="true"
                className="absolute bottom-0 right-0 size-10 rounded-br-[1.5rem] border-b-[3px] border-r-[3px] border-accent"
              />
              {starting ? null : <span className="poracode-scan-sweep" aria-hidden="true" />}
            </div>

            <p className="mt-8 flex items-center gap-2 px-8 text-center text-sm leading-6 text-white/80">
              {starting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <Trans>Starting camera…</Trans>
                </>
              ) : (
                <Trans>Point at the QR code in Settings → Remote Access</Trans>
              )}
            </p>

            {props.rejection ? (
              <p
                role="alert"
                className="mt-3 max-w-xs px-8 text-center text-sm leading-6 text-danger"
              >
                {props.rejection}
              </p>
            ) : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Button
              variant="ghost"
              className="h-11 touch-manipulation gap-2 text-white/70"
              onPress={props.onPickPhoto}
            >
              <ImageIcon className="size-4" />
              <Trans>Choose a photo</Trans>
            </Button>
            <Button
              variant="ghost"
              className="h-11 touch-manipulation gap-2 text-white/70"
              onPress={props.onEnterManually}
            >
              <Link2 className="size-4" />
              <Trans>Paste link</Trans>
            </Button>
          </div>
        </>
      )}

      <Button
        isIconOnly
        variant="ghost"
        aria-label={t`Close scanner`}
        className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] size-11 text-white/80"
        onPress={props.onCancel}
      >
        <X className="size-5" />
      </Button>
    </div>,
    document.body,
  );
}
