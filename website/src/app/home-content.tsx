"use client";

import { useState, useEffect } from "react";
import {
  Terminal,
  Zap,
  ChevronDown,
  GitBranch,
  FileCode2,
  Monitor,
  Globe,
  Trophy,
  Layers,
  History,
  Layout,
  Download,
  Boxes,
} from "lucide-react";
import { motion } from "framer-motion";
import { downloadUrlFor, type ReleaseInfo } from "@/lib/releases";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LandingFaq } from "./landing-faq";

const ACP_REGISTRY_CDN = "https://cdn.agentclientprotocol.com/registry/v1/latest";

interface AcpAgent {
  id: string;
  name: string;
}

// Mirrors the public ACP Registry at cdn.agentclientprotocol.com, excluding
// providers already promoted in the hero "Supported Agents" strip.
// Icons are served from the same CDN as `${id}.svg`.
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

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
  };
};

/** Detect Apple Silicon via WebGL renderer string when the browser exposes it. */
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
    // Safari often reports a generic "Apple GPU" on M-series Macs.
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
  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToAcpRegistry = () => {
    document.getElementById("acp-registry")?.scrollIntoView({ behavior: "smooth" });
  };

  const [platform, setPlatform] = useState<{ label: string; slug: string }>({
    label: "Desktop",
    slug: "mac-arm64",
  });

  useEffect(() => {
    const ua = navigator.userAgent;

    const detect = async () => {
      if (ua.includes("Mac")) {
        // Detect Apple Silicon vs Intel.
        // Chrome & Safari on M1 both include "Intel" in the UA string, so
        // we can't rely on the UA alone.
        let isArm = true;

        // 1. Try userAgentData (Chrome/Edge — not available in Safari)
        const architecture = await getBrowserArchitecture();
        if (architecture) {
          isArm = /^(?:arm|arm64|aarch64)$/i.test(architecture);
        } else {
          // userAgentData unavailable (Safari) — fall back to WebGL renderer.
          // If Safari hides the renderer too, prefer the Apple Silicon build
          // because Safari's Mac UA still says Intel on M-series machines.
          isArm = detectAppleSiliconViaWebGL() ?? true;
        }

        setPlatform(
          isArm
            ? { label: "macOS (arm)", slug: "mac-arm64" }
            : { label: "macOS (Intel)", slug: "mac-x64" },
        );
      } else if (ua.includes("Win")) {
        // Windows ARM detection
        let isArm = false;
        const architecture = await getBrowserArchitecture();
        if (architecture) {
          isArm = /^(?:arm|arm64|aarch64)$/i.test(architecture);
        } else {
          isArm = ua.includes("ARM") || ua.includes("Aarch64");
        }
        setPlatform(
          isArm
            ? { label: "Windows (ARM)", slug: "win-arm64" }
            : { label: "Windows", slug: "win-x64" },
        );
      } else if (ua.includes("Linux")) {
        setPlatform({ label: "Linux", slug: "linux-x64" });
      }
    };

    detect();
  }, []);

  // Star count logic (placeholder for real data)
  const starCount = 0;

  const versionLabel = release.version
    ? `v${release.version} • ${t("hero.tagline")}`
    : t("hero.tagline");
  const downloadHref = downloadUrlFor(release, platform.slug);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black text-white">
      {/* Background Decor */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1000px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-white/[0.03] to-transparent pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-50 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Terminal className="w-8 h-8 text-white" />
          <span className="text-xl font-bold tracking-tight text-white">Lightcode</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/changelog" className="text-sm text-gray-400 hover:text-white transition-colors">
            {t("nav.changelog")}
          </a>
          <a
            href="https://github.com/SDSLeon/lightcode"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            GitHub
          </a>
          <LanguageSelector />
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 grid md:grid-cols-2 gap-12 items-center px-4 pt-12 pb-20 max-w-7xl mx-auto min-h-[min(calc(100vh-100px),900px)]">
        {/* Left Column: Text & CTA */}
        <div className="flex flex-col items-start text-left">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 text-sm font-medium text-gray-300 rounded-full bg-white/5 border border-white/10"
            >
              <Zap className="w-4 h-4 text-gray-400" />
              <span>{versionLabel}</span>
            </motion.div>

            {starCount >= 500 && <StarMilestone count={starCount} />}
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight mb-6 leading-tight text-white"
          >
            {t("hero.title1")} <br className="hidden lg:block" />
            <span className="lightcode-shimmer-text">{t("hero.title2")}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-gray-400 max-w-xl mb-6 leading-relaxed"
          >
            {t("hero.subtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mb-10"
          >
            <span className="text-sm font-semibold uppercase tracking-[0.2em] lightcode-shimmer-text opacity-90">
              {t("hero.byo")}
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-8 w-full"
          >
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
              {t("hero.supportedAgents")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {[
                {
                  name: "Claude",
                  path: "m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z",
                },
                {
                  name: "Codex",
                  path: "M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z",
                  viewBox: "0 0 24 24",
                },
                {
                  name: "OpenCode",
                  path: "M0 0 H240 V300 H0 Z M60 60 H180 V240 H60 Z M60 120 H180 V240 H60 Z",
                  viewBox: "0 0 240 300",
                },
                {
                  name: "Gemini",
                  path: "M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z",
                  viewBox: "0 0 65 65",
                },
                {
                  name: "Antigravity",
                  path: "M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z",
                  viewBox: "0 0 24 24",
                },
                {
                  name: "Cursor",
                  path: "M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z",
                  viewBox: "0 0 24 24",
                },
                {
                  name: "Copilot",
                  path: "M23.922 16.992c-.861 1.495-5.859 5.023-11.922 5.023-6.063 0-11.061-3.528-11.922-5.023A.641.641 0 0 1 0 16.736v-2.869a.841.841 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.195 10.195 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952 1.399-1.136 3.392-2.093 6.122-2.093 2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.832.832 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256ZM12.172 11h-.344a4.323 4.323 0 0 1-.355.508C10.703 12.455 9.555 13 7.965 13c-1.725 0-2.989-.359-3.782-1.259a2.005 2.005 0 0 1-.085-.104L4 11.741v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.323 4.323 0 0 1-.355-.508h-.016.016Zm.641-2.935c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z M14.5 14.25a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Zm-5 0a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z",
                  viewBox: "0 0 24 24",
                },
                {
                  name: "Grok Build",
                  path: "M2.30047 8.77631L12.0474 23H16.3799L6.63183 8.77631H2.30047ZM6.6285 16.6762L2.29492 23H6.63072L8.79584 19.8387L6.6285 16.6762ZM17.3709 1L9.88007 11.9308L12.0474 15.0944L21.7067 1H17.3709ZM18.1555 7.76374V23H21.7067V2.5818L18.1555 7.76374Z",
                  viewBox: "0 0 24 24",
                },
              ].map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-gray-300 transition hover:bg-white/10 cursor-default"
                >
                  <svg viewBox={agent.viewBox} className="w-4 h-4 fill-white opacity-80">
                    <path d={agent.path} fillRule="evenodd" />
                  </svg>
                  {agent.name}
                </div>
              ))}
              <button
                type="button"
                onClick={scrollToAcpRegistry}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:border-white/20 cursor-pointer"
              >
                <Boxes className="w-4 h-4 text-gray-300 opacity-80" />
                {t("hero.acpRegistry")}
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
          >
            <a
              href={downloadHref}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-white px-8 font-medium text-black transition-colors hover:bg-gray-200 sm:w-auto"
            >
              <Download className="w-4 h-4" />
              {t("hero.downloadFor", { platform: platform.label })}
            </a>
            <a
              href="/download"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-4"
            >
              {t("nav.otherPlatforms")}
            </a>
            <a
              href="/nightly"
              className="text-sm text-gray-500 hover:text-amber-300/90 transition-colors underline underline-offset-4"
            >
              {t("nav.nightly")}
            </a>
          </motion.div>
        </div>

        {/* Right Column: App Screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="w-full md:w-[110%] md:-ml-[5%] lg:w-[max(125%,calc(100%+20vw))] lg:-ml-[12.5%] overflow-visible relative group"
        >
          <img
            src="/hero-screenshot.png"
            alt="Lightcode — Claude and Codex agents running side-by-side"
            width={1973}
            height={1276}
            decoding="async"
            className="w-full h-auto rounded-xl shadow-2xl shadow-black/50 opacity-90 group-hover:opacity-100 transition-opacity duration-500"
          />
        </motion.div>

        {/* Scroll Indicator */}
        <motion.button
          onClick={scrollToFeatures}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-500 hover:text-white transition-colors group cursor-pointer"
        >
          <span className="text-[10px] uppercase tracking-widest font-bold">
            {t("hero.discover")}
          </span>
          <ChevronDown className="w-5 h-5 animate-bounce group-hover:translate-y-1 transition-transform" />
        </motion.button>
      </main>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-24 px-4 bg-black border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t("features.title1")} <br />
              <span className="text-gray-500">{t("features.title2")}</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">{t("features.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Layout className="w-6 h-6" />}
              title={t("feature.threads.title")}
              description={t("feature.threads.desc")}
            />
            <FeatureCard
              icon={<Layers className="w-6 h-6" />}
              title={t("feature.protocol.title")}
              description={t("feature.protocol.desc")}
            />
            <FeatureCard
              icon={<Terminal className="w-6 h-6" />}
              title={t("feature.terminal.title")}
              description={t("feature.terminal.desc")}
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              title={t("feature.speed.title")}
              description={t("feature.speed.desc")}
            />
            <FeatureCard
              icon={<History className="w-6 h-6" />}
              title={t("feature.persistence.title")}
              description={t("feature.persistence.desc")}
            />
            <FeatureCard
              icon={<Globe className="w-6 h-6" />}
              title={t("feature.browser.title")}
              description={t("feature.browser.desc")}
            />
            <FeatureCard
              icon={<GitBranch className="w-6 h-6" />}
              title={t("feature.prs.title")}
              description={t("feature.prs.desc")}
            />
            <FeatureCard
              icon={<FileCode2 className="w-6 h-6" />}
              title={t("feature.editor.title")}
              description={t("feature.editor.desc")}
            />
            <FeatureCard
              icon={<Monitor className="w-6 h-6" />}
              title={t("feature.crossPlatform.title")}
              description={t("feature.crossPlatform.desc")}
            />
            <FeatureCard
              icon={<Terminal className="w-6 h-6" />}
              title={t("feature.wsl.title")}
              description={t("feature.wsl.desc")}
            />
          </div>
        </div>
      </section>

      {/* ACP Registry Section */}
      <section
        id="acp-registry"
        className="relative z-10 py-24 px-4 bg-black border-t border-white/5"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              {t("acp.eyebrow")}
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t("acp.title1")} <br />
              <span className="text-gray-500">{t("acp.title2")}</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">{t("acp.subtitle")}</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {ACP_REGISTRY_AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:border-white/20 cursor-default"
              >
                <img
                  src={`${ACP_REGISTRY_CDN}/${agent.id}.svg`}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  className="w-4 h-4 object-contain opacity-80 [filter:brightness(0)_invert(1)]"
                />
                {agent.name}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <LandingFaq />

      {/* Footer */}
      <footer className="relative z-10 py-12 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Terminal className="w-5 h-5" />
            <span className="font-bold tracking-tight">Lightcode</span>
          </div>
          <p className="text-gray-500 text-sm">{t("footer.copyright", { year: 2026 })}</p>
          <div className="flex gap-6">
            <a href="/changelog" className="text-gray-500 hover:text-white transition-colors">
              {t("nav.changelog")}
            </a>
            <a
              href="https://github.com/SDSLeon/lightcode"
              className="text-gray-500 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 group"
    >
      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-4 text-gray-400 group-hover:text-white group-hover:bg-white/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2 text-white">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors">
        {description}
      </p>
    </motion.div>
  );
}

function StarMilestone({ count }: { count: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="inline-flex items-center gap-2 px-3 py-1 text-sm font-semibold rounded-full border bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
    >
      <Trophy className="w-4 h-4" />
      <span>{count} Stars • Community Choice</span>
    </motion.div>
  );
}
