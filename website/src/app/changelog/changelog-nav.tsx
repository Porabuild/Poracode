"use client";

import { CHANGELOG, formatReleaseDateShort, releaseSlug } from "@/lib/changelog";
import { useI18n } from "@/lib/i18n/I18nProvider";

/** Compact sticky release index for the changelog. */
export function ChangelogNav({ activeSlug }: { activeSlug: string }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("changelog.nav.label")}
      className="hidden lg:sticky lg:top-12 lg:block lg:self-start"
    >
      <p className="mb-3 pl-3 text-[11px] font-semibold uppercase tracking-wider text-gray-600">
        {t("changelog.nav.title")}
      </p>
      <ul className="max-h-[calc(100vh-9rem)] overflow-y-auto border-l border-white/10">
        {CHANGELOG.map((release) => {
          const slug = releaseSlug(release.version);
          const isActive = slug === activeSlug;
          return (
            <li key={release.version}>
              <a
                href={`#${slug}`}
                aria-current={isActive ? "true" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-3 transition-colors ${
                  isActive ? "border-white/70" : "border-transparent hover:border-white/25"
                }`}
              >
                <span
                  className={`block text-[13px] font-medium transition-colors ${
                    isActive ? "text-white" : "text-gray-400"
                  }`}
                >
                  v{release.version}
                </span>
                <span className="block text-[11px] text-gray-600">
                  {formatReleaseDateShort(release.date)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
