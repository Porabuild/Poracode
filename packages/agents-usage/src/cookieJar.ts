import type { HttpResponse } from "./host";

/**
 * A minimal, in-memory cookie jar for collectors that authenticate with a
 * captured browser session cookie.
 *
 * Providers whose console rotates its session ticket on every request (Alibaba's
 * ModelStudio console is the motivating case) invalidate the header the in-app
 * login captured. Without absorbing those rotations the stored secret goes stale
 * and the provider reads as signed out until the user signs in again — so the jar
 * tracks `Set-Cookie` across a collect pass and reports whether the header moved,
 * letting the collector write the fresh value back through
 * `CredentialStore.setSecret`.
 *
 * Deliberately not a full RFC 6265 store: every request in a collect pass targets
 * one provider's own origin family, so `Domain`/`Path`/`Secure` scoping adds no
 * signal here. Expiry is treated conservatively — only an explicit deletion
 * (empty value or `Max-Age` <= 0) drops a cookie, because wrongly dropping a live
 * ticket costs the user a re-login while keeping one the server tried to expire
 * merely fails the next request.
 */

/** Parse a `Cookie` request header into an insertion-ordered name → value map. */
export function parseCookieHeader(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of header.split(";")) {
    const part = segment.trim();
    if (!part) continue;
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (name) cookies.set(name, part.slice(separator + 1).trim());
  }
  return cookies;
}

/** Serialize a name → value map back into a `Cookie` request header. */
export function serializeCookieHeader(cookies: Map<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

interface ParsedSetCookie {
  name: string;
  value: string;
  deleted: boolean;
}

/** Pure: parse one raw `Set-Cookie` header line. */
export function parseSetCookie(raw: string): ParsedSetCookie | undefined {
  const [pair, ...attributes] = raw.split(";");
  if (pair === undefined) return undefined;
  const separator = pair.indexOf("=");
  if (separator <= 0) return undefined;
  const name = pair.slice(0, separator).trim();
  if (!name) return undefined;
  const value = pair.slice(separator + 1).trim();
  const maxAge = attributes
    .map((attribute) => /^\s*max-age\s*=\s*(-?\d+)\s*$/iu.exec(attribute)?.[1])
    .find((match) => match !== undefined);
  const deleted = !value || (maxAge !== undefined && Number(maxAge) <= 0);
  return { name, value, deleted };
}

/**
 * Apply raw `Set-Cookie` lines onto `cookies` in place. Returns true when the map
 * changed, so callers can skip a no-op write to the sealed secret store.
 */
export function applySetCookies(
  cookies: Map<string, string>,
  setCookies: readonly string[],
): boolean {
  let changed = false;
  for (const raw of setCookies) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    if (parsed.deleted) {
      changed = cookies.delete(parsed.name) || changed;
      continue;
    }
    if (cookies.get(parsed.name) === parsed.value) continue;
    cookies.set(parsed.name, parsed.value);
    changed = true;
  }
  return changed;
}

/**
 * Tracks one provider's session cookie across a collect pass. Feed every response
 * through {@link absorb}; when {@link rotated} is true the provider handed back a
 * newer session and {@link header} should be persisted.
 */
export class CookieJar {
  private cookies: Map<string, string>;
  private changed = false;

  constructor(header: string) {
    this.cookies = parseCookieHeader(header);
  }

  /** The current `Cookie` request header. */
  get header(): string {
    return serializeCookieHeader(this.cookies);
  }

  /** True once any absorbed response changed the header. */
  get rotated(): boolean {
    return this.changed;
  }

  /** Absorb a response's `Set-Cookie` rotations. Missing/failed responses are no-ops. */
  absorb(response: Pick<HttpResponse, "setCookies"> | undefined | null): void {
    const setCookies = response?.setCookies;
    if (!setCookies?.length) return;
    if (applySetCookies(this.cookies, setCookies)) this.changed = true;
  }
}
