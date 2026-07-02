"use client";

import {
  useState,
  useEffect,
  useRef,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Terminal,
  Zap,
  GitBranch,
  FileCode2,
  Monitor,
  Globe,
  Layers,
  History,
  Layout,
  Download,
  ArrowUpRight,
  KeyRound,
  Moon,
} from "lucide-react";
import { motion, useMotionValue, useSpring, useReducedMotion, useInView } from "framer-motion";
import { downloadUrlFor, type ReleaseInfo } from "@/lib/releases";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LanguageSelector } from "@/components/LanguageSelector";
import {
  BrandLockup,
  BrandWordmark,
  PoraGlyph,
  PoraIconTile,
  MonoLockup,
  DotPeriod,
} from "@/components/BrandMark";
import { LandingFaq } from "./landing-faq";

const ACP_REGISTRY_CDN = "https://cdn.agentclientprotocol.com/registry/v1/latest";

const EASE = [0.16, 1, 0.3, 1] as const;
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: EASE, delay },
});

// lucide-react 1.14.0 dropped brand glyphs, so the GitHub mark is inlined.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

interface AcpAgent {
  id: string;
  name: string;
}

// Mirrors the public ACP Registry at cdn.agentclientprotocol.com, excluding
// providers already promoted in the hero "Supported Agents" strip.
const ACP_REGISTRY_AGENTS: AcpAgent[] = [
  { id: "agoragentic-acp", name: "Agoragentic" },
  { id: "amp-acp", name: "Amp" },
  { id: "auggie", name: "Auggie CLI" },
  { id: "autohand", name: "Autohand Code" },
  { id: "cline", name: "Cline" },
  { id: "codebuddy-code", name: "Codebuddy Code" },
  { id: "cortex-code", name: "Cortex Code" },
  { id: "corust-agent", name: "Corust Agent" },
  { id: "crow-cli", name: "crow-cli" },
  { id: "deepagents", name: "DeepAgents" },
  { id: "dimcode", name: "DimCode" },
  { id: "dirac", name: "Dirac" },
  { id: "factory-droid", name: "Factory Droid" },
  { id: "fast-agent", name: "fast-agent" },
  { id: "glm-acp-agent", name: "GLM Agent" },
  { id: "goose", name: "goose" },
  { id: "junie", name: "Junie" },
  { id: "kilo", name: "Kilo" },
  { id: "kimi", name: "Kimi CLI" },
  { id: "minion-code", name: "Minion Code" },
  { id: "mistral-vibe", name: "Mistral Vibe" },
  { id: "nova", name: "Nova" },
  { id: "pi-acp", name: "pi ACP" },
  { id: "poolside", name: "Poolside" },
  { id: "qoder", name: "Qoder CLI" },
  { id: "qwen-code", name: "Qwen Code" },
  { id: "sigit", name: "siGit Code" },
  { id: "stakpak", name: "Stakpak" },
  { id: "vtcode", name: "VT Code" },
];

const FEATURES = [
  { icon: Layout, title: "feature.threads.title", desc: "feature.threads.desc" },
  { icon: Layers, title: "feature.protocol.title", desc: "feature.protocol.desc" },
  { icon: Terminal, title: "feature.terminal.title", desc: "feature.terminal.desc" },
  { icon: Zap, title: "feature.speed.title", desc: "feature.speed.desc" },
  { icon: History, title: "feature.persistence.title", desc: "feature.persistence.desc" },
  { icon: Globe, title: "feature.browser.title", desc: "feature.browser.desc" },
  { icon: GitBranch, title: "feature.prs.title", desc: "feature.prs.desc" },
  { icon: FileCode2, title: "feature.editor.title", desc: "feature.editor.desc" },
  { icon: Monitor, title: "feature.crossPlatform.title", desc: "feature.crossPlatform.desc" },
  { icon: Terminal, title: "feature.wsl.title", desc: "feature.wsl.desc" },
] as const;

