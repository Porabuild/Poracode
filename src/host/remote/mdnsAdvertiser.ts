/**
 * mDNS / DNS-SD advertiser for the remote access listener (V5 plan item P4).
 *
 * When the server runs with TLS material configured in `lan` or `tailnet` bind
 * mode, it advertises one DNS-SD service record set
 * (`_poracode._tcp.local`) over multicast UDP 5353 so the native pairing
 * screens (iOS `NWBrowser`, Android `NsdManager`) can list the host instead of
 * typing the endpoint. The TXT record carries the leaf-certificate
 * fingerprint (`fp=sha256:<hex>`, Gate 6 item 4.2) so a discoverer can PIN the
 * exact server on first connect — discovery only ever finds the endpoint, it
 * never replaces the pairing credential.
 *
 * Implementation is a deliberate minimal advertiser: no dependency, one
 * service record set, bounded timers and a bounded query responder. It is OFF
 * in `loopback` mode by default (`shouldAdvertiseMdns` is the single decision
 * point) and every socket failure is contained — advertising can never break
 * serving.
 *
 * Wire format: RFC 6762 (mDNS) + RFC 6763 (DNS-SD). All packet builders are
 * pure exported functions so the unit tests pin the bytes against an
 * independently written parser and a captured-packet fixture.
 */

import { createSocket, type RemoteInfo } from "node:dgram";
import { isIPv4 } from "node:net";
import type { RemoteAccessBindMode } from "./config";

export const MDNS_PORT = 5353;
export const MDNS_MULTICAST_GROUP = "224.0.0.251";
export const PORACODE_MDNS_SERVICE_TYPE = "_poracode._tcp.local";

/** DNS-SD recommended TTLs: long for the service records, short for the host
 * address record (RFC 6762 section 10). */
const SERVICE_RECORD_TTL_SECONDS = 4500;
const ADDRESS_RECORD_TTL_SECONDS = 120;
/** RFC 6762 section 8.3: at least two announcements, ~1 second apart. */
const ANNOUNCE_REPEAT_DELAY_MS = 1_000;
/** Bounded refresh cadence: discoverers that joined late see the next announce
 * within this window even without a query round-trip. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
/** A DNS label holds at most 63 bytes. */
const MAX_INSTANCE_LABEL_BYTES = 63;

/** Environment override (`PORACODE_REMOTE_MDNS=0` / `=1`). Unset keeps the
 * bind-mode policy. */
export const REMOTE_MDNS_ENV = "PORACODE_REMOTE_MDNS";

export interface MdnsAdvertisement {
  readonly desktopId: string;
  readonly label: string;
  /** The advertised endpoint host (never a wildcard bind host). */
  readonly host: string;
  readonly port: number;
  /** Leaf-certificate SHA-256 hex (no `sha256:` prefix). Omitted on a
   * plaintext listener — and a plaintext listener never advertises. */
  readonly tlsFingerprint: string;
}

export interface MdnsAdvertiser {
  start(): void;
  stop(): Promise<void>;
}

export interface MdnsAdvertiserOptions {
  /** Failure sink; defaults to console.warn. Advertising failures never throw
   * into the composition. */
  readonly onError?: (error: unknown) => void;
  /** Socket factory override for tests; defaults to a real multicast udp4
   * socket. */
  readonly createSocket?: () => SocketLike;
}

/**
 * The single advertise decision. Default policy: advertise only when TLS
 * material is configured AND the bind is a beyond-loopback mode (`lan` or
 * `tailnet`); `loopback` never advertises — a loopback endpoint is useless to
 * other devices and advertising it would just be noise. The env override
 * (`PORACODE_REMOTE_MDNS`) wins in both directions.
 */
