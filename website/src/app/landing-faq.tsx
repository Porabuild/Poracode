"use client";

import { LANDING_FAQ_ITEMS } from "@/lib/landingFaq";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { DotPeriod } from "@/components/BrandMark";

export function LandingFaq() {
  const { t } = useI18n();

  return (
    <section id="faq" className="relative z-10 border-t border-white/[0.06] px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <p className="mb-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">
            <span className="pora-dot h-1.5 w-1.5" />
            {t("faq.eyebrow")}
          </p>
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-moon md:text-4xl">
            {t("faq.title")}
            <DotPeriod pulse={false} />
          </h2>
        </div>

        <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {LANDING_FAQ_ITEMS.map((item) => (
            <details
              key={item.questionKey}
              className="group px-5 py-4 transition-colors open:bg-white/[0.015]"
            >
              <summary className="cursor-pointer list-none text-base font-semibold text-moon marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {t(item.questionKey)}
                  <span className="text-xl leading-none text-accent transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-dim">{t(item.answerKey)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
