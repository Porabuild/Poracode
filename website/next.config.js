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
  async rewrites() {
    return [
      {
        source: "/pair",
        destination: "https://poracode-pwa.vercel.app/pwa/pair",
      },
      {
        source: "/app",
        destination: "https://poracode-pwa.vercel.app/pwa/app",
      },
      {
        source: "/pwa/:path*",
        destination: "https://poracode-pwa.vercel.app/pwa/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