export function shouldAdvertiseMdns(input: {
  readonly mode: RemoteAccessBindMode;
  readonly tlsConfigured: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): { readonly advertise: boolean; readonly reason: string } {
  const raw = input.env?.[REMOTE_MDNS_ENV]?.trim().toLowerCase();
  if (raw === "0" || raw === "false") {
    return { advertise: false, reason: `${REMOTE_MDNS_ENV}=${raw} disables advertising` };
  }
  if (raw === "1" || raw === "true") {
    if (!input.tlsConfigured) {
      return {
        advertise: false,
        reason: `${REMOTE_MDNS_ENV}=${raw} but no TLS material is configured`,
      };
    }
    return { advertise: true, reason: `${REMOTE_MDNS_ENV}=${raw} forces advertising` };
  }
  if (!input.tlsConfigured) {
    return {
      advertise: false,
      reason: "the listener is plaintext; only TLS-configured hosts advertise",
    };
  }
  if (input.mode === "loopback") {
    return { advertise: false, reason: "the loopback bind is not discoverable by other devices" };
  }
  return {
    advertise: true,
    reason: `TLS-configured ${input.mode} bind advertises for native pairing discovery`,
  };
}

// ---------------------------------------------------------------------------
// Wire encoding (RFC 1035 names + RFC 6762/6763 records)
// ---------------------------------------------------------------------------

function encodeLabel(label: string): Buffer[] {
  const bytes = Buffer.from(label, "utf8");
  if (bytes.length > MAX_INSTANCE_LABEL_BYTES) {
    // Trim on a UTF-16 boundary that still fits the byte budget.
    let text = label;
    while (text.length > 0 && Buffer.byteLength(text, "utf8") > MAX_INSTANCE_LABEL_BYTES) {
      text = text.slice(0, -1);
    }
    return [Buffer.concat([Buffer.from([text.length]), Buffer.from(text, "utf8")])];
  }
  return [Buffer.concat([Buffer.from([bytes.length]), bytes])];
}

/** Encodes a fully qualified name from its labels plus the root terminator. */
function encodeName(labels: readonly string[]): Buffer {
  return Buffer.concat([...labels.flatMap(encodeLabel), Buffer.from([0])]);
}

function encodeRecord(input: {
  readonly name: Buffer;
  readonly type: number;
  /** Class field verbatim (includes the cache-flush bit when set). */
  readonly classField: number;
  readonly ttlSeconds: number;
  readonly rdata: Buffer;
}): Buffer {
  const header = Buffer.alloc(10);
  header.writeUInt16BE(input.type, 0);
  header.writeUInt16BE(input.classField, 2);
  header.writeUInt32BE(input.ttlSeconds, 4);
  header.writeUInt16BE(input.rdata.length, 8);
  return Buffer.concat([input.name, header, input.rdata]);
}

/** Instance label for DNS-SD: the human label with separators stripped, so one
 * name stays one DNS label, plus a short id suffix for uniqueness. */
export function mdnsInstanceLabel(desktopId: string, label: string): string {
  const shortId =
    desktopId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "host";
  const sanitized = Array.from(`${label} ${shortId}`.trim())
    .filter((character) => character !== "." && character !== "\\" && character.charCodeAt(0) >= 32)
    .join("");
  const candidate = sanitized.length > 0 ? sanitized : "Poracode";
  return (
    Array.from(candidate)
      .reduce(
        (text, character) =>
          Buffer.byteLength(text + character, "utf8") <= MAX_INSTANCE_LABEL_BYTES
            ? text + character
            : text,
        "",
      )
      .trimEnd() || "Poracode"
  );
}

/** The stable SRV/A target for one desktop. */
export function mdnsServiceTarget(desktopId: string): string {
  return `poracode-${desktopId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40)}.local`;
}

function instanceNameBuffer(advertisement: MdnsAdvertisement): Buffer {
  return encodeName([
    mdnsInstanceLabel(advertisement.desktopId, advertisement.label),
    "_poracode",
    "_tcp",
    "local",
  ]);
}

function txtRdata(advertisement: MdnsAdvertisement): Buffer {
  const entries = [`id=${advertisement.desktopId}`, `fp=sha256:${advertisement.tlsFingerprint}`];
  const parts = entries.map((entry) => {
    const value = Buffer.from(entry, "utf8");
    if (value.length > 255) throw new Error("mDNS TXT entry exceeds 255 bytes");
    return Buffer.concat([Buffer.from([value.length]), value]);
  });
  return Buffer.concat(parts);
}

function srvTargetLabels(advertisement: MdnsAdvertisement): string[] {
  if (isIPv4(advertisement.host) || advertisement.host.includes(":")) {
    // The SRV target is a name, so IP hosts resolve through the A record we
    // publish for the synthetic target name.
    return [mdnsServiceTarget(advertisement.desktopId).replace(/\.local$/, ""), "local"];
  }
  // A hostname (for example a tailnet DNS name) is already resolvable.
  return advertisement.host.split(".").filter((label) => label.length > 0);
}

/**
 * The announcement packet: authoritative mDNS response carrying the full
 * record set — PTR (service discovery), SRV (port + target), TXT (id +
 * certificate fingerprint), and an A record when the advertised host is an
 * IPv4 address.
 */
export function buildMdnsAnnouncementPacket(advertisement: MdnsAdvertisement): Buffer {
  const answers: Buffer[] = [];
  const serviceType = encodeName(["_poracode", "_tcp", "local"]);
  const instance = instanceNameBuffer(advertisement);

  // PTR: shared record (no cache-flush) pointing at this instance.
  answers.push(
    encodeRecord({
      name: serviceType,
      type: 12,
      classField: 0x0001,
      ttlSeconds: SERVICE_RECORD_TTL_SECONDS,
      rdata: instance,
    }),
  );
  // SRV + TXT: unique records (cache-flush bit set).
  const target = encodeName(srvTargetLabels(advertisement));
  const srvRdata = Buffer.alloc(6);
  srvRdata.writeUInt16BE(0, 0); // priority
  srvRdata.writeUInt16BE(0, 2); // weight
  srvRdata.writeUInt16BE(advertisement.port, 4);
  answers.push(
    encodeRecord({
      name: instance,
      type: 33,
      classField: 0x8001,
      ttlSeconds: SERVICE_RECORD_TTL_SECONDS,
      rdata: Buffer.concat([srvRdata, target]),
    }),
  );
  answers.push(
    encodeRecord({
      name: instance,
      type: 16,
      classField: 0x8001,
      ttlSeconds: SERVICE_RECORD_TTL_SECONDS,
      rdata: txtRdata(advertisement),
    }),
  );
  if (isIPv4(advertisement.host)) {
    const aRdata = Buffer.from(
      advertisement.host.split(".").map((octet) => Number.parseInt(octet, 10)),
    );
    answers.push(
      encodeRecord({
        name: encodeName(srvTargetLabels(advertisement)),
        type: 1,
        classField: 0x8001,
        ttlSeconds: ADDRESS_RECORD_TTL_SECONDS,
        rdata: aRdata,
      }),
    );
  }

  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0); // ID 0 (mDNS casts queries to zero)
  header.writeUInt16BE(0x8400, 2); // QR=1 (response), AA=1 (authoritative)
  header.writeUInt16BE(0, 4); // QDCOUNT
  header.writeUInt16BE(answers.length, 6); // ANCOUNT
  return Buffer.concat([header, ...answers]);
}

