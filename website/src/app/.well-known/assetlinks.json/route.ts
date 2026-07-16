const DEFAULT_APP_ID = "com.lightcodeapp.mobile";

export const dynamic = "force-dynamic";

export function GET() {
  const appId = process.env.PORACODE_MOBILE_APP_ID?.trim() || DEFAULT_APP_ID;
  const rawFingerprints =
    process.env.PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS?.trim() ||
    process.env.PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINT?.trim() ||
    "";
  const fingerprints = rawFingerprints
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  return Response.json(
    fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: appId,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [],
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
