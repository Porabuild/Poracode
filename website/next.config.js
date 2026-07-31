const path = require("path");

// TypeScript 7 note: this site type-checks with the native TS7 compiler
// (`pnpm typecheck`), which has no JS API until 7.1. Next's build-time
// TypeScript step requires `typescript/lib/typescript.js` (TS6 API) and
// otherwise aborts — unless it can resolve `@typescript/native-preview`,
// its marker for "a native TS compiler is in use", in which case it skips
// build-time type checking. devDependencies therefore alias
// `@typescript/native-preview` to the same GA `typescript@7` package.
// Remove the alias once Next supports the canonical typescript@7 package.

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
  // With typescript@7 installed, Next cannot read the `@/*` alias from
  // tsconfig paths (that integration needs the TS JS API, absent until 7.1),
  // so the webpack build must define the alias itself. Turbopack resolves
  // tsconfig paths on its own and ignores this.
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
  // Acknowledge the webpack config above so Turbopack builds (the default
  // since Next 16) don't error; Turbopack needs no alias configuration.
  //
  // Both `dev` and `build` pass `--webpack` on purpose. The workspace sets
  // `enableGlobalVirtualStore: true`, so every dependency's real path lives in
  // ~/Library/pnpm/store — outside the repo. Turbopack refuses to compile
  // anything whose realpath falls outside its root, so it cannot resolve `next`
  // itself here and no in-repo `turbopack.root` can fix that. Webpack follows
  // the symlinks fine. Revisit if the global virtual store is ever disabled.
  turbopack: {},
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
