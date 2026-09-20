import { createHash, generateKeyPairSync, randomBytes, sign, X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import { isIP } from "node:net";
import {
  REMOTE_TLS_CERT_ENV,
  REMOTE_TLS_KEY_ENV,
  remoteTlsCertPaths,
  detectLanIpv4Address,
} from "../config";

/**
 * Gate 6 item 4.2 (TLS): material helpers for the remote-access listener's
 * HTTPS mode.
 *
 * - {@link loadRemoteAccessTlsMaterial} resolves the configured PEM pair into
 *   the shape `https.createServer` wants, plus the SHA-256 leaf fingerprint
 *   the pairing QR carries. Absent configuration resolves to `null`
 *   (plaintext); a PARTIAL or unloadable configuration is a loud startup
 *   failure — a typo must never silently downgrade an operator who asked for
 *   encryption to plaintext.
 * - {@link generateSelfSignedTlsMaterial} mints a fresh self-signed
 *   certificate with plain `node:crypto` (no new dependency): an EC P-256 key,
 *   a v3 certificate with SANs for the loopback/advertised names, and
 *   serverAuth EKU. This is what `poracode-server init` runs to seed
 *   `PORACODE_REMOTE_TLS_CERT`/`PORACODE_REMOTE_TLS_KEY` (one-line wiring in
 *   the CLI: write `cert`/`key` to their configured paths, key mode
 *   0600).
 *
 * The fingerprint is the standard SHA-256 digest over the DER certificate
 * (`openssl x509 -fingerprint -sha256`), hex-encoded without separators.
 */

export interface RemoteAccessTlsMaterial {
  /** PEM-encoded leaf certificate. */
  readonly cert: string;
  /** PEM-encoded private key. */
  readonly key: string;
  /** SHA-256 over the DER certificate, lowercase hex, no separators. */
  readonly fingerprint: string;
  readonly certPath: string;
  readonly keyPath: string;
}

/** Hex fingerprint of a PEM leaf certificate (SHA-256 over DER). */
export function tlsCertificateFingerprint(pem: string): string {
  return createHash("sha256").update(new X509Certificate(pem).raw).digest("hex");
}

interface LoadInput {
  readonly paths?: { readonly certPath: string; readonly keyPath: string } | null;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Loads the configured TLS material. `null` when neither env variable is set;
 * throws (with the exact variable names) when the configuration is partial,
 * unreadable, or unparsable.
 */
export function loadRemoteAccessTlsMaterial(input: LoadInput = {}): RemoteAccessTlsMaterial | null {
  const paths = input.paths !== undefined ? input.paths : remoteTlsCertPaths(input.env);
  if (!paths) return null;
  const missing: string[] = [];
  if (!paths.certPath) missing.push(REMOTE_TLS_CERT_ENV);
  if (!paths.keyPath) missing.push(REMOTE_TLS_KEY_ENV);
  if (missing.length > 0) {
    throw new Error(
      `[poracode] Remote access TLS is misconfigured: ${missing.join(" and ")} must be set together with the ${missing.length === 2 ? "paths" : "missing path"}. Refusing to start plaintext instead.`,
    );
  }
  for (const [name, path] of [
    [REMOTE_TLS_CERT_ENV, paths.certPath],
    [REMOTE_TLS_KEY_ENV, paths.keyPath],
  ] as const) {
    if (!existsSync(path)) {
      throw new Error(
        `[poracode] Remote access TLS is misconfigured: ${name} points to a missing file (${path}). Refusing to start plaintext instead.`,
      );
    }
  }
  const cert = readFileSync(paths.certPath, "utf8");
  const key = readFileSync(paths.keyPath, "utf8");
  let fingerprint: string;
  try {
    fingerprint = tlsCertificateFingerprint(cert);
  } catch (error) {
    throw new Error(
      `[poracode] Remote access TLS is misconfigured: ${REMOTE_TLS_CERT_ENV} is not a parsable PEM certificate (${String(error)}).`,
      { cause: error },
    );
  }
  return {
    cert,
    key,
    fingerprint,
    certPath: paths.certPath,
    keyPath: paths.keyPath,
  };
}

export interface GeneratedTlsMaterial {
  /** PEM-encoded leaf certificate. Same field names as
   * {@link RemoteAccessTlsMaterial}, so generated material can be handed to
   * the `RemoteAccessServer` `tls` option (or written to the configured
   * `PORACODE_REMOTE_TLS_CERT`/`PORACODE_REMOTE_TLS_KEY` paths) unchanged. */
  readonly cert: string;
  /** PEM-encoded PKCS#8 private key. */
  readonly key: string;
  /** SHA-256 over the DER certificate, lowercase hex, no separators. */
  readonly fingerprint: string;
  /** ISO expiry of the generated certificate. */
  readonly expiresAt: string;
}

export interface GenerateTlsMaterialInput {
  /** Certificate CN and SAN DNS entry. Defaults to the OS hostname. */
  readonly commonName?: string;
  /** Extra DNS names to answer for (advertised hosts, tailnet names, …). */
  readonly dnsNames?: readonly string[];
  /** Extra IP addresses (IPv4/IPv6 string form). Loopback is always included. */
  readonly ipAddresses?: readonly string[];
  /** Validity window in days. Defaults to 825 (the long-form browser cap). */
  readonly validityDays?: number;
  readonly now?: Date;
}

// --- Minimal DER encoding (self-signed certificate needs only this subset) ---

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTlv(tag: number, contents: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(contents.length), contents]);
}

