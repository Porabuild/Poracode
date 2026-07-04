"use client";

import { Download, ArrowLeft, Monitor, Apple, Terminal, Moon } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
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

export function DownloadContent({ release }: { release: ReleaseInfo }) {
  const versionSuffix = release.version ? ` v${release.version}` : "";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,_rgba(255,255,255,0.05)_0%,_transparent_100%)]" />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-5xl mx-auto">
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to home</span>
        </Link>
        <Link
          href="/nightly"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-amber-300 transition-colors"
        >
          <Moon className="w-3.5 h-3.5 text-amber-300/80" />
          <span>Nightly builds →</span>
        </Link>
      </nav>

      {/* Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Download Poracode{versionSuffix}
          </h1>
          <p className="text-gray-400 mb-12 text-lg">
            Choose the installer for your platform and architecture.
          </p>
        </motion.div>

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
                    className="group flex items-center justify-between px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <Download className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
                      <div>
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                          {platform.os} — {variant.label}
                        </span>
                        <span className="ml-3 text-xs text-gray-600">{variant.ext}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
                      Download →
                    </span>
                  </a>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-16 pt-8 border-t border-white/5 text-center"
        >
          <p className="text-sm text-gray-600">
            All downloads are from the{" "}
            <a
              href={release.releasesUrl}
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white underline underline-offset-4 transition-colors"
            >
              latest GitHub release
            </a>
            .
          </p>
        </motion.div>
      </main>
    </div>
  );
}
