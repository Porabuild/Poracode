/**
 * Display-time resolver for `poracode-local://` image URLs. Inside the desktop
 * Electron shell that scheme is served by a privileged protocol handler; the
 * remote PWA (a plain browser) can't load it, so the mobile bridge installs a
 * resolver that maps those URLs to the paired desktop's authenticated HTTP
 * image endpoint. The desktop never installs a resolver, so URLs there stay
 * `poracode-local://` untouched.
 */
let resolver: ((poracodeLocalUrl: string) => string) | null = null;

/** Installed by the remote bridge while a desktop connection is active. */
export function setRemoteLocalImageResolver(
  fn: ((poracodeLocalUrl: string) => string) | null,
): void {
  resolver = fn;
}

/**
 * Maps a `poracode-local://` image URL to its renderable form. Returns `url`
 * unchanged unless it is a poracode-local URL AND a resolver is installed.
 */
export function resolveLocalImageDisplayUrl(url: string): string {
  if (!resolver || !url.startsWith("poracode-local://")) return url;
  return resolver(url);
}