function derSequence(...parts: readonly Buffer[]): Buffer {
  return derTlv(0x30, Buffer.concat(parts));
}

function derSet(...parts: readonly Buffer[]): Buffer {
  return derTlv(0x31, Buffer.concat(parts));
}

function derIntegerBytes(bytes: Buffer): Buffer {
  const trimmed = [...bytes].map((byte) => byte);
  // Strip leading zeros but keep a positive sign byte when the high bit is set.
  let start = 0;
  while (start < trimmed.length - 1 && trimmed[start] === 0) start += 1;
  const content = trimmed.slice(start);
  return derTlv(0x02, Buffer.from(content));
}

function derOid(oid: string): Buffer {
  const parts = oid.split(".").map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid OID: ${oid}`);
  }
  const body: number[] = [parts[0]! * 40 + parts[1]!];
  for (const part of parts.slice(2)) {
    let value = part;
    const encoded: number[] = [value & 0x7f];
    value >>>= 7;
    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    body.push(...encoded);
  }
  return derTlv(0x06, Buffer.from(body));
}

function derUtf8String(value: string): Buffer {
  return derTlv(0x0c, Buffer.from(value, "utf8"));
}

function derUtcTime(date: Date): Buffer {
  const two = (n: number) => String(n).padStart(2, "0");
  const text =
    `${String(date.getUTCFullYear()).slice(2)}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}` +
    `${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
  return derTlv(0x17, Buffer.from(text, "ascii"));
}

function derBitString(contents: Buffer): Buffer {
  return derTlv(0x03, Buffer.concat([Buffer.from([0]), contents]));
}

function derOctetString(contents: Buffer): Buffer {
  return derTlv(0x04, contents);
}

function derNull(): Buffer {
  return Buffer.from([0x05, 0x00]);
}

function derBooleanTrue(): Buffer {
  return Buffer.from([0x01, 0x01, 0xff]);
}

function derContextExplicit(tag: number, contents: Buffer): Buffer {
  return derTlv(0xa0 | tag, contents);
}

function derContextPrimitive(tag: number, contents: Buffer): Buffer {
  return derTlv(0x80 | tag, contents);
}

const OID_ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2";
const OID_COMMON_NAME = "2.5.4.3";
const OID_SUBJECT_ALT_NAME = "2.5.29.17";
const OID_BASIC_CONSTRAINTS = "2.5.29.19";
const OID_EXTENDED_KEY_USAGE = "2.5.29.37";
const OID_SERVER_AUTH = "1.3.6.1.5.5.7.3.1";

function nameAttribute(commonName: string): Buffer {
  return derSequence(derSet(derSequence(derOid(OID_COMMON_NAME), derUtf8String(commonName))));
}

function utcTimeOrGeneralizedTime(date: Date): Buffer {
  // UTCTime is only valid for 1950-2049; the generator's window is ~years.
  if (date.getUTCFullYear() < 2050) return derUtcTime(date);
  const two = (n: number) => String(n).padStart(2, "0");
  const text =
    `${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}` +
    `${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}Z`;
  return derTlv(0x18, Buffer.from(text, "ascii"));
}

/**
 * Mints a self-signed TLS certificate. Deterministic shape, random key and
 * serial every call. No dependency beyond `node:crypto`, so the standalone
 * server image stays dependency-identical.
 */
