"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export interface LightboxItem {
  src: string;
  width: number;
  height: number;
  title: string;
}

/** Open the viewer on `src` within `items`. Addressed by src so callers never
 *  compute an index into the set — reordering the page can't mis-target. */
type OpenFn = (items: readonly LightboxItem[], src: string) => void;

const LightboxContext = createContext<OpenFn>(() => {});

export function useLightbox(): OpenFn {
  return useContext(LightboxContext);
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ items: readonly LightboxItem[]; index: number } | null>(
    null,
  );

  // All three callbacks are stable. The context value identity is what every
  // consumer subscribes to, so a fresh arrow here would re-render the whole page
  // on each open, close, and arrow-key step.
  const open = useCallback<OpenFn>((items, src) => {
    const index = items.findIndex((candidate) => candidate.src === src);
    setState({ items, index: Math.max(index, 0) });
  }, []);
  const close = useCallback(() => setState(null), []);
  const step = useCallback((delta: number) => {
    setState((current) =>
      current
        ? {
            ...current,
            index: (current.index + delta + current.items.length) % current.items.length,
          }
        : current,
    );
  }, []);

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {state ? (
        <Overlay items={state.items} index={state.index} onStep={step} onClose={close} />
      ) : null}
    </LightboxContext.Provider>
  );
}

function Overlay({
  items,
  index,
  onStep,
  onClose,
}: {
  items: readonly LightboxItem[];
  index: number;
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const item = items[index];
  const many = items.length > 1;

  // Stepping is a no-op for a single item (modulo 1), so the handler needs no
  // count guard. Deps are stable, so the listener is attached once per open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") onStep(-1);
      else if (event.key === "ArrowRight") onStep(1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, onStep]);

  // The scroll lock belongs to "an overlay is mounted", not to the current
  // index — keeping it in its own effect stops it churning as you page through.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="lightbox-in fixed inset-0 z-[100] flex items-center justify-center bg-night/92 p-4 backdrop-blur-sm sm:p-8"
    >
      {/* Click-anywhere-to-close lives on its own element *behind* the content, so
          the figure needs no event plumbing to avoid closing on its own clicks.
          Mouse-only: Escape and the labelled close button cover keyboard and AT. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-0 cursor-zoom-out"
      />

      <button
        type="button"
        aria-label={t("lightbox.close")}
        onClick={onClose}
        className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-dim transition hover:border-white/20 hover:text-moon sm:right-6 sm:top-6"
      >
        <X className="h-5 w-5" />
      </button>

      {many ? (
        <>
          <button
            type="button"
            aria-label={t("lightbox.previous")}
            onClick={() => onStep(-1)}
            className="absolute left-2 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-night/70 text-dim transition hover:border-white/20 hover:text-moon sm:left-5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={t("lightbox.next")}
            onClick={() => onStep(1)}
            className="absolute right-2 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-night/70 text-dim transition hover:border-white/20 hover:text-moon sm:right-5"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}

      <figure className="relative z-10 flex max-h-full max-w-6xl flex-col items-center gap-4">
        <Image
          src={item.src}
          alt={item.title}
          width={item.width}
          height={item.height}
          // 75 is the largest value `images.qualities` allows in next.config.js;
          // anything else makes the optimizer reject the request outright.
          quality={75}
          // The figure caps at max-w-6xl, so claiming a bare 90vw would pull a
          // 3840px variant on a wide screen for a box that never exceeds 1152px.
          sizes="(max-width: 640px) 92vw, min(90vw, 1152px)"
          className="max-h-[82vh] w-auto rounded-xl border border-white/[0.09] object-contain"
        />
        <figcaption className="flex items-center gap-3 text-center text-sm text-dim">
          <span className="text-moon">{item.title}</span>
          {many ? (
            <span className="font-mono text-[12px] text-dim/70">
              {index + 1} / {items.length}
            </span>
          ) : null}
        </figcaption>
      </figure>
    </div>
  );
}

/**
 * Full-bleed invisible trigger. Sits inside an already-positioned frame so the
 * surrounding capture keeps its own styling, and gives the image real keyboard
 * focus and an accessible name without restructuring the card.
 */
export function LightboxTrigger({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t("lightbox.zoom")}
      onClick={onOpen}
      className="absolute inset-0 z-20 cursor-zoom-in rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    />
  );
}
