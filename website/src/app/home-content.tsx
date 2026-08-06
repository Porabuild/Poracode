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
  Lock,
  ChevronLeft,
  ChevronRight,
  Signal,
  Wifi,
  BatteryFull,
  Users,
  SlidersHorizontal,
  MousePointerClick,
  Plug,
  FlaskConical,
  CalendarClock,
  Boxes,
  Sparkles,
  Mic,
  Undo2,
  Search,
  Bell,
  ListChecks,
  IdCard,
  Languages,
  Command,
  Keyboard,
  GitMerge,
  PackageCheck,
  Server,
  Network,
  GitPullRequest,
  MessageSquarePlus,
  Activity,
  Scale,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { downloadUrlFor, type ReleaseInfo } from "@/lib/releases";
import { localizedPath } from "@/lib/i18n/config";
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
import { AGENT_NAMES, AgentIcon } from "@/components/AgentIcons";
import { LightboxProvider, LightboxTrigger, useLightbox } from "@/components/Lightbox";
import { LandingFaq } from "./landing-faq";

const ACP_REGISTRY_CDN = "https://cdn.agentclientprotocol.com/registry/v1/latest";
const WEB_APP_URL = "https://app.poracode.com";

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
  { icon: FlaskConical, title: "feature.experiments.title", desc: "feature.experiments.desc" },
  { icon: CalendarClock, title: "feature.schedules.title", desc: "feature.schedules.desc" },
  { icon: GitBranch, title: "feature.prs.title", desc: "feature.prs.desc" },
  { icon: Sparkles, title: "feature.skills.title", desc: "feature.skills.desc" },
  { icon: Mic, title: "feature.voice.title", desc: "feature.voice.desc" },
  { icon: Undo2, title: "feature.checkpoints.title", desc: "feature.checkpoints.desc" },
  { icon: Boxes, title: "feature.workspaces.title", desc: "feature.workspaces.desc" },
  { icon: Zap, title: "feature.speed.title", desc: "feature.speed.desc" },
  { icon: History, title: "feature.persistence.title", desc: "feature.persistence.desc" },
  { icon: Globe, title: "feature.browser.title", desc: "feature.browser.desc" },
  { icon: FileCode2, title: "feature.editor.title", desc: "feature.editor.desc" },
  { icon: Monitor, title: "feature.crossPlatform.title", desc: "feature.crossPlatform.desc" },
  { icon: Network, title: "feature.remote.title", desc: "feature.remote.desc" },
  { icon: Terminal, title: "feature.wsl.title", desc: "feature.wsl.desc" },
] as const;

// Smaller capabilities that still decide whether the app fits someone's day.
// Rendered as a dense hairline list rather than more icon cards.
// 12 items, so the lg 3-col grid closes in exactly four rows.
const DETAILS = [
  { icon: Search, title: "detail.search.title", desc: "detail.search.desc" },
  { icon: Command, title: "detail.palette.title", desc: "detail.palette.desc" },
  {
    icon: MessageSquarePlus,
    title: "detail.quickComposer.title",
    desc: "detail.quickComposer.desc",
  },
  { icon: Bell, title: "detail.notifications.title", desc: "detail.notifications.desc" },
  { icon: ListChecks, title: "detail.plans.title", desc: "detail.plans.desc" },
  { icon: GitPullRequest, title: "detail.globalPrs.title", desc: "detail.globalPrs.desc" },
  { icon: GitMerge, title: "detail.conflicts.title", desc: "detail.conflicts.desc" },
  { icon: IdCard, title: "detail.profiles.title", desc: "detail.profiles.desc" },
  { icon: Activity, title: "detail.activity.title", desc: "detail.activity.desc" },
  { icon: PackageCheck, title: "detail.agentUpdates.title", desc: "detail.agentUpdates.desc" },
  { icon: Languages, title: "detail.languages.title", desc: "detail.languages.desc" },
  { icon: Keyboard, title: "detail.shortcuts.title", desc: "detail.shortcuts.desc" },
] as const;