// Real captures of individual app surfaces for the zig-zag showcase.
// `width`/`height` are the asset's true pixel dims so the browser reserves the
// aspect-ratio box up front (no layout shift as the full-res capture decodes).
const SHOWCASE = [
  {
    src: "/feature-chat.png",
    title: "feature.protocol.title",
    desc: "feature.protocol.desc",
    width: 1092,
    height: 1822,
  },
  {
    src: "/sf-editor.png",
    title: "feature.editor.title",
    desc: "feature.editor.desc",
    width: 2468,
    height: 1554,
  },
  {
    src: "/feature-git.png",
    title: "feature.prs.title",
    desc: "feature.prs.desc",
    width: 2920,
    height: 1840,
  },
  {
    src: "/sf-browser.png",
    title: "feature.browser.title",
    desc: "feature.browser.desc",
    width: 1934,
    height: 1440,
  },
] as const;

// More real surfaces, shown as a bento gallery. `span` is the lg col-span (of 6),
// `fit` picks each capture's interesting crop region, `width`/`height` reserve the box.
const GALLERY = [
  {
    src: "/sf-usage.png",
    title: "feature.usage.title",
    desc: "feature.usage.desc",
    span: 2,
    fit: "object-top",
    width: 750,
    height: 1554,
  },
  {
    src: "/sf-worktrees.png",
    title: "feature.worktrees.title",
    desc: "feature.worktrees.desc",
    span: 2,
    fit: "object-bottom",
    width: 448,
    height: 528,
  },
  {
    src: "/sf-notes.png",
    title: "feature.notes.title",
    desc: "feature.notes.desc",
    span: 2,
    fit: "object-top",
    width: 750,
    height: 1300,
  },
  {
    src: "/sf-acp.png",
    title: "feature.registry.title",
    desc: "feature.registry.desc",
    span: 3,
    fit: "object-left-top",
    width: 2948,
    height: 1554,
  },
  {
    src: "/sf-continue.png",
    title: "feature.continue.title",
    desc: "feature.continue.desc",
    span: 3,
    fit: "object-top",
    width: 1520,
    height: 584,
  },
  {
    src: "/sf-terminal.png",
    title: "feature.terminal.title",
    desc: "feature.terminal.desc",
    span: 6,
    fit: "object-left-top",
    width: 2154,
    height: 584,
  },
] as const;

// lg col-span per bento tile. Literal class strings so Tailwind's JIT keeps them.
const SPAN_CLASS: Record<number, string> = {
  2: "lg:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  6: "sm:col-span-2 lg:col-span-6",
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
  };
};

function detectAppleSiliconViaWebGL(): boolean | undefined {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return undefined;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (!dbg) return undefined;
    const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
    if (/Apple\s+(?:GPU|M\d)/i.test(renderer)) return true;
    if (/(?:Intel|AMD|Radeon|NVIDIA)/i.test(renderer)) return false;
    return undefined;
  } catch {
    return undefined;
  }
}

async function getBrowserArchitecture(): Promise<string | undefined> {
  try {
    const uaData = await (
      navigator as NavigatorWithUserAgentData
    ).userAgentData?.getHighEntropyValues(["architecture"]);
    return uaData?.architecture;
  } catch {
    return undefined;
  }
}