export function generateSelfSignedTlsMaterial(
  input: GenerateTlsMaterialInput = {},
): GeneratedTlsMaterial {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const now = input.now ?? new Date();
  const validityDays = input.validityDays ?? 825;
  const notBefore = new Date(now.getTime() - 60 * 60 * 1000);
  const notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const dnsNames = new Set<string>(["localhost"]);
  if (input.commonName) dnsNames.add(input.commonName);
  for (const name of input.dnsNames ?? []) {
    if (name.trim()) dnsNames.add(name.trim());
  }
  const ipAddresses = new Set<string>(["127.0.0.1", "::1"]);
  for (const address of input.ipAddresses ?? []) {
    if (isIP(address.trim())) ipAddresses.add(address.trim());
  }

  // Random positive serial: clear the top bit, force a low bit so it is never 0.
  const serial = randomBytes(16);
  serial[0] = serial[0]! & 0x7f;
  serial[15] = (serial[15]! | 0x01) & 0xff;

  const signatureAlgorithm = derSequence(derOid(OID_ECDSA_WITH_SHA256), derNull());
  const issuer = nameAttribute(input.commonName ?? defaultCommonName());
  const validity = derSequence(derUtcTime(notBefore), utcTimeOrGeneralizedTime(notAfter));

  const generalNames = [
    ...[...dnsNames].map((name) => derContextPrimitive(2, Buffer.from(name, "ascii"))),
    ...[...ipAddresses].map((address) =>
      derContextPrimitive(7, Buffer.from(normalizeIpForDer(address), "binary")),
    ),
  ];
  const san = derSequence(
    derOid(OID_SUBJECT_ALT_NAME),
    derOctetString(derSequence(...generalNames)),
  );
  const basicConstraints = derSequence(
    derOid(OID_BASIC_CONSTRAINTS),
    derBooleanTrue(),
    derOctetString(derSequence(derBooleanTrue())),
  );
  const extendedKeyUsage = derSequence(
    derOid(OID_EXTENDED_KEY_USAGE),
    derOctetString(derSequence(derOid(OID_SERVER_AUTH))),
  );

  const tbs = derSequence(
    derContextExplicit(0, derIntegerBytes(Buffer.from([0x02]))),
    derIntegerBytes(Buffer.from(serial)),
    signatureAlgorithm,
    issuer,
    validity,
    issuer,
    publicKey.export({ type: "spki", format: "der" }),
    derContextExplicit(3, derSequence(san, basicConstraints, extendedKeyUsage)),
  );

  const signature = sign("sha256", tbs, privateKey);
  const certificate = derSequence(tbs, signatureAlgorithm, derBitString(signature));

  // RFC 7468 wrapping: lines of exactly 64 base64 chars, and the final
  // (usually partial) line still ends with a newline before the END marker —
  // OpenSSL's parser rejects a "bad end line" otherwise.
  const base64Body = Buffer.from(certificate)
    .toString("base64")
    .replace(/(.{64})/g, "$1\n")
    .replace(/\n$/, "");
  const pem = `-----BEGIN CERTIFICATE-----\n${base64Body}\n-----END CERTIFICATE-----\n`;
  return {
    cert: pem,
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    fingerprint: tlsCertificateFingerprint(pem),
    expiresAt: notAfter.toISOString(),
  };
}

function defaultCommonName(): string {
  try {
    return hostname() || "Poracode Remote Access";
  } catch {
    return "Poracode Remote Access";
  }
}

function normalizeIpForDer(address: string): string {
  // Node's parsed IP strings ("::1") round-trip to the 16-byte binary form via
  // URL parsing of an IPv6 literal; keep it simple with explicit handling.
  if (address.includes(":")) {
    const expanded = expandIpv6(address);
    const bytes = Buffer.alloc(16);
    for (let index = 0; index < 8; index += 1) {
      bytes.writeUInt16BE(parseInt(expanded.slice(index * 4, index * 4 + 4), 16), index * 2);
    }
    return bytes.toString("binary");
  }
  return address
    .split(".")
    .map(Number)
    .map((octet) => String.fromCharCode(octet))
    .join("");
}

function expandIpv6(address: string): string {
  const [head, tail = ""] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  return groups.map((group) => group.padStart(4, "0")).join("");
}

/** Convenience for the `init` wiring: sensible default SANs for this host. */
export function defaultTlsSubjectNames(input?: {
  readonly interfaces?: ReturnType<typeof networkInterfaces>;
}): { readonly commonName: string; readonly dnsNames: string[]; readonly ipAddresses: string[] } {
  const dnsNames = new Set<string>();
  const ipAddresses = new Set<string>();
  const lan = detectLanIpv4Address(input?.interfaces);
  if (lan) ipAddresses.add(lan);
  return {
    commonName: defaultCommonName(),
    dnsNames: [...dnsNames],
    ipAddresses: [...ipAddresses],
  };
}
