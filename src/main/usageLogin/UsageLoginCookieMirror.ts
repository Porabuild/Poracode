import type { Cookie, Session } from "electron";
import { getUsageSecret, hasUsageSecret, setUsageSecret } from "@/shared/usageSecretStore";
import { type CookieLoginConfig, cookieLoginTargets } from "./providerLoginConfigs";

/**
 * Keeps the sealed session cookie of an already-signed-in provider in step with
 * the in-app browser's live cookie jar.
 *
 * `UsageLoginManager` snapshots the `Cookie` header once, at sign-in. That is
 * enough for providers whose auth cookie is persistent (Grok's `sso` carries a
 * multi-month expiry, so Chromium writes it to disk), but Alibaba's ModelStudio
 * console issues its `login_*` cookies as *session* cookies: they live only in
 * memory, vanish when the app quits, and the console rotates the ticket whenever
 * the user visits it. Without mirroring, the one sealed snapshot ages out and the
 * provider reads as "Not signed in" — which is what made Alibaba Token Plan need
 * a fresh browser sign-in far more often than the other providers.
 *
 * Consent: this only ever re-seals a provider that already has a stored secret,
 * i.e. one the user explicitly signed into and confirmed. It never captures a
 * cookie for a provider that was not signed in, and never logs cookie values.
 */

/** Coalesce the burst of `changed` events a single page load produces. */
const RESEAL_DEBOUNCE_MS = 1_500;

interface MirrorTarget {
  providerId: string;
  config: CookieLoginConfig;
}

export interface UsageLoginCookieMirrorOptions {
  /** Directory holding the sealed provider-secrets file. */
  cacheDir: string;
  /** The in-app browser's session (the partition that owns the cookie jar). */
  session: Pick<Session, "cookies">;
  /** Override the mirrored providers; defaults to every cookie-login provider. */
  targets?: MirrorTarget[];
  /** Injected for tests so the debounce is observable without real timers. */
  debounceMs?: number;
}

/**
 * Start mirroring live browser cookies into the sealed store. Returns a stop
 * function; safe to call more than once.
 */
export function startUsageLoginCookieMirror(options: UsageLoginCookieMirrorOptions): () => void {
  const targets = options.targets ?? cookieLoginTargets();
  const debounceMs = options.debounceMs ?? RESEAL_DEBOUNCE_MS;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;

  const reseal = async (target: MirrorTarget): Promise<void> => {
    // Only a provider the user already signed into may be mirrored.
    if (!hasUsageSecret(options.cacheDir, target.providerId)) return;
    const cookies = await options.session.cookies.get({ url: target.config.cookieUrl });
    // No auth cookie applies to this URL — the jar holds nothing worth sealing
    // (and an empty header would destroy the still-usable stored snapshot).
    if (!cookies.some((cookie) => target.config.authCookiePattern.test(cookie.name))) return;
    const header = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    if (!header) return;
    if (getUsageSecret(options.cacheDir, target.providerId, "cookie") === header) return;
    setUsageSecret(options.cacheDir, target.providerId, "cookie", header);
  };

  const schedule = (target: MirrorTarget): void => {
    if (stopped) return;
    const existing = timers.get(target.providerId);
    if (existing) clearTimeout(existing);
    timers.set(
      target.providerId,
      setTimeout(() => {
        timers.delete(target.providerId);
        void reseal(target).catch((error) => {
          // Never include the cookie value.
          console.warn(
            `[usage-login] failed to mirror ${target.providerId} session cookie:`,
            error instanceof Error ? error.message : String(error),
          );
        });
      }, debounceMs),
    );
  };

  const onChanged = (_event: unknown, cookie: Cookie, _cause: unknown, removed: boolean): void => {
    // React only to cookies the browser gained/refreshed. A removal is either a
    // sign-out (handled by `clearLogin`) or Chromium expiring a value, and
    // re-sealing on it would only ever write a weaker header.
    if (removed) return;
    for (const target of targets) {
      if (target.config.authCookiePattern.test(cookie.name)) schedule(target);
    }
  };

  options.session.cookies.on("changed", onChanged);

  return () => {
    if (stopped) return;
    stopped = true;
    options.session.cookies.removeListener("changed", onChanged);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