export interface MdnsServiceQuery {
  readonly name: string;
  readonly type: number;
  /** The unicast-response bit (QU) from RFC 6762 section 5.4. */
  readonly wantsUnicastResponse: boolean;
}

/** Decodes the service-type discovery question this advertiser answers
 * (`_poracode._tcp.local` PTR or ANY). Returns null for everything else —
 * probes, one-off record types, and foreign service types are ignored. */
export function parseMdnsServiceQuery(packet: Buffer): MdnsServiceQuery | null {
  if (packet.length < 12) return null;
  const flags = packet.readUInt16BE(2);
  if ((flags & 0x8000) !== 0) return null; // A response is never a query.
  const questionCount = packet.readUInt16BE(4);
  if (questionCount < 1) return null;
  let offset = 12;
  for (let index = 0; index < Math.min(questionCount, 4); index += 1) {
    const labels: string[] = [];
    let sawTerminator = false;
    while (offset < packet.length) {
      const length = packet[offset]!;
      offset += 1;
      if (length === 0) {
        sawTerminator = true;
        break;
      }
      if (offset + length > packet.length) return null;
      labels.push(packet.subarray(offset, offset + length).toString("utf8"));
      offset += length;
    }
    if (!sawTerminator || offset + 4 > packet.length) return null;
    const type = packet.readUInt16BE(offset);
    const classField = packet.readUInt16BE(offset + 2);
    offset += 4;
    const name = `${labels.join(".")}`;
    const matchesService = name === "_poracode._tcp.local" && (type === 12 || type === 255);
    if (matchesService) {
      return { name, type, wantsUnicastResponse: (classField & 0x8000) !== 0 };
    }
  }
  return null;
}

