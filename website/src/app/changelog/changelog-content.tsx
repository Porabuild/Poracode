"use client";

import { ArrowLeft, ArrowUp, Download, Plus, Wrench } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  CHANGELOG,
  formatReleaseDate,
  type ChangelogChangeKind,
  type ChangelogRelease,
} from "@/lib/changelog";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { LanguageSelector } from "@/components/LanguageSelector";

const RELEASES_URL = "https://github.com/SDSLeon/lightcode/releases";

const KIND_ORDER: ChangelogChangeKind[] = ["added", "improved", "fixed"];

const KIND_META: Record<
  ChangelogChangeKind,
  { labelKey: MessageKey; icon: typeof Plus; className: string }
> = {
  added: { labelKey: "changelog.kind.new", icon: Plus, className: "text-emerald-400" },
  improved: { labelKey: "changelog.kind.improved", icon: ArrowUp, className: "text-sky-400" },
  fixed: { labelKey: "changelog.kind.fixed", icon: Wrench, className: "text-gray-400" },
};

function ReleaseSection({ release, index }: { release: ChangelogRelease; index: number }) {
  const { t } = useI18n();
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: release.changes.filter((change) => change.kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 4) * 0.08 }}
      className="relative border-l border-white/10 pl-6 pb-12 last:pb-0"
    >
      <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-white/30 ring-4 ring-black" />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold text-white">{release.title}</h2>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-gray-300">
          v{release.version}
        </span>
        <span className="text-sm text-gray-500">{formatReleaseDate(release.date)}</span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-gray-400">{release.summary}</p>

      <div className="mt-5 space-y-5">
        {groups.map((group) => {
          const meta = KIND_META[group.kind];
          const Icon = meta.icon;
          return (
            <div key={group.kind}>
              <div className="mb-2 flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${meta.className}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {t(meta.labelKey)}
                </span>
              </div>
              <ul className="space-y-2">
                {group.items.map((change, i) => (
                  <li
                    key={i}
                    className="relative pl-4 text-[15px] leading-relaxed text-gray-300 before:absolute before:left-0 before:top-2.5 before:size-1 before:rounded-full before:bg-gray-600"
                  >
                    {change.text}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

export function ChangelogContent() {
  const { t } = useI18n();
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,_rgba(255,255,255,0.05)_0%,_transparent_100%)]" />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between gap-4 px-8 py-6 max-w-5xl mx-auto">
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{t("nav.backToHome")}</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/download"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t("nav.download")} →</span>
          </Link>
          <LanguageSelector />
        </div>
      </nav>

      {/* Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {t("nav.changelog")}
          </h1>
          <p className="text-gray-400 mb-12 text-lg">{t("changelog.subtitle")}</p>
        </motion.div>

        <div>
          {CHANGELOG.map((release, index) => (
            <ReleaseSection key={release.version} release={release} index={index} />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-8 pt-8 border-t border-white/5 text-center"
        >
          <p className="text-sm text-gray-600">{t("changelog.footer.text")}</p>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-gray-400 hover:text-white underline underline-offset-4 transition-colors"
          >
            {t("changelog.footer.link")} →
          </a>
        </motion.div>
      </main>
    </div>
  );
}
