function trimBasePath(basePath: string): string {
  if (!basePath.startsWith("/") || basePath === "/") return "/";
  return basePath.replace(/\/+$/, "");
}

/** Resolve the browser-history base for hosted, desktop-served, and dev PWAs. */
export function mobileRouterBasePath(pathname: string, buildBasePath: string): string {
  const buildBase = trimBasePath(buildBasePath);
  if (buildBase !== "/" && (pathname === buildBase || pathname.startsWith(`${buildBase}/`))) {
    return buildBase;
  }
  if (pathname === "/app" || pathname.startsWith("/app/")) return "/app";
  return "/";
}

function validInternalRoute(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;
}

function publicRoutePath(pathname: string): string {
  if (pathname === "/desktops") return "/";
  if (pathname === "/more") return "/settings";
  if (pathname === "/more/settings") return "/settings/desktop";
  if (pathname.startsWith("/more/settings/")) {
    return `/settings/${pathname.slice("/more/settings/".length)}`;
  }
  if (
    pathname === "/more/usage" ||
    pathname === "/more/projects" ||
    pathname === "/more/browser" ||
    pathname === "/more/ports"
  ) {
    return pathname.slice("/more".length);
  }
  return pathname;
}

/** Convert a former hash/state route to its browser-history URL. */
export function legacyBrowserRouteUrl(
  href: string,
  buildBasePath: string,
  storedRoute?: unknown,
): string | null {
  const url = new URL(href);
  const route =
    (url.hash.startsWith("#/") ? validInternalRoute(url.hash.slice(1)) : null) ??
    validInternalRoute(storedRoute);
  if (!route) return null;

  const internal = new URL(route, url.origin);
  const basePath = mobileRouterBasePath(url.pathname, buildBasePath);
  const publicPath = publicRoutePath(internal.pathname);
  url.pathname =
    basePath === "/" ? publicPath : publicPath === "/" ? basePath : `${basePath}${publicPath}`;
  url.search = internal.search;
  url.hash = internal.hash;
  return url.toString();
}

/** Migrate hash routes and the short-lived state-backed router without a redirect. */
export function migrateLegacyBrowserRoute(buildBasePath: string): void {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  const basePath = mobileRouterBasePath(window.location.pathname, buildBasePath);
  const atEntryPath =
    window.location.pathname === basePath ||
    window.location.pathname === "/mobile.html" ||
    window.location.pathname === "/index.html";
  const nextUrl = legacyBrowserRouteUrl(
    window.location.href,
    buildBasePath,
    atEntryPath ? state.__poracode_route : undefined,
  );
  if (!nextUrl) return;
  const nextState = { ...state };
  delete nextState.__poracode_route;
  window.history.replaceState(nextState, "", nextUrl);
}
