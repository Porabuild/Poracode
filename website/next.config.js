/** @type {import('next').NextConfig} */
const nextConfig = {
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
