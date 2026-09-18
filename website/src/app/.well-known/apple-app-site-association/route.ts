const DEFAULT_APP_ID = "com.lightcodeapp.mobile";

export const dynamic = "force-dynamic";

export function GET() {
  const appId = process.env.PORACODE_MOBILE_APP_ID?.trim() || DEFAULT_APP_ID;
  const teamId = process.env.PORACODE_MOBILE_APPLE_TEAM_ID?.trim();
  const appleAppId = teamId ? `${teamId}.${appId}` : null;

  return Response.json(
    {
      applinks: {
        details: appleAppId
          ? [
              {
                appIDs: [appleAppId],
                components: [
                  {
                    "/": "/",
                    comment: "Canonical app and pairing links open the installed app",
                  },
                  { "/": "/pair*", comment: "Legacy pairing links open the installed app" },
                  { "/": "/app*", comment: "Legacy app links open the installed app" },
                ],
              },
            ]
          : [],
      },
      webcredentials: {
        apps: appleAppId ? [appleAppId] : [],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
