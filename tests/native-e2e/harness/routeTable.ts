import type { ManifestHttpRoute, ProtocolManifest } from "./manifest.ts";

export interface MatchedRoute {
  readonly route: ManifestHttpRoute;
  readonly params: Readonly<Record<string, string>>;
}

function compilePattern(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${source}$`), keys };
}

export function matchHttpRoute(
  method: string,
  pathname: string,
  manifest: ProtocolManifest,
): MatchedRoute | null {
  for (const route of manifest.httpRoutes) {
    if (route.method !== method) continue;
    const compiled = compilePattern(route.path);
    const match = compiled.regex.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    compiled.keys.forEach((key, index) => {
      const value = match[index + 1];
      if (value) params[key] = decodeURIComponent(value);
    });
    return { route, params };
  }
  return null;
}
