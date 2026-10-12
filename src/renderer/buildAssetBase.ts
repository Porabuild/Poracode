// Private, additive local-HTTP document contract; mirror in host/remote/localClientHtml.ts.
export const LOCAL_CLIENT_ASSET_BASE_META_NAME = "poracode-build-asset-base";

/**
 * Local HTTP serves relative desktop builds at root asset URLs, including from
 * nested SPA routes. The fixed marker applies only to that relative build.
 * Absent/unknown metadata, file delivery and declared hosted bases keep Vite's
 * original value. Navigation and relative/fragment links keep document.baseURI.
 */
export function getBuildAssetBase(): string {
  const buildBase = import.meta.env.BASE_URL;
  if (
    buildBase === "./" &&
    (window.location.protocol === "http:" || window.location.protocol === "https:") &&
    document.head
      .querySelector<HTMLMetaElement>('meta[name="' + LOCAL_CLIENT_ASSET_BASE_META_NAME + '"]')
      ?.getAttribute("content") === "/"
  ) {
    return "/";
  }
  return buildBase;
}
