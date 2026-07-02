/**
 * The Pora·code brand wordmark — "Pora" + the indigo baseline dot + "code".
 *
 * The dot is a real round SVG circle, not a typed period: Geist (like most
 * geometric sans) renders the "." glyph as a square. It's tuned to sit on the
 * baseline and inherits the theme accent, mirroring
 * `branding/brand-showcase.html`. Reads as "Poracode" to assistive tech.
 */
export function BrandWordmark({ className }: { className?: string | undefined }) {
  return (
    <span className={className} aria-label="Poracode">
      <span className="font-bold" aria-hidden="true">
        Pora
      </span>
      <svg
        viewBox="0 0 24 100"
        aria-hidden="true"
        className="ml-[0.1em] mr-[0.03em] inline-block h-[1em] w-[0.24em] overflow-visible align-baseline [fill:var(--accent)]"
      >
        <circle cx="12" cy="96" r="9" />
      </svg>
      <span className="font-semibold" aria-hidden="true">
        code
      </span>
    </span>
  );
}
