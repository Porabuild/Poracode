/**
 * Store listings for the Poracode browser extension. The download page shows a
 * store only once its listing URL is set here.
 */
export const EXTENSION_STORE_URLS: Readonly<Record<"chrome" | "edge", string | null>> = {
  chrome: "https://chromewebstore.google.com/detail/poracode/idhpcefbiobbcccipohielcldnhobcgm",
  // https://microsoftedge.microsoft.com/addons/detail/<extension id>
  edge: null,
};

export interface ExtensionStoreLink {
  id: "chrome" | "edge";
  url: string;
}

/** The stores with a published listing, Chrome Web Store first. */
export function extensionStoreLinks(
  urls: Readonly<Record<"chrome" | "edge", string | null>> = EXTENSION_STORE_URLS,
): ExtensionStoreLink[] {
  return (["chrome", "edge"] as const).flatMap((id) => {
    const url = urls[id];
    return url ? [{ id, url }] : [];
  });
}
