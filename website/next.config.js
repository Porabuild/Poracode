const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

module.exports = nextConfig;