export function HomeContent({ release }: { release: ReleaseInfo }) {
  const { t } = useI18n();

  const [platform, setPlatform] = useState<{ label: string; slug: string }>({
    label: "Desktop",
    slug: "mac-arm64",
  });

  useEffect(() => {
    let cancelled = false;
    const apply = (p: { label: string; slug: string }) => {
      if (!cancelled) setPlatform(p);
    };
    const ua = navigator.userAgent;
    const detect = async () => {
      if (ua.includes("Mac")) {
        let isArm = true;
        const architecture = await getBrowserArchitecture();
        if (architecture) {
          isArm = /^(?:arm|arm64|aarch64)$/i.test(architecture);
        } else {
          isArm = detectAppleSiliconViaWebGL() ?? true;
        }
        apply(
          isArm
            ? { label: "macOS (arm)", slug: "mac-arm64" }
            : { label: "macOS (Intel)", slug: "mac-x64" },
        );
      } else if (ua.includes("Win")) {
        let isArm = false;
        const architecture = await getBrowserArchitecture();
        if (architecture) {
          isArm = /^(?:arm|arm64|aarch64)$/i.test(architecture);
        } else {
          isArm = ua.includes("ARM") || ua.includes("Aarch64");
        }
        apply(
          isArm
            ? { label: "Windows (ARM)", slug: "win-arm64" }
            : { label: "Windows", slug: "win-x64" },
        );
      } else if (ua.includes("Linux")) {
        apply({ label: "Linux", slug: "linux-x64" });
      }
    };
    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const versionLabel = release.version
    ? `v${release.version} • ${t("hero.tagline")}`
    : t("hero.tagline");
  const downloadHref = downloadUrlFor(release, platform.slug);
  // Lead with the `Pora.code` wordmark, so the headline copy is the value-prop
  // only: drop the "Poracode —" brand prefix from title1 and the trailing
  // full-stop from title2 (the Pora dot stands in for it). Locale-safe.
  const descriptor = `${t("hero.title1").replace(/^Poracode\s*[—–-]\s*/u, "")} ${t(
    "hero.title2",
  ).replace(/[.。]\s*$/u, "")}`;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-night text-moon">
      {/* powered-on top edge */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-px bg-gradient-to-r from-transparent via-accent/45 to-transparent" />

      {/* one-light-source ambient decor */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-52 left-1/2 h-[760px] w-[min(1180px,124vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.18),transparent)] blur-[120px]" />
        <div className="brand-grid absolute inset-x-0 top-0 h-[1200px]" />
      </div>

      {/* ── §0 Announcement bar ─────────────────────────────────── */}
      <a
        href="/changelog"
        className="group relative z-40 flex h-9 items-center justify-center gap-2 border-b border-white/[0.06] bg-tile text-center"
      >
        <span className="pora-dot pora-pulse h-1.5 w-1.5" />
        <span className="font-mono text-[12px] tracking-[-0.01em] text-dim transition-colors group-hover:text-moon">
          {versionLabel}
        </span>
        <ArrowUpRight className="h-3 w-3 text-accent transition-transform group-hover:translate-x-0.5" />
      </a>

      {/* ── §1 Nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-night/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <a href="/" aria-label="Poracode" className="transition-opacity hover:opacity-90">
            <BrandLockup />
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="/changelog"
              className="hidden rounded-md px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:bg-white/[0.04] hover:text-moon sm:inline-flex"
            >
              {t("nav.changelog")}
            </a>
            <a
              href="https://github.com/poracode/poracode"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:bg-white/[0.04] hover:text-moon"
            >
              <GithubMark className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <LanguageSelector />
            <a
              href={downloadHref}
              className="ml-1 hidden h-9 items-center gap-2 rounded-lg bg-moon px-4 text-sm font-semibold text-night transition hover:brightness-95 sm:inline-flex"
            >
              <Download className="h-4 w-4" />
              {t("nav.download")}
              <kbd className="ml-0.5 rounded bg-night/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-night/70">
                ⌘D
              </kbd>
            </a>
          </div>
        </div>
      </nav>

      {/* ── §2 Hero — brand-led ─────────────────────────────────── */}
      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 pt-24 pb-14 text-center sm:px-8 md:pt-32 md:pb-16">
        <motion.h1 {...fadeUp(0)} className="flex flex-col items-center">
          <span className="block">
            <BrandWordmark className="text-6xl tracking-[-0.04em] sm:text-7xl lg:text-8xl" />
          </span>
          <span className="mt-5 block max-w-2xl text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-dim sm:text-3xl md:text-4xl">
            {descriptor}
            <DotPeriod />
          </span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.12)}
          className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-dim sm:text-xl"
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div
          {...fadeUp(0.2)}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-5"
        >
          <a
            href={downloadHref}
            className="brand-glow group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-moon px-7 font-semibold text-night transition will-change-transform hover:-translate-y-0.5 hover:brightness-95"
          >
            <Download className="h-4 w-4" />
            {t("hero.downloadFor", { platform: platform.label })}
          </a>
          <div className="flex items-center gap-5">
            <a
              href="/download"
              className="text-sm text-dim underline-offset-4 transition-colors hover:text-moon hover:underline"
            >
              {t("nav.otherPlatforms")}
            </a>
            <a
              href="/nightly"
              className="inline-flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ice"
            >
              <Moon className="h-3.5 w-3.5" />
              {t("nav.nightly")}
            </a>
          </div>
        </motion.div>

        <motion.div
          {...fadeUp(0.28)}
          className="mt-6 inline-flex items-center gap-2 font-mono text-[12px] text-dim"
        >
          <KeyRound className="h-4 w-4" />
          <span>{t("hero.byo")}</span>
        </motion.div>
      </section>

      {/* ── §3 App window showcase ──────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-28 sm:px-8">
        <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_28%,rgba(139,123,255,0.22),transparent)] blur-[90px]" />
        <AppWindow
          src="/hero-screenshot.png"
          alt="Poracode desktop app running Claude and Codex coding agents side by side"
          width={2948}
          height={1554}
          chrome
          parallax
          badge
        />
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-48 bg-gradient-to-t from-night to-transparent" />
      </section>

      {/* ── §4 Features — hairline manifest grid ────────────────── */}
      <section
        id="features"
        className="relative z-10 border-t border-white/[0.06] px-5 py-28 sm:px-8"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-dim">
              <span className="pora-dot h-1.5 w-1.5" />
              {t("features.title2")}
            </p>
            <h2 className="text-4xl font-bold tracking-[-0.03em] text-moon md:text-5xl">
              {t("features.title1")}
              <DotPeriod pulse={false} />
            </h2>
            <p className="mt-4 text-lg text-dim">{t("features.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCell
                key={f.title}
                index={i}
                icon={f.icon}
                title={t(f.title)}
                desc={t(f.desc)}
                wide={i === FEATURES.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── §4b Showcase — real app surfaces, zig-zag ───────────── */}
      <section className="relative z-10 px-5 pb-28 sm:px-8">
        <div className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(94,230,224,0.06),transparent)] blur-2xl" />
        <div className="mx-auto flex max-w-6xl flex-col gap-20">
          {SHOWCASE.map((s, i) => (
            <div key={s.src} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <div className={`lg:col-span-7 ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <AppWindow src={s.src} width={s.width} height={s.height} />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: EASE }}
                className={`lg:col-span-5 ${i % 2 === 1 ? "lg:order-1" : ""}`}
              >
                <p className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">
                  <span className="pora-dot h-1.5 w-1.5" />
                  {String(i + 1).padStart(2, "0")} / {String(SHOWCASE.length).padStart(2, "0")}
                </p>
                <h3 className="text-2xl font-bold tracking-[-0.02em] text-moon md:text-3xl">
                  {t(s.title)}
                  <DotPeriod pulse={false} />
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-dim">{t(s.desc)}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      {/* ── §4c Surface gallery — real bento of app panels ──────── */}
      <section className="relative z-10 border-t border-white/[0.06] px-5 py-28 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">
              <span className="pora-dot h-1.5 w-1.5" />
              {t("gallery.eyebrow")}
            </p>
            <h2 className="text-4xl font-bold tracking-[-0.03em] text-moon md:text-5xl">
              {t("gallery.title")}
              <DotPeriod pulse={false} />
            </h2>
            <p className="mt-4 text-lg text-dim">{t("gallery.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
            {GALLERY.map((g, i) => (
              <BentoCard
                key={g.src}
                index={i}
                src={g.src}
                title={t(g.title)}
                desc={t(g.desc)}
                span={g.span}
                fit={g.fit}
                width={g.width}
                height={g.height}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── §5 ACP registry — living marquee ────────────────────── */}
      <section id="acp-registry" className="relative z-10 border-t border-white/[0.06] py-28">
        <div className="mx-auto mb-12 max-w-7xl px-5 text-center sm:px-8">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-accent">
            {t("acp.eyebrow")}
          </p>
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-moon md:text-4xl">
            {t("acp.title1")} {t("acp.title2").replace(/[.。]\s*$/, "")}
            <DotPeriod pulse={false} />
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-dim">{t("acp.subtitle")}</p>
        </div>
        <AcpMarquee />
      </section>

      <LandingFaq />

      {/* ── §7 Final CTA — signature close ──────────────────────── */}
      <section className="relative z-10 border-t border-white/[0.06] px-5 py-32 sm:px-8">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/[0.08] bg-tile px-6 py-20 text-center sm:px-12">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-[360px] w-[760px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(139,123,255,0.22),transparent)] blur-2xl" />
          <div className="relative">
            <PoraIconTile className="mx-auto mb-7 h-14 w-14" />
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-[-0.02em] text-moon md:text-4xl">
              {descriptor}
              <DotPeriod />
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-dim">{t("features.subtitle")}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={downloadHref}
                className="brand-glow inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-moon px-7 font-semibold text-night transition hover:brightness-95"
              >
                <Download className="h-4 w-4" />
                {t("hero.downloadFor", { platform: platform.label })}
              </a>
              <a
                href="https://github.com/poracode/poracode"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 font-medium text-moon transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <GithubMark className="h-4 w-4" />
                GitHub
                <ArrowUpRight className="h-4 w-4 text-dim" />
              </a>
            </div>
            <MonoLockup className="mt-9 text-sm" />
          </div>
        </div>
      </section>

      {/* ── §8 Footer ───────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2.5">
            <PoraIconTile className="h-7 w-7" />
            <BrandWordmark className="text-base" />
          </div>
          <p className="font-mono text-[12px] text-dim">{t("footer.copyright", { year: 2026 })}</p>
          <div className="flex items-center gap-6">
            <a
              href="/changelog"
              className="font-mono text-[13px] text-dim transition-colors hover:text-moon"
            >
              {t("nav.changelog")}
            </a>
            <a
              href="https://github.com/poracode/poracode"
              className="font-mono text-[13px] text-dim transition-colors hover:text-moon"
            >
              GitHub
            </a>
            <MonoLockup className="text-xs" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Framed app-capture window. The hero passes `chrome` (macOS title bar + `pora.code`
 * mono URL), `badge` (floating glyph), and `parallax` (mouse tilt); the zig-zag
 * captures use the bare frame. The shared shell (border, top hairline, inset ring)
 * lives here once so it can't drift between callers.
 */
function AppWindow({
  src,
  alt = "",
  width,
  height,
  chrome = false,
  badge = false,
  parallax = false,
}: {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  chrome?: boolean;
  badge?: boolean;
  parallax?: boolean;
}) {
  const reduce = useReducedMotion();
  const enableParallax = parallax && !reduce;
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 140, damping: 18, mass: 0.4 });
  const sry = useSpring(ry, { stiffness: 140, damping: 18, mass: 0.4 });

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!enableParallax) return;
    const r = e.currentTarget.getBoundingClientRect();
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 5);
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 6);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  // The hero (parallax) gets a pronounced scale-pop; supporting captures slide up.
  const entrance = parallax
    ? {
        initial: { opacity: 0, y: 36, scale: 0.97 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0.8, ease: EASE },
      }
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: EASE },
      };

  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...entrance}
      viewport={{ once: true, margin: "-80px" }}
      {...(enableParallax
        ? { style: { rotateX: srx, rotateY: sry, transformPerspective: 1600 } }
        : {})}
      className="brand-glow relative overflow-hidden rounded-2xl border border-white/[0.09] bg-tile/85"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      {chrome ? (
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-tile-2 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <div className="mx-auto flex items-center gap-1.5">
            <MonoLockup className="text-xs" />
            <span className="pora-dot h-1 w-1" />
          </div>
          <span className="w-12" />
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />
      {badge ? (
        <div className="absolute -bottom-5 -left-4 hidden h-12 w-12 rotate-3 items-center justify-center rounded-2xl border border-white/10 bg-tile brand-glow sm:flex">
          <PoraGlyph className="h-6 w-6 text-moon" />
        </div>
      ) : null}
    </motion.div>
  );
}

/** A bento tile: a framed real-app capture with a caption, spanning `span` of 6 cols on lg. */
function BentoCard({
  index,
  src,
  title,
  desc,
  span,
  fit,
  width,
  height,
}: {
  index: number;
  src: string;
  title: string;
  desc: string;
  span: number;
  fit: string;
  width: number;
  height: number;
}) {
  const spanClass = SPAN_CLASS[span] ?? "lg:col-span-2";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE, delay: (index % 3) * 0.06 }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-tile/70 transition-colors hover:border-white/[0.16] ${spanClass}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative h-52 overflow-hidden border-b border-white/[0.06] bg-night">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${fit} transition-transform duration-500 group-hover:scale-[1.03]`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-tile/80 to-transparent" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-base font-semibold text-moon">{title}</h3>
        <p className="text-sm leading-relaxed text-dim">{desc}</p>
      </div>
    </motion.div>
  );
}

function FeatureCell({
  index,
  icon: Icon,
  title,
  desc,
  wide,
}: {
  index: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE, delay: (index % 3) * 0.05 }}
      className={`group relative bg-night p-7 transition-colors hover:bg-[rgba(139,123,255,0.035)] ${
        wide ? "lg:col-span-3" : ""
      }`}
    >
      {/* cursor-sweep top edge on hover */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-accent/0 via-accent/70 to-accent/0 transition-transform duration-500 group-hover:scale-x-100" />
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 transition group-hover:bg-accent/[0.16]">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-mono text-xs text-dim/40">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <h3 className="mb-2 text-base font-semibold text-moon">{title}</h3>
      <p className="text-sm leading-relaxed text-dim">{desc}</p>
    </motion.div>
  );
}

// Doubled list so the two tracks can scroll seamlessly; derived from a module
// constant, so it's built once rather than on every marquee render.
const ACP_MARQUEE_LOOP = [...ACP_REGISTRY_AGENTS, ...ACP_REGISTRY_AGENTS];

function acpChip(agent: AcpAgent, key: string) {
  return (
    <span
      key={key}
      className="brand-chip whitespace-nowrap px-3.5 py-1.5 font-mono text-[13px] text-dim"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ACP_REGISTRY_CDN}/${agent.id}.svg`}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        className="h-4 w-4 object-contain opacity-80 [filter:brightness(0)_invert(1)]"
      />
      {agent.name}
    </span>
  );
}

function AcpMarquee() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "200px" });
  const run = !reduce && inView; // only animate while visible & motion allowed
  return (
    <div
      ref={ref}
      className="space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
    >
      <motion.div
        className="flex w-max gap-2.5"
        animate={run ? { x: ["0%", "-50%"] } : { x: "0%" }}
        transition={run ? { duration: 48, repeat: Infinity, ease: "linear" } : { duration: 0 }}
      >
        {ACP_MARQUEE_LOOP.map((a, i) => acpChip(a, `r1-${a.id}-${i}`))}
      </motion.div>
      <motion.div
        className="flex w-max gap-2.5"
        animate={run ? { x: ["-50%", "0%"] } : { x: "-50%" }}
        transition={run ? { duration: 58, repeat: Infinity, ease: "linear" } : { duration: 0 }}
      >
        {ACP_MARQUEE_LOOP.map((a, i) => acpChip(a, `r2-${a.id}-${i}`))}
      </motion.div>
    </div>
  );
}
