import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight, Download, GitBranch, Globe, Mail } from "lucide-react";
import Link from "next/link";

import contact from "../../../../../branding/contact.json";
import { BrandLockup, PoraIconTile } from "@/components/BrandMark";
import {
  createAboutJsonLd,
  createPageMetadata,
  GITHUB_URL,
  SITE_DESCRIPTION,
  stringifyJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About Poracode — Open-source AI coding agent desktop app",
  description:
    "Learn what Poracode is: an open-source desktop workspace for Claude Code, Codex, Gemini, Cursor, OpenCode, and ACP coding agents.",
  path: "/about",
});

const OFFICIAL_LINKS = [
  {
    label: "Official website",
    value: "poracode.com",
    href: "https://poracode.com",
    icon: Globe,
  },
  {
    label: "Source repository",
    value: "SDSLeon/lightcode",
    href: GITHUB_URL,
    icon: GitBranch,
  },
  {
    label: "Downloads",
    value: "macOS, Windows, and Linux",
    href: "/download",
    icon: Download,
  },
  {
    label: "Support",
    value: contact.supportEmail,
    href: `mailto:${contact.supportEmail}`,
    icon: Mail,
  },
] as const;

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-night text-moon">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(createAboutJsonLd()) }}
      />

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_0%,_rgba(139,123,255,0.14)_0%,_transparent_70%)]" />
      <div className="brand-grid pointer-events-none fixed inset-x-0 top-0 h-[900px] opacity-60" />

      <nav className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 text-dim transition-colors hover:text-moon"
        >
          <ArrowLeft className="size-4" />
          <span className="text-sm font-medium">Back to home</span>
        </Link>
        <Link
          href="/download"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-moon px-4 text-sm font-semibold text-night transition hover:brightness-95"
        >
          <Download className="size-4" />
          Download
        </Link>
      </nav>

      <main className="relative z-10 mx-auto max-w-4xl px-5 pb-24 pt-12 sm:px-8 md:pt-20">
        <header className="border-b border-white/[0.08] pb-14">
          <PoraIconTile className="mb-8 h-14 w-14" />
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Official project profile
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-[-0.035em] sm:text-5xl md:text-6xl">
            About Poracode
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-9 text-dim">{SITE_DESCRIPTION}</p>
        </header>

        <div className="grid gap-14 py-14 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-12 text-[16px] leading-8 text-dim">
            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] text-moon">
                What Poracode is
              </h2>
              <p>
                Poracode is an open-source developer tool for working with AI coding agents from a
                single desktop workspace. It brings terminal-native agents and structured chat
                workflows together with the files, Git changes, browser previews, worktrees, and
                pull requests involved in a real coding session.
              </p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] text-moon">
                Agent choice without lock-in
              </h2>
              <p>
                The app supports Claude Code, OpenAI Codex, Gemini, Cursor, OpenCode, and agents
                available through the Agent Client Protocol registry. Developers can keep different
                agents side by side and use the one that fits each task without moving their whole
                workflow between separate applications.
              </p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] text-moon">
                Open source and cross-platform
              </h2>
              <p>
                Poracode is developed in public and distributed under the Apache License 2.0. The
                desktop app is available for macOS, Windows, and Linux, with a hosted companion at
                app.poracode.com for connecting to a Poracode desktop that you control.
              </p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-[-0.02em] text-moon">
                The official identity
              </h2>
              <p>
                Poracode, Pora.code, and poracode.com refer to this AI coding agent software
                project. The canonical website is poracode.com, and the canonical source repository
                is SDSLeon/lightcode on GitHub.
              </p>
            </section>
          </div>

          <aside aria-label="Official Poracode links" className="md:pt-1">
            <div className="sticky top-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-tile/80">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <BrandLockup />
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {OFFICIAL_LINKS.map(({ label, value, href, icon: Icon }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-white/[0.035]"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-moon">{label}</span>
                        <span className="mt-0.5 block break-words font-mono text-[12px] leading-5 text-dim">
                          {value}
                        </span>
                      </span>
                      <ArrowUpRight className="ml-auto mt-0.5 size-4 shrink-0 text-dim transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.08] pt-8 font-mono text-[13px] text-dim">
          <Link href="/support" className="transition-colors hover:text-moon">
            Support
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-moon">
            Privacy
          </Link>
          <Link href="/changelog" className="transition-colors hover:text-moon">
            Changelog
          </Link>
        </footer>
      </main>
    </div>
  );
}
