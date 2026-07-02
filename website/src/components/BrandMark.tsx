/**
 * Poracode brand marks for the marketing site.
 *
 * - `PoraGlyph`   — the bare "P + Pora dot" letterform (inherits currentColor;
 *                    the dot stays indigo). Master: branding/assets/poracode-glyph.svg.
 * - `PoraIconTile`— the glyph on the dark brand tile (the app-icon lockup).
 * - `BrandWordmark` — the `Pora.code` logotype. The dot is a TRUE round circle
 *                    drawn as its own element, never the font period (Geist
 *                    renders periods square — see branding/BRAND.md §5).
 */

export function PoraGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M352,300 H556 A152,152 0 0 1 556,604 H472 V730 H352 Z
           M472,392 H548 A60,60 0 0 1 548,512 H472 Z"
      />
      <circle cx="636" cy="694" r="46" fill="#8B7BFF" />
    </svg>
  );
}

export function PoraIconTile({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[26%] bg-tile ring-1 ring-white/10 ${
        className ?? ""
      }`}
    >
      <PoraGlyph className="h-[62%] w-[62%] text-moon [filter:drop-shadow(0_0_8px_rgba(139,123,255,0.35))]" />
    </span>
  );
}

export function BrandWordmark({
  className,
  pulse = false,
}: {
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className={`inline-flex items-baseline ${className ?? ""}`} aria-label="Poracode">
      <span className="font-bold tracking-[-0.02em] text-moon" aria-hidden="true">
        Pora
      </span>
      <svg
        viewBox="0 0 24 100"
        aria-hidden="true"
        className={`mx-[0.05em] inline-block h-[1em] w-[0.26em] overflow-visible align-baseline [filter:drop-shadow(0_0_6px_rgba(139,123,255,0.6))] ${
          pulse ? "pora-pulse" : ""
        }`}
      >
        <circle cx="12" cy="92" r="9.5" fill="#8B7BFF" />
      </svg>
      <span className="font-semibold tracking-[-0.02em] text-moon" aria-hidden="true">
        code
      </span>
    </span>
  );
}

/** Icon tile + wordmark, the standard horizontal lockup. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <PoraIconTile className="h-8 w-8" />
      <BrandWordmark className="text-xl" />
    </span>
  );
}

/**
 * The lowercase Geist-Mono technical lockup `pora.code` — the page's recurring
 * signature. The dot is the true-round indigo Pora dot (never the mono period,
 * which Geist renders square).
 */
export function MonoLockup({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-mono ${className ?? ""}`}
      aria-label="pora.code"
    >
      <span aria-hidden="true" className="text-dim">
        pora
      </span>
      <svg
        viewBox="0 0 24 100"
        aria-hidden="true"
        className="mx-[0.05em] inline-block h-[1em] w-[0.26em] overflow-visible align-baseline [filter:drop-shadow(0_0_5px_rgba(139,123,255,0.6))]"
      >
        <circle cx="12" cy="92" r="9.5" fill="#8B7BFF" />
      </svg>
      <span aria-hidden="true" className="text-dim">
        code
      </span>
    </span>
  );
}

/**
 * The headline full-stop rendered as the live indigo Pora dot — the page's
 * signature gesture ("it's time."). Replaces a text gradient as the only accent.
 */
export function DotPeriod({ pulse = true }: { pulse?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 100"
      aria-hidden="true"
      className={`ml-[0.04em] inline-block h-[0.7em] w-[0.34em] overflow-visible align-baseline [filter:drop-shadow(0_0_8px_rgba(139,123,255,0.55))] ${
        pulse ? "pora-pulse" : ""
      }`}
    >
      <circle cx="12" cy="88" r="11" fill="#8B7BFF" />
    </svg>
  );
}
