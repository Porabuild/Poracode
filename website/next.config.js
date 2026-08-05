const path = require("path");

// TypeScript 7 note: this site type-checks with the native TS7 compiler, and
// since Next.js 16.3 `next build` runs the same project-local `tsc` CLI for
// its type-check step (the default `useTypeScriptCli` behavior — TS7 has no JS
// API). Next now also resolves the `@/*` tsconfig paths mapping on its own, so
// no bundler-side alias is configured here.

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Two pnpm workspace roots exist (this repo's, and website/'s standalone one
  // that Vercel installs from), so Next cannot infer which is the tracing root.
  // Name it explicitly: pages here import ../../../branding/contact.json, so the
  // repo root is the correct answer.
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [50, 75],
  },
  // Both `dev` and `build` pass `--webpack` on purpose. The workspace sets
  // `enableGlobalVirtualStore: true`, so every dependency's real path lives in
  // ~/Library/pnpm/store — outside the repo. Turbopack refuses to compile
  // anything whose realpath falls outside its root, so it cannot resolve `next`
  // itself here and no in-repo `turbopack.root` can fix that (still true on
  // 16.3). Webpack follows the symlinks fine. Revisit if the global virtual
  // store is ever disabled.
  async headers() {
    return [
      {
        // The desktop app fetches this from a different origin, so it needs
        // permissive CORS. Cache for 5 minutes at the edge + client.
        source: "/changelog.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=300" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Keep the established universal-link entry on poracode.com so existing
      // native installs can claim it; browsers continue on the isolated PWA
      // origin.
      {
        source: "/pair",
        destination: "https://app.poracode.com/pair",
        permanent: false,
      },
      {
        source: "/app",
        destination: "https://app.poracode.com/",
        permanent: true,
      },
      {
        source: "/app/:path*",
        destination: "https://app.poracode.com/:path*",
        permanent: true,
      },
      {
        source: "/pwa",
        destination: "https://app.poracode.com/",
        permanent: true,
      },
      {
        source: "/pwa/:path*",
        destination: "https://app.poracode.com/:path*",
        permanent: true,
      },
      {
        source: "/app-nightly",
        destination: "https://app-nightly.poracode.com/",
        permanent: true,
      },
      {
        source: "/app-nightly/:path*",
        destination: "https://app-nightly.poracode.com/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