// The built-in MCP servers Poracode exposes to any agent that speaks MCP.
// `server` is the literal server name an agent addresses, so it stays untranslated.
const MCP_POWERS = [
  {
    icon: SlidersHorizontal,
    server: "poracode",
    title: "mcp.appControls.title",
    desc: "mcp.appControls.desc",
  },
  {
    icon: Users,
    server: "crossagents",
    title: "mcp.crossagents.title",
    desc: "mcp.crossagents.desc",
  },
  { icon: Plug, server: "poracode", title: "mcp.extend.title", desc: "mcp.extend.desc" },
  {
    icon: MousePointerClick,
    server: "browser · chrome · computer_use",
    title: "mcp.surfaces.title",
    desc: "mcp.surfaces.desc",
  },
  // The user's side of the same story, given a full-width card: the servers
  // above are Poracode's, this one is everyone else's.
  {
    icon: Server,
    server: "stdio · http · sse",
    title: "mcp.byo.title",
    desc: "mcp.byo.desc",
    wide: true,
  },
] as const;

// Real captures of individual app surfaces for the zig-zag showcase.
// `width`/`height` are the asset's true pixel dims so the browser reserves the
// aspect-ratio box up front (no layout shift as the full-res capture decodes).
const SHOWCASE = [
  {
    src: "/feature-chat.png",
    title: "feature.protocol.title",
    desc: "feature.protocol.desc",
    width: 1094,
    height: 1822,
  },
  {
    src: "/sf-editor.png",
    title: "feature.editor.title",
    desc: "feature.editor.desc",
    width: 2248,
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
  {
    src: "/sf-experiment.png",
    title: "feature.experiments.title",
    desc: "feature.experiments.desc",
    width: 2920,
    height: 1800,
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
    width: 700,
    height: 1554,
  },
  {
    src: "/sf-worktrees.png",
    title: "feature.worktrees.title",
    desc: "feature.worktrees.desc",
    span: 2,
    fit: "object-bottom",
    width: 666,
    height: 428,
  },
  {
    src: "/sf-notes.png",
    title: "feature.notes.title",
    desc: "feature.notes.desc",
    span: 2,
    fit: "object-top",
    width: 700,
    height: 1554,
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
    height: 586,
  },
  {
    src: "/sf-crossagents.png",
    title: "mcp.crossagents.title",
    desc: "gallery.crossagents.desc",
    span: 3,
    fit: "object-left-top",
    width: 2020,
    height: 740,
  },
  {
    src: "/sf-mcp.png",
    title: "gallery.mcp.title",
    desc: "gallery.mcp.desc",
    span: 3,
    fit: "object-top",
    width: 1500,
    height: 551,
  },
  {
    src: "/sf-skills.png",
    title: "feature.skills.title",
    desc: "feature.skills.desc",
    span: 2,
    fit: "object-top",
    width: 1710,
    height: 961,
  },
  {
    src: "/sf-schedules.png",
    title: "feature.schedules.title",
    desc: "feature.schedules.desc",
    span: 2,
    fit: "object-top",
    width: 1510,
    height: 850,
  },
  {
    src: "/sf-workspaces.png",
    title: "feature.workspaces.title",
    desc: "feature.workspaces.desc",
    span: 2,
    fit: "object-top",
    width: 1510,
    height: 850,
  },
  {
    src: "/sf-terminal.png",
    title: "feature.terminal.title",
    desc: "feature.terminal.desc",
    span: 6,
    fit: "object-left-top",
    width: 1934,
    height: 584,
  },
] as const;

// lg col-span per bento tile. Literal class strings so Tailwind's JIT keeps them.
const BENTO_SPAN_CLASS: Record<number, string> = {
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
  return (
    <LightboxProvider>
      <HomeBody release={release} />
    </LightboxProvider>
  );
}

function HomeBody({ release }: { release: ReleaseInfo }) {
  const { locale, t } = useI18n();
  const openLightbox = useLightbox();

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
  const homeHref = localizedPath("/", locale);
  const aboutHref = "/about";
  const changelogHref = "/changelog";
  const downloadsHref = localizedPath("/download", locale);
  const nightlyHref = localizedPath("/nightly", locale);
  // Every real capture on the page, in visual order, so the viewer's arrows walk
  // them the way the page reads.
  const HERO_SHOT = {
    src: "/hero-screenshot.png",
    width: 2920,
    height: 1840,
    title: t("hero.tagline"),
  };
  const lightboxItems = [
    HERO_SHOT,
    ...SHOWCASE.map((s) => ({
      src: s.src,
      width: s.width,
      height: s.height,
      title: t(s.title),
    })),
    ...GALLERY.map((g) => ({
      src: g.src,
      width: g.width,
      height: g.height,
      title: t(g.title),
    })),
  ];
  // Lead with the `Pora.code` wordmark, so the headline copy is the value-prop
  // only: drop the "Poracode —" brand prefix from title1 and the trailing
  // full-stop from title2 (the Pora dot stands in for it). Locale-safe.
  const descriptor = `${t("hero.title1").replace(/^Poracode\s*[—–-]\s*/u, "")} ${t(
    "hero.title2",
  ).replace(/[.。]\s*$/u, "")}`;

  return (
    <div lang={locale} className="relative min-h-screen overflow-x-hidden bg-night text-moon">
      {/* powered-on top edge */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-px bg-gradient-to-r from-transparent via-accent/45 to-transparent" />

      {/* one-light-source ambient decor */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-52 left-1/2 h-[760px] w-[min(1180px,124vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.18),transparent)] blur-[120px]" />
        <div className="brand-grid absolute inset-x-0 top-0 h-[1200px]" />
      </div>

      {/* ── §0 Announcement bar ─────────────────────────────────── */}
      <Link
        href={changelogHref}
        prefetch={false}
        className="group relative z-40 flex h-9 items-center justify-center gap-2 border-b border-white/[0.06] bg-tile text-center"
      >
        <span className="pora-dot pora-pulse h-1.5 w-1.5" />
        <span className="font-mono text-[12px] tracking-[-0.01em] text-dim transition-colors group-hover:text-moon">
          {versionLabel}
        </span>
        <ArrowUpRight className="h-3 w-3 text-accent transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* ── §1 Nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-night/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link
            href={homeHref}
            prefetch={false}
            aria-label="Poracode"
            className="transition-opacity hover:opacity-90"
          >
            <BrandLockup />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href={WEB_APP_URL}
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:bg-white/[0.04] hover:text-moon md:inline-flex"
            >
              <Globe className="h-4 w-4" />
              {t("nav.webApp")}
            </a>
            <Link
              href={aboutHref}
              prefetch={false}
              className="hidden rounded-md px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:bg-white/[0.04] hover:text-moon lg:inline-flex"
            >
              About
            </Link>
            <Link
              href={changelogHref}
              prefetch={false}
              className="hidden rounded-md px-3 py-2 font-mono text-[13px] text-dim transition-colors hover:bg-white/[0.04] hover:text-moon sm:inline-flex"
            >
              {t("nav.changelog")}
            </Link>
            <a
              href="https://github.com/SDSLeon/lightcode"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
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

      <main>
        {/* ── §2 Hero — brand-led ─────────────────────────────────── */}
        <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 pt-24 pb-14 text-center sm:px-8 md:pt-32 md:pb-16">
          <h1 className="hero-fade-up flex flex-col items-center">
            <span className="block">
              <BrandWordmark className="text-6xl tracking-[-0.04em] sm:text-7xl lg:text-8xl" />
            </span>
            <span className="mt-5 block max-w-2xl text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-dim sm:text-3xl md:text-4xl">
              {descriptor}
              <DotPeriod />
            </span>
          </h1>

          <p className="hero-fade-up hero-fade-up-delay-1 mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-dim sm:text-xl">
            {t("hero.subtitle")}
          </p>

          <div className="hero-fade-up hero-fade-up-delay-2 mt-10 flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center">
            <a
              href={downloadHref}
              className="brand-glow group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-moon px-7 font-semibold text-night transition will-change-transform hover:-translate-y-0.5 hover:brightness-95"
            >
              <Download className="h-4 w-4" />
              {t("hero.downloadFor", { platform: platform.label })}
            </a>
            <a
              href={WEB_APP_URL}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-7 font-semibold text-moon transition will-change-transform hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"
            >
              <Globe className="h-4 w-4 text-accent" />
              {t("hero.openWebApp")}
              <ArrowUpRight className="h-4 w-4 text-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href="https://github.com/SDSLeon/lightcode"
              target="_blank"
              rel="noreferrer"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-7 font-semibold text-moon transition will-change-transform hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"
            >
              <GithubMark className="h-4 w-4" />
              {t("hero.starOnGithub")}
              <ArrowUpRight className="h-4 w-4 text-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          <div className="hero-fade-up hero-fade-up-delay-2 mt-4 flex items-center gap-5">
            <Link
              href={downloadsHref}
              prefetch={false}
              className="text-sm text-dim underline-offset-4 transition-colors hover:text-moon hover:underline"
            >
              {t("nav.otherPlatforms")}
            </Link>
            <Link
              href={nightlyHref}
              prefetch={false}
              className="inline-flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ice"
            >
              <Moon className="h-3.5 w-3.5" />
              {t("nav.nightly")}
            </Link>
          </div>

          <div className="hero-fade-up hero-fade-up-delay-3 mt-6 flex flex-col items-center gap-2 font-mono text-[12px] text-dim sm:flex-row sm:gap-5">
            <span className="inline-flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t("hero.byo")}
            </span>
            <span className="inline-flex items-center gap-2">
              <Scale className="h-4 w-4 text-accent" />
              {t("hero.foss")}
            </span>
          </div>
        </section>

        {/* ── §2b Supported agents — the native roster ─────────────── */}
        <section className="relative z-10 mx-auto max-w-5xl px-5 pb-20 sm:px-8">
          <p className="mb-5 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-dim">
            <span className="pora-dot h-1.5 w-1.5" />
            {t("hero.supportedAgents")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {AGENT_NAMES.map((name) => (
              <span
                key={name}
                className="brand-chip whitespace-nowrap px-3.5 py-1.5 font-mono text-[13px] text-dim"
              >
                <AgentIcon name={name} className="h-4 w-4 shrink-0 opacity-80" />
                {name}
              </span>
            ))}
            <a
              href="#acp-registry"
              className="brand-chip whitespace-nowrap px-3.5 py-1.5 font-mono text-[13px] text-accent"
            >
              {t("hero.acpRegistry")}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

        {/* ── §3 App window showcase ──────────────────────────────── */}
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-28 sm:px-8">
          <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_28%,rgba(139,123,255,0.22),transparent)] blur-[90px]" />
          <AppWindow
            src="/hero-screenshot.png"
            alt="Poracode desktop app running Claude and Codex coding agents side by side"
            width={2920}
            height={1840}
            chrome
            parallax
            badge
            preload
            onOpen={() => openLightbox(lightboxItems, HERO_SHOT.src)}
          />
          <div className="pointer-events-none absolute inset-x-0 -bottom-px h-48 bg-gradient-to-t from-night to-transparent" />
        </section>

        {/* ── §3b Web app — the desktop, browser-borne ────────────── */}
        <section className="relative z-10 border-t border-white/[0.06] px-5 py-28 sm:px-8 lg:pb-40">
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[560px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.10),transparent)] blur-3xl" />
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-14 max-w-2xl text-center lg:mb-36">
              <p className="mb-4 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">
                <span className="pora-dot h-1.5 w-1.5" />
                {t("nav.webApp")}
              </p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-moon md:text-5xl">
                {t("webapp.title").replace(/[.。]\s*$/, "")}
                <DotPeriod pulse={false} />
              </h2>
            </div>
            {/* One composition: the browser window is the stage, the phone docks
                over its right edge. The wrapper centers the phone vertically so
                the device keeps its own hover lift (no translate-y conflict). */}
            <div className="relative mx-auto max-w-5xl">
              <WebAppCard description={t("hero.webAppDescription")} />
              <div className="mt-12 flex justify-center lg:absolute lg:inset-y-0 lg:-right-6 lg:z-10 lg:mt-0 lg:items-center lg:pointer-events-none">
                <PhoneMockup
                  pairedLabel={t("webapp.paired")}
                  className="dock-shadow lg:pointer-events-auto"
                />
              </div>
            </div>
          </div>
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
                {t("hero.discover")}
              </p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-moon md:text-5xl">
                {t("features.title1")} {t("features.title2").replace(/[.。]\s*$/, "")}
                <DotPeriod pulse={false} />
              </h2>
              <p className="mt-4 text-lg text-dim">{t("features.subtitle")}</p>
            </div>

            <div className="grid-fill-last grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <FeatureCell
                  key={f.title}
                  index={i}
                  icon={f.icon}
                  title={t(f.title)}
                  desc={t(f.desc)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── §4a Automation — agents that drive the app itself ───── */}
        <section
          id="automation"
          className="relative z-10 border-t border-white/[0.06] px-5 py-28 sm:px-8"
        >
          <div className="pointer-events-none absolute left-1/2 top-20 -z-10 h-[440px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.12),transparent)] blur-3xl" />
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-4 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">
                <span className="pora-dot h-1.5 w-1.5" />
                {t("automation.eyebrow")}
              </p>
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-moon md:text-5xl">
                {t("automation.title")}
                <DotPeriod pulse={false} />
              </h2>
              <p className="mt-4 text-lg text-dim">{t("automation.subtitle")}</p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {MCP_POWERS.map((p) => (
                <PowerCard
                  key={p.title}
                  icon={p.icon}
                  server={p.server}
                  title={t(p.title)}
                  desc={t(p.desc)}
                  wide={"wide" in p}
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
                  <AppWindow
                    src={s.src}
                    width={s.width}
                    height={s.height}
                    onOpen={() => openLightbox(lightboxItems, s.src)}
                  />
                </div>
                <div className={`lg:col-span-5 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <p className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">
                    <span className="pora-dot h-1.5 w-1.5" />
                    {String(i + 1).padStart(2, "0")} / {String(SHOWCASE.length).padStart(2, "0")}
                  </p>
                  <h3 className="text-2xl font-bold tracking-[-0.02em] text-moon md:text-3xl">
                    {t(s.title)}
                    <DotPeriod pulse={false} />
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-dim">{t(s.desc)}</p>
                </div>
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
              {GALLERY.map((g) => (
                <BentoCard
                  key={g.src}
                  src={g.src}
                  title={t(g.title)}
                  desc={t(g.desc)}
                  span={g.span}
                  fit={g.fit}
                  width={g.width}
                  height={g.height}
                  onOpen={() => openLightbox(lightboxItems, g.src)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── §4d Details — the smaller things, densely ───────────── */}
        <section className="relative z-10 border-t border-white/[0.06] px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-2xl">
              <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-dim">
                <span className="pora-dot h-1.5 w-1.5" />
                {t("details.eyebrow")}
              </p>
              <h2 className="text-3xl font-bold tracking-[-0.02em] text-moon md:text-4xl">
                {t("details.title")}
                <DotPeriod pulse={false} />
              </h2>
              <p className="mt-4 text-lg text-dim">{t("details.subtitle")}</p>
            </div>

            <div className="grid-fill-last grid grid-cols-1 gap-x-12 gap-y-px sm:grid-cols-2 lg:grid-cols-3">
              {DETAILS.map((d) => (
                <DetailRow key={d.title} icon={d.icon} title={t(d.title)} desc={t(d.desc)} />
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
              <p className="mt-4 inline-flex items-center gap-2 font-mono text-[12px] text-dim">
                <Scale className="h-4 w-4 text-accent" />
                {t("hero.foss")}
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href={downloadHref}
                  className="brand-glow inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-moon px-7 font-semibold text-night transition hover:brightness-95"
                >
                  <Download className="h-4 w-4" />
                  {t("hero.downloadFor", { platform: platform.label })}
                </a>
                <a
                  href="https://github.com/SDSLeon/lightcode"
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
      </main>

      {/* ── §8 Footer ───────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2.5">
            <PoraIconTile className="h-7 w-7" />
            <BrandWordmark className="text-base" />
          </div>
          <p className="font-mono text-[12px] text-dim">{t("footer.copyright", { year: 2026 })}</p>
          <div className="flex items-center gap-6">
            <Link
              href={aboutHref}
              className="font-mono text-[13px] text-dim transition-colors hover:text-moon"
            >
              About
            </Link>
            <Link
              href={changelogHref}
              className="font-mono text-[13px] text-dim transition-colors hover:text-moon"
            >
              {t("nav.changelog")}
            </Link>
            <a
              href="https://github.com/SDSLeon/lightcode"
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
 * The web-app pitch rendered as a real browser window — the address bar is the
 * message. Chrome bar (traffic lights, nav, `app.poracode.com` address pill with
 * a live pora-dot), a living pairing link (desktop ⇄ browser), and the localized
 * description. The whole window links to the web app.
 */
function WebAppCard({ className, description }: { className?: string; description: string }) {
  return (
    <a
      href={WEB_APP_URL}
      className={`group brand-glow relative block w-full overflow-hidden rounded-2xl border border-white/[0.09] bg-tile/85 text-left transition will-change-transform hover:-translate-y-0.5 hover:border-white/[0.18] ${className ?? ""}`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      {/* browser chrome — on lg the right side yields to the docked phone */}
      <span className="flex items-center gap-3 border-b border-white/[0.06] bg-tile-2 px-4 py-2.5 lg:pr-72">
        <span className="flex shrink-0 gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="hidden shrink-0 items-center gap-0.5 text-dim/50 sm:flex">
          <ChevronLeft className="h-3.5 w-3.5" />
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
        <span className="mx-auto flex min-w-0 items-center gap-2 rounded-md border border-white/[0.06] bg-night/70 px-3 py-1">
          <Lock className="h-3 w-3 shrink-0 text-ice" />
          <span className="truncate font-mono text-[12px] text-dim">app.poracode.com</span>
          <span className="pora-dot pora-pulse h-1 w-1 shrink-0" />
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-dim transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-moon" />
      </span>
      {/* body: pairing link + pitch */}
      <span className="relative block px-6 py-12 sm:px-8 sm:py-14 lg:py-16 lg:pr-72">
        <span className="brand-grid absolute inset-0 opacity-50" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.14),transparent)] blur-2xl" />
        <span className="relative flex items-center justify-center">
          <PoraIconTile className="h-11 w-11 sm:h-14 sm:w-14" />
          <span className="relative mx-2 h-px w-20 bg-white/15 sm:mx-3 sm:w-28">
            <span className="pora-pair-dot absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-accent [box-shadow:0_0_8px_rgba(139,123,255,0.8)]" />
          </span>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-[26%] bg-tile ring-1 ring-white/10 sm:h-14 sm:w-14">
            <Globe className="h-[62%] w-[62%] text-accent" />
          </span>
        </span>
        <span className="relative mx-auto mt-6 block max-w-lg text-center text-base leading-relaxed text-dim">
          {description}
        </span>
      </span>
      <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />
    </a>
  );
}

/**
 * The web app on a phone — the paired state. Where the browser card pitches the
 * pairing (traveling dot), the phone shows its outcome: the app glyph breathing,
 * a confirmed `paired` status, and the `app.poracode.com` address pill. Pure
 * CSS/SVG; no capture asset. The whole device links to the web app.
 */
function PhoneMockup({ pairedLabel, className }: { pairedLabel: string; className?: string }) {
  return (
    <a
      href={WEB_APP_URL}
      className={`group brand-glow relative block w-[260px] shrink-0 rounded-[2.75rem] border border-white/[0.12] bg-tile p-2 text-left transition will-change-transform hover:-translate-y-0.5 hover:border-white/[0.22] ${className ?? ""}`}
    >
      <span className="pointer-events-none absolute inset-x-10 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <span className="relative flex h-[520px] flex-col overflow-hidden rounded-[2.25rem] border border-white/[0.06] bg-night">
        {/* dynamic island */}
        <span className="absolute left-1/2 top-2.5 z-10 h-[22px] w-20 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/[0.08]" />
        {/* status bar */}
        <span className="flex items-center justify-between px-6 pt-3.5">
          <span className="font-mono text-[11px] font-medium text-moon">9:41</span>
          <span className="flex items-center gap-1.5 text-dim">
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryFull className="h-3.5 w-3.5" />
          </span>
        </span>
        {/* address pill */}
        <span className="mx-3 mt-3 flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-tile-2 px-3 py-1.5">
          <Lock className="h-2.5 w-2.5 shrink-0 text-ice" />
          <span className="truncate font-mono text-[10px] text-dim">app.poracode.com</span>
          <span className="pora-dot pora-pulse ml-auto h-1 w-1 shrink-0" />
        </span>
        {/* paired state */}
        <span className="relative flex flex-1 flex-col items-center justify-center gap-5 px-6">
          <span className="brand-grid absolute inset-0 opacity-60" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(139,123,255,0.16),transparent)] blur-2xl" />
          <span className="relative">
            <span className="pora-pulse absolute -inset-3 rounded-[32%] bg-accent/15 blur-xl" />
            <PoraIconTile className="relative h-16 w-16" />
          </span>
          <span className="relative flex items-center gap-2 font-mono text-[11px] text-dim">
            <span className="pora-dot h-1.5 w-1.5" />
            {pairedLabel}
          </span>
        </span>
        {/* home indicator */}
        <span className="mx-auto mb-2.5 h-1 w-24 rounded-full bg-white/20" />
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-[2.75rem] ring-1 ring-inset ring-white/[0.06]" />
    </a>
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
  preload = false,
  onOpen,
}: {
  src: string;
  alt?: string;
  width: number;
  height: number;
  chrome?: boolean;
  badge?: boolean;
  parallax?: boolean;
  preload?: boolean;
  onOpen: () => void;
}) {
  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!parallax || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const rotateX = -((e.clientY - r.top) / r.height - 0.5) * 5;
    const rotateY = ((e.clientX - r.left) / r.width - 0.5) * 6;
    e.currentTarget.style.transform = `perspective(1600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };
  const onLeave = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.removeProperty("transform");
  };

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`brand-glow relative overflow-hidden rounded-2xl border border-white/[0.09] bg-tile/85 ${parallax ? "will-change-transform" : ""}`}
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
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        preload={preload}
        {...(preload ? { fetchPriority: "high" as const } : {})}
        {...(preload ? { quality: 50 } : {})}
        sizes={
          preload
            ? "(max-width: 1280px) calc(100vw - 32px), 1152px"
            : "(max-width: 1024px) calc(100vw - 40px), 672px"
        }
        decoding="async"
        className="block h-auto w-full"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]" />
      <LightboxTrigger onOpen={onOpen} />
      {badge ? (
        <div className="absolute -bottom-5 -left-4 hidden h-12 w-12 rotate-3 items-center justify-center rounded-2xl border border-white/10 bg-tile brand-glow sm:flex">
          <PoraGlyph className="h-6 w-6 text-moon" />
        </div>
      ) : null}
    </div>
  );
}

