import { tlsCertificateFingerprint } from "@/host/remote/server/tlsMaterial";

/** Chromium's verification hook has no port. The certificate-error URL
 * lets us make the final exact-origin decision without cached trust bypasses. */
const pins = new WeakMap<object, Map<string, string>>();

function origin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === "wss:") parsed.protocol = "https:";
  if (parsed.protocol !== "https:") throw new Error("A certificate pin requires HTTPS.");
  return parsed.origin;
}

export function registerRemoteCertificatePin(
  session: object,
  url: string,
  fingerprint: string,
): void {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid certificate fingerprint.");
  let entries = pins.get(session);
  if (!entries) {
    entries = new Map();
    pins.set(session, entries);
  }
  entries.set(origin(url), fingerprint);
}

export function hasRemoteCertificatePinForHost(session: object, hostname: string): boolean {
  return [...(pins.get(session)?.keys() ?? [])].some(
    (url) => new URL(url).hostname === hostname.toLowerCase(),
  );
}

export function matchesRemoteCertificatePin(session: object, url: string, pem: string): boolean {
  try {
    const expected = pins.get(session)?.get(origin(url));
    return expected !== undefined && tlsCertificateFingerprint(pem) === expected;
  } catch {
    return false;
  }
}

export function removeRemoteCertificatePin(session: object, url: string): void {
  try {
    pins.get(session)?.delete(origin(url));
  } catch {
    /* Plaintext has no TLS pin. */
  }
}

const chainVerdicts = new WeakMap<object, Map<string, boolean>>();

/** Remember Chromium's original hostname-aware chain verdict. The verifier
 * always returns a certificate error, so cached successes can never skip the
 * later URL/port-aware pin decision. Unknown verdicts fail closed. */
export function recordChromiumCertificateVerdict(
  session: object,
  hostname: string,
  pem: string,
  trusted: boolean,
): void {
  try {
    let entries = chainVerdicts.get(session);
    if (!entries) {
      entries = new Map();
      chainVerdicts.set(session, entries);
    }
    const key = `${hostname.toLowerCase()}:${tlsCertificateFingerprint(pem)}`;
    entries.delete(key);
    entries.set(key, trusted);
    while (entries.size > 256) entries.delete(entries.keys().next().value!);
  } catch {
    /* Invalid certificates cannot gain default trust. */
  }
}

export function chromiumCertificateVerdict(session: object, url: string, pem: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return chainVerdicts.get(session)?.get(`${host}:${tlsCertificateFingerprint(pem)}`) === true;
  } catch {
    return false;
  }
}

export function hasRemoteCertificatePin(session: object, url: string): boolean {
  try {
    return pins.get(session)?.has(origin(url)) ?? false;
  } catch {
    return false;
  }
}
