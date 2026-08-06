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
                  { "/": "/pair*", comment: "Pairing deep links open the installed app" },
                  { "/": "/app*", comment: "App entry deep links open the installed app" },
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