/** Shared treatments repeated across the cards below — one edit per brand tweak. */
const ACCENT_ICON_TILE =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 transition group-hover:bg-accent/[0.16]";
const HOVER_HAIRLINE_TOP =
  "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100";

/** One row of the details band: small icon tile, title, one-line description. */
function DetailRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="group flex items-start gap-4 border-t border-white/[0.07] py-5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-accent ring-1 ring-white/[0.06] transition group-hover:bg-accent/10">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-moon">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-dim">{desc}</p>
      </div>
    </div>
  );
}

/** A bento tile: a framed real-app capture with a caption, spanning `span` of 6 cols on lg. */
function BentoCard({
  src,
  title,
  desc,
  span,
  fit,
  width,
  height,
  onOpen,
}: {
  src: string;
  title: string;
  desc: string;
  span: number;
  fit: string;
  width: number;
  height: number;
  onOpen: () => void;
}) {
  const spanClass = BENTO_SPAN_CLASS[span] ?? "lg:col-span-2";
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-tile/70 transition-colors hover:border-white/[0.16] ${spanClass}`}
    >
      <div className={`${HOVER_HAIRLINE_TOP} z-10`} />
      <div className="relative h-52 overflow-hidden border-b border-white/[0.06] bg-night">
        <Image
          src={src}
          alt=""
          width={width}
          height={height}
          sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 1024px) calc(50vw - 30px), 33vw"
          decoding="async"
          className={`h-full w-full object-cover ${fit} transition-transform duration-500 group-hover:scale-[1.03]`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-tile/80 to-transparent" />
        <LightboxTrigger onOpen={onOpen} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="text-base font-semibold text-moon">{title}</h3>
        <p className="text-sm leading-relaxed text-dim">{desc}</p>
      </div>
    </div>
  );
}

/**
 * A built-in MCP server pitched as a capability: accent icon tile, the literal
 * server name an agent addresses as a mono chip, then the plain-language claim.
 */
function PowerCard({
  icon: Icon,
  server,
  title,
  desc,
  wide,
}: {
  icon: ComponentType<{ className?: string }>;
  server: string;
  title: string;
  desc: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-tile/70 p-6 transition-colors hover:border-white/[0.16] ${wide ? "md:col-span-2" : ""}`}
    >
      <span className={HOVER_HAIRLINE_TOP} />
      <div className="mb-4 flex items-center gap-3">
        <span className={`${ACCENT_ICON_TILE} shrink-0`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="brand-chip min-w-0 px-2.5 py-1 font-mono text-[11px] text-dim">
          <span className="pora-dot h-1 w-1 shrink-0" />
          <span className="truncate">{server}</span>
        </span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-moon">{title}</h3>
      <p className="text-sm leading-relaxed text-dim">{desc}</p>
    </div>
  );
}

function FeatureCell({
  index,
  icon: Icon,
  title,
  desc,
}: {
  index: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="group relative bg-night p-7 transition-colors hover:bg-[rgba(139,123,255,0.035)]">
      {/* cursor-sweep top edge on hover */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-accent/0 via-accent/70 to-accent/0 transition-transform duration-500 group-hover:scale-x-100" />
      <div className="mb-4 flex items-center justify-between">
        <span className={ACCENT_ICON_TILE}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-mono text-xs text-dim/75">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <h3 className="mb-2 text-base font-semibold text-moon">{title}</h3>
      <p className="text-sm leading-relaxed text-dim">{desc}</p>
    </div>
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
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
    >
      <div className={`flex w-max gap-2.5 ${inView ? "acp-marquee-forward" : ""}`}>
        {ACP_MARQUEE_LOOP.map((a, i) => acpChip(a, `r1-${a.id}-${i}`))}
      </div>
      <div
        className={`acp-marquee-reverse-track flex w-max gap-2.5 ${inView ? "acp-marquee-reverse" : ""}`}
      >
        {ACP_MARQUEE_LOOP.map((a, i) => acpChip(a, `r2-${a.id}-${i}`))}
      </div>
    </div>
  );
}
