import { useEffect, useState } from "react";
import { CHANGELOG, releaseSlug } from "@/lib/changelog";

/**
 * Which release the reader is currently on, so the side nav can highlight it.
 * Scrolling is left to native fragment navigation: the release sections carry
 * `id` + `scroll-mt-24`, so anchors, deep links, and back/forward all land in
 * the right place without JS.
 */

/** Release fragments, newest first — the order the sections render in. */
const SLUGS = CHANGELOG.map((release) => releaseSlug(release.version));

/**
 * A heading at or above this viewport offset counts as the release being read.
 * Slightly below the sections' `scroll-mt-24` (96px) so a release scrolled to
 * its fragment wins over the one whose bottom edge ends on that same line.
 */
const READING_LINE = 104;

export function useActiveRelease(): string {
  const [activeSlug, setActiveSlug] = useState(SLUGS[0] ?? "");

  useEffect(() => {
    const resolveActive = () => {
      // At max scroll no further heading can reach the reading line, so the
      // last release wins outright.
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActiveSlug(SLUGS[SLUGS.length - 1] ?? "");
        return;
      }
      // Otherwise it's the last release whose heading has passed the line.
      let current = SLUGS[0] ?? "";
      for (const slug of SLUGS) {
        const top = document.getElementById(slug)?.getBoundingClientRect().top;
        if (top !== undefined && top <= READING_LINE) current = slug;
      }
      setActiveSlug(current);
    };

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        resolveActive();
      });
    };

    // Runs once up front to catch the position a deep link already scrolled to.
    resolveActive();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return activeSlug;
}
