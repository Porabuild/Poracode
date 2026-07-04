import { ImageResponse } from "next/og";

import { SITE_URL, SOCIAL_IMAGE_ALT } from "@/lib/seo";

// Branded social card used for og:image and twitter:image across the whole site.
// Generated at build time by next/og (Satori) so there is no binary asset to keep
// in sync, and it renders at the ideal 1.91:1 ratio (1200x630) that X/LinkedIn
// crop to — unlike the 1.55:1 app screenshot it replaces.
export const alt = SOCIAL_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AGENTS = ["Claude", "Codex", "Gemini", "Cursor", "OpenCode", "Copilot"];

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        backgroundImage:
          "radial-gradient(900px circle at 50% 0%, rgba(255,255,255,0.10), transparent 60%)",
        color: "#ffffff",
        padding: "64px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 124,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          backgroundImage: "linear-gradient(120deg, #ffffff 20%, #9ca3af 100%)",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Poracode
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 40,
          color: "#d1d5db",
          textAlign: "center",
          maxWidth: 920,
        }}
      >
        Universal orchestrator for AI coding agents
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 14,
          marginTop: 48,
        }}
      >
        {AGENTS.map((name) => (
          <div
            key={name}
            style={{
              display: "flex",
              fontSize: 26,
              color: "#e5e7eb",
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {name}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 56,
          fontSize: 26,
          color: "#6b7280",
        }}
      >
        {SITE_URL.replace("https://", "")} · Free & open source · macOS · Windows · Linux
      </div>
    </div>,
    { ...size },
  );
}
