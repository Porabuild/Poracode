"use client";

import { LANDING_FAQ_ITEMS } from "@/lib/landingFaq";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function LandingFaq() {
  const { t } = useI18n();

  return (
    <section id="faq" className="relative z-10 border-t border-white/5 bg-black px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
            {t("faq.eyebrow")}
          </p>
          <h2 className="text-3xl font-bold md:text-4xl">{t("faq.title")}</h2>
        </div>

        <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.02]">
          {LANDING_FAQ_ITEMS.map((item) => (
            <details key={item.questionKey} className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-base font-semibold text-white marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {t(item.questionKey)}
                  <span className="text-xl leading-none text-gray-500 transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
                {t(item.answerKey)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
