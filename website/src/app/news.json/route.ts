import { buildNewsFeed, fetchGitHubSnapshot } from "../../lib/news/feed";

// Rebuilt at most hourly: hand-written items change with a deploy, GitHub
// numbers refresh on their own.
export const revalidate = 3600;

export async function GET() {
  const feed = buildNewsFeed(await fetchGitHubSnapshot(), new Date());
  return Response.json(feed, {
    headers: {
      // The desktop app and PWA fetch this from other origins.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