/** The query response: the same record set the announcement carries, sent to
 * the querier's unicast address when the question asks for it (RFC 6762
 * section 5.4 QU) and to the multicast group otherwise — so discoverers share
 * one parser path either way. */
export function buildMdnsQueryResponsePacket(advertisement: MdnsAdvertisement): Buffer {
  return buildMdnsAnnouncementPacket(advertisement);
}

// ---------------------------------------------------------------------------
// Socket layer
// ---------------------------------------------------------------------------

interface SocketLike {
  on(event: "message", listener: (buffer: Buffer, remote: RemoteInfo) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  bind(port: number, listener: () => void): unknown;
  addMembership(group: string): unknown;
  setMulticastLoopback(enabled: boolean): unknown;
  setMulticastTTL(ttl: number): unknown;
  setBroadcast(enabled: boolean): unknown;
  send(packet: Buffer, port: number, address: string): unknown;
  close(callback?: () => void): void;
}

/** Default socket factory; tests substitute a recording fake through
 * {@link MdnsAdvertiserOptions.createSocket}. */
export function createMdnsSocket(): SocketLike {
  return createSocket({ type: "udp4", reuseAddr: true });
}

export function createMdnsAdvertiser(
  advertisement: MdnsAdvertisement,
  options: MdnsAdvertiserOptions = {},
): MdnsAdvertiser {
  const reportError =
    options.onError ?? ((error: unknown) => console.warn("[poracode] mDNS:", error));
  let socket: SocketLike | null = null;
  let refreshTimer: NodeJS.Timeout | null = null;
  let repeatTimer: NodeJS.Timeout | null = null;
  let stopped = false;

  const sendPacket = (packet: Buffer, address: string): void => {
    if (!socket) return;
    try {
      socket.send(packet, MDNS_PORT, address);
    } catch (error) {
      reportError(error);
    }
  };

  const announce = (address: string): void => {
    const packet = buildMdnsAnnouncementPacket(advertisement);
    sendPacket(packet, address);
    // RFC 6762 section 8.3: repeat the announcement after one second.
    repeatTimer = setTimeout(() => sendPacket(packet, address), ANNOUNCE_REPEAT_DELAY_MS);
    repeatTimer.unref?.();
  };

  return {
    start(): void {
      if (stopped || socket) return;
      try {
        socket = (options.createSocket ?? createMdnsSocket)();
        socket.on("error", (error: unknown) => {
          reportError(error);
        });
        socket.on("message", (packet: Buffer, remote: RemoteInfo) => {
          // Bounded responder: one small answer per service-type query.
          if (parseMdnsServiceQuery(packet)) {
            const response = buildMdnsQueryResponsePacket(advertisement);
            if (socket) {
              try {
                socket.send(response, remote.port, remote.address);
              } catch (error) {
                reportError(error);
              }
            }
          }
        });
        socket.bind(MDNS_PORT, () => {
          if (!socket || stopped) return;
          try {
            socket.addMembership(MDNS_MULTICAST_GROUP);
            socket.setMulticastLoopback(false);
            socket.setMulticastTTL(255);
            socket.setBroadcast(true);
          } catch (error) {
            reportError(error);
          }
          announce(MDNS_MULTICAST_GROUP);
          refreshTimer = setInterval(() => announce(MDNS_MULTICAST_GROUP), REFRESH_INTERVAL_MS);
          refreshTimer.unref?.();
        });
      } catch (error) {
        reportError(error);
        void this.stop();
      }
    },

    stop(): Promise<void> {
      stopped = true;
      if (repeatTimer) {
        clearTimeout(repeatTimer);
        repeatTimer = null;
      }
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      const closing = socket;
      socket = null;
      if (!closing) return Promise.resolve();
      return new Promise((resolve) => {
        try {
          closing.close(() => resolve());
        } catch {
          // Already closed or never bound: stopping is still complete.
          resolve();
        }
      });
    },
  };
}
