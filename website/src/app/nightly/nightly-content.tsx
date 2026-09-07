"use client";

import { useState } from "react";
import { Download, ArrowLeft, Monitor, Apple, Terminal, Moon, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedPath } from "@/lib/i18n/config";
import { downloadUrlFor, type ReleaseInfo } from "@/lib/releases";

const PLATFORMS = [
  {
    os: "macOS",
    icon: Apple,
    variants: [
      { label: "arm", slug: "mac-arm64", ext: ".dmg" },
      { label: "Intel", slug: "mac-x64", ext: ".dmg" },
    ],
  },
  {
    os: "Windows",
    icon: Monitor,
    variants: [
      { label: "x64", slug: "win-x64", ext: ".exe" },
      { label: "ARM64", slug: "win-arm64", ext: ".exe" },
    ],
  },
  {
    os: "Linux",
    icon: Terminal,
    variants: [{ label: "x64 (AppImage)", slug: "linux-x64", ext: ".AppImage" }],
  },
];

function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (minutes < 1) return formatter.format(0, "minute");
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return formatter.format(-days, "day");
  const months = Math.round(days / 30);
  return formatter.format(-months, "month");
}

function formatBuildTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function NightlyContent({ release }: { release: ReleaseInfo }) {
  const { locale, t } = useI18n();
  const hasBuild = release.version !== null;
  const publishedAt = release.publishedAt ?? null;
  const [relativeTime, setRelativeTime] = useState<string>(() =>
    publishedAt ? formatRelative(publishedAt, locale) : "",
  );
  const [absoluteTime, setAbsoluteTime] = useState<string>(() =>
    publishedAt ? formatBuildTime(publishedAt, locale) : "",
  );
  const [prevTimeFormat, setPrevTimeFormat] = useState({ locale, publishedAt });
  if (prevTimeFormat.locale !== locale || prevTimeFormat.publishedAt !== publishedAt) {
    setPrevTimeFormat({ locale, publishedAt });
    setRelativeTime(publishedAt ? formatRelative(publishedAt, locale) : "");
    setAbsoluteTime(publishedAt ? formatBuildTime(publishedAt, locale) : "");
  }
  const homeHref = localizedPath("/", locale);
  const downloadHref = localizedPath("/download", locale);
  const [warningBefore, warningAfter] = t("nightly.warning").split("{stable}");
  const [noBuildBefore, noBuildAfter] = t("nightly.noBuild").split("{releases}");
  const [footerBefore, footerAfter] = t("nightly.footer").split("{prereleases}");

  return (
    <div lang={locale} className="relative min-h-screen overflow-x-hidden bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,_rgba(251,191,36,0.08)_0%,_transparent_100%)]" />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-5xl mx-auto">
        <Link
          href={homeHref}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{t("nav.backToHome")}</span>
        </Link>
        <Link
          href={downloadHref}
          className="text-sm font-medium text-gray-500 hover:text-white transition-colors"
        >
          {t("nightly.stablePrompt")} →
        </Link>
      </nav>

      {/* Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border border-amber-400/20 bg-amber-400/[0.06] text-amber-300/90">
            <Moon className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">
              {t("nightly.badge")}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {t("nightly.title")}
          </h1>

          {hasBuild ? (
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <code className="text-sm md:text-base text-amber-300/90 font-mono">
                v{release.version}
              </code>
              {relativeTime ? (
                <span className="text-sm text-gray-500">
                  {t("nightly.built", { relativeTime })}
                  {absoluteTime ? <span className="text-gray-700"> · {absoluteTime}</span> : null}
                </span>
              ) : null}
            </div>
          ) : null}

          <p className="text-gray-400 mb-8 text-lg">{t("nightly.subtitle")}</p>

          <div className="mb-12 flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-400/10 bg-amber-400/[0.03]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300/80" />
            <p className="text-sm text-gray-400 leading-relaxed">
              {warningBefore}
              <Link
                href={downloadHref}
                className="text-gray-200 underline underline-offset-4 hover:text-white transition-colors"
              >
                {t("nightly.stableDownload")}
              </Link>
              {warningAfter}
            </p>
          </div>
        </motion.div>

        {hasBuild ? (
          <div className="space-y-10">
            {PLATFORMS.map((platform, i) => (
              <motion.div
                key={platform.os}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * (i + 1) }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <platform.icon className="w-5 h-5 text-gray-400" />
                  <h2 className="text-xl font-semibold">{platform.os}</h2>
                </div>
                <div className="grid gap-3">
                  {platform.variants.map((variant) => (
                    <a
                      key={variant.slug}
                      href={downloadUrlFor(release, variant.slug)}
                      className="group flex items-center justify-between px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-amber-400/[0.04] hover:border-amber-400/20 transition-all duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <Download className="w-4 h-4 text-gray-500 group-hover:text-amber-300/90 transition-colors" />
                        <div>
                          <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                            {platform.os} — {variant.label}
                          </span>
                          <span className="ml-3 text-xs text-gray-600">{variant.ext}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-600 group-hover:text-amber-300/90 transition-colors">
                        {t("nav.download")} →
                      </span>
                    </a>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="px-5 py-8 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center"
          >
            <p className="text-sm text-gray-400">
              {noBuildBefore}
              <a
                href={release.releasesUrl}
                target="_blank"
                rel="noreferrer"
                className="text-gray-200 underline underline-offset-4 hover:text-white transition-colors"
              >
                {t("nightly.releasesPage")}
              </a>
              {noBuildAfter}
            </p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-16 pt-8 border-t border-white/5 text-center"
        >
          <p className="text-sm text-gray-600">
            {footerBefore}
            <a
              href={release.releasesUrl}
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white underline underline-offset-4 transition-colors"
            >
              {t("nightly.githubPrereleases")}
            </a>
            {footerAfter}
          </p>
        </motion.div>
      </main>
    </div>
  );
}
