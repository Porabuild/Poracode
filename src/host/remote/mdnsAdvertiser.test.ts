import { describe, expect, it } from "vitest";
import {
  buildMdnsAnnouncementPacket,
  buildMdnsQueryResponsePacket,
  createMdnsAdvertiser,
  MDNS_MULTICAST_GROUP,
  MDNS_PORT,
  mdnsInstanceLabel,
  mdnsServiceTarget,
  parseMdnsServiceQuery,
  PORACODE_MDNS_SERVICE_TYPE,
  shouldAdvertiseMdns,
  type MdnsAdvertisement,
} from "./mdnsAdvertiser";

const ADVERTISEMENT: MdnsAdvertisement = {
  desktopId: "desktop-1234",
  label: "Work Desk",
  host: "192.168.1.20",
  port: 49152,
  tlsFingerprint: "a".repeat(64),
};

/** An independently written RFC 1035/6762 message walker used to cross-check
 * the builder (never imported from the module). */
interface ParsedRecord {
  readonly name: string;
  readonly type: number;
  readonly classField: number;
  readonly ttlSeconds: number;
  readonly rdata: Buffer;
}

interface ParsedMessage {
  readonly isResponse: boolean;
  readonly isAuthoritative: boolean;
  readonly answers: ParsedRecord[];
}

function parseName(packet: Buffer, offset: number): { name: string; next: number } {
  const labels: string[] = [];
  let cursor = offset;
  while (cursor < packet.length) {
    const length = packet[cursor]!;
    cursor += 1;
    if (length === 0) break;
    labels.push(packet.subarray(cursor, cursor + length).toString("utf8"));
    cursor += length;
  }
  return { name: labels.join("."), next: cursor };
}

function parseMessage(packet: Buffer): ParsedMessage {
  const flags = packet.readUInt16BE(2);
  const answerCount = packet.readUInt16BE(6);
  let cursor = 12;
  const answers: ParsedRecord[] = [];
  for (let index = 0; index < answerCount; index += 1) {
    const name = parseName(packet, cursor);
    cursor = name.next;
    const type = packet.readUInt16BE(cursor);
    const classField = packet.readUInt16BE(cursor + 2);
    const ttl = packet.readUInt32BE(cursor + 4);
    const rdlength = packet.readUInt16BE(cursor + 8);
    const rdata = packet.subarray(cursor + 10, cursor + 10 + rdlength);
    cursor += 10 + rdlength;
    answers.push({ name: name.name, type, classField, ttlSeconds: ttl, rdata });
  }
  return {
    isResponse: (flags & 0x8000) !== 0,
    isAuthoritative: (flags & 0x0400) !== 0,
    answers,
  };
}

function srvRdataField(record: ParsedRecord, offset: number): number {
  return record.rdata.readUInt16BE(offset);
}

function txtEntries(record: ParsedRecord): string[] {
  const entries: string[] = [];
  let cursor = 0;
  while (cursor < record.rdata.length) {
    const length = record.rdata[cursor]!;
    entries.push(record.rdata.subarray(cursor + 1, cursor + 1 + length).toString("utf8"));
    cursor += 1 + length;
  }
  return entries;
}

describe("mDNS advertisement packet", () => {
  it("carries the full DNS-SD record set with the fingerprint TXT", () => {
    const packet = buildMdnsAnnouncementPacket(ADVERTISEMENT);
    const message = parseMessage(packet);
    expect(message.isResponse).toBe(true);
    expect(message.isAuthoritative).toBe(true);
    expect(message.answers).toHaveLength(4);

    const [ptr, srv, txt, a] = message.answers;
    // PTR: shared record (no cache-flush) under the Poracode service type.
    expect(ptr!.name).toBe(PORACODE_MDNS_SERVICE_TYPE);
    expect(ptr!.type).toBe(12);
    expect(ptr!.classField).toBe(0x0001);
    expect(ptr!.ttlSeconds).toBe(4500);
    expect(parseName(ptr!.rdata, 0).name).toBe("Work Desk desktop1._poracode._tcp.local");

    // SRV: unique record (cache-flush) with the advertised port.
    expect(srv!.name).toBe("Work Desk desktop1._poracode._tcp.local");
    expect(srv!.type).toBe(33);
    expect(srv!.classField & 0x8000).toBe(0x8000);
    expect(srv!.ttlSeconds).toBe(4500);
    expect(srvRdataField(srv!, 0)).toBe(0); // priority
    expect(srvRdataField(srv!, 2)).toBe(0); // weight
    expect(srvRdataField(srv!, 4)).toBe(49152);
    expect(parseName(srv!.rdata, 6).name).toBe("poracode-desktop-1234.local");

    // TXT: identity + certificate fingerprint for pin-on-first-connect.
    expect(txt!.type).toBe(16);
    expect(txtEntries(txt!)).toEqual([
      "id=desktop-1234",
      `fp=sha256:${ADVERTISEMENT.tlsFingerprint}`,
    ]);

    // A: the address record for the synthetic target, short TTL.
    expect(a!.name).toBe("poracode-desktop-1234.local");
    expect(a!.type).toBe(1);
    expect([...a!.rdata]).toEqual([192, 168, 1, 20]);
    expect(a!.ttlSeconds).toBe(120);
  });

  it("is byte-stable for a fixed advertisement", () => {
    // Golden fixture: the packet bytes are pinned so any encoding drift (field
    // order, TTLs, class bits, name compression) fails the suite. Hand-verified
    // against RFC 1035/6762 field by field (header flags 0x8400, ANCOUNT 4,
    // PTR class IN + TTL 4500, SRV cache-flush + port 49152, TXT id/fp, A TTL
    // 120 for 192.168.1.20).
    const packet = buildMdnsAnnouncementPacket(ADVERTISEMENT);
    expect(packet.toString("hex")).toBe(
      "000084000000000400000000095f706f7261636f6465045f746370056c6f63616c00000c000100001194002912576f726b204465736b206465736b746f7031095f706f7261636f6465045f746370056c6f63616c0012576f726b204465736b206465736b746f7031095f706f7261636f6465045f746370056c6f63616c000021800100001194002300000000c00015706f7261636f64652d6465736b746f702d31323334056c6f63616c0012576f726b204465736b206465736b746f7031095f706f7261636f6465045f746370056c6f63616c000010800100001194005b0f69643d6465736b746f702d313233344a66703d7368613235363a6161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616115706f7261636f64652d6465736b746f702d31323334056c6f63616c0000018001000000780004c0a80114",
    );
  });

  it("builds the same record set for a hostname target without an A record", () => {
    const packet = buildMdnsAnnouncementPacket({
      ...ADVERTISEMENT,
      host: "machine.tailnet.ts.net",
    });
    const message = parseMessage(packet);
    expect(message.answers.map((record) => record.type)).toEqual([12, 33, 16]);
    const srv = message.answers[1]!;
    expect(parseName(srv.rdata, 6).name).toBe("machine.tailnet.ts.net");
  });

  it("responds to a service-type query with the same record set", () => {
    const packet = buildMdnsQueryResponsePacket(ADVERTISEMENT);
    expect(parseMessage(packet).answers).toHaveLength(4);
  });
});

/** Builds a query packet from raw bytes (independent of the builder). */
function buildQuery(type: number, quBit: boolean): Buffer {
  const questionName = Buffer.concat([
    Buffer.from([9]),
    Buffer.from("_poracode"),
    Buffer.from([4]),
    Buffer.from("_tcp"),
    Buffer.from([5]),
    Buffer.from("local"),
    Buffer.from([0]),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x1234, 0); // a legacy query ID (mDNS ignores it)
  header.writeUInt16BE(0x0000, 2); // QR=0, one question
  header.writeUInt16BE(1, 4);
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(type, 0);
  tail.writeUInt16BE(quBit ? 0x8001 : 0x0001, 2);
  return Buffer.concat([header, questionName, tail]);
}

describe("mDNS query responder", () => {
  it("recognizes the Poracode PTR and ANY questions", () => {
    expect(parseMdnsServiceQuery(buildQuery(12, false))).toEqual({
      name: PORACODE_MDNS_SERVICE_TYPE,
      type: 12,
      wantsUnicastResponse: false,
    });
    expect(parseMdnsServiceQuery(buildQuery(255, true))?.wantsUnicastResponse).toBe(true);
  });

  it("ignores responses, empty questions, and foreign service types", () => {
    const foreign = buildQuery(12, false);
    foreign.set(Buffer.from([4]), 12); // "_poracode" -> length-prefixed junk-free rename
    foreign.subarray(12).writeUInt8(6, 0);
    foreign.write("_other", 13, "utf8");
    foreign.writeUInt16BE(1, 2); // QR=1 -> response
    expect(parseMdnsServiceQuery(foreign)).toBeNull();
    expect(parseMdnsServiceQuery(Buffer.alloc(0))).toBeNull();

    const discovery = buildQuery(12, false);
    discovery.writeUInt16BE(0, 4); // QDCOUNT=0
    expect(parseMdnsServiceQuery(discovery)).toBeNull();
  });

  it("answers a live query on the socket with a unicast response", () => {
    const sent: Array<{ packet: Buffer; port: number; address: string }> = [];
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = {
      on(event: string, listener: (payload: never) => void) {
        handlers.set(event, listener as (...args: unknown[]) => void);
      },
      bind(port: number, listener: () => void) {
        listener();
      },
      addMembership(group: string) {
        expect(group).toBe(MDNS_MULTICAST_GROUP);
      },
      setMulticastLoopback() {},
      setMulticastTTL() {},
      setBroadcast() {},
      send(packet: Buffer, port: number, address: string) {
        sent.push({ packet, port, address });
      },
      close() {},
    };
    const advertiser = createMdnsAdvertiser(ADVERTISEMENT, {
      createSocket: () => socket as never,
    });
    advertiser.start();
    // The announcement went to the multicast group on port 5353.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.address).toBe(MDNS_MULTICAST_GROUP);
    expect(sent[0]!.port).toBe(MDNS_PORT);

    const query = buildQuery(12, false);
    handlers.get("message")?.(query, { address: "192.168.1.9", port: 53001 });
    const unicast = sent[1]!;
    expect(unicast.address).toBe("192.168.1.9");
    expect(unicast.port).toBe(53001);
    expect(parseMessage(unicast.packet).answers).toHaveLength(4);

    // A foreign query triggers nothing.
    handlers.get("message")?.(Buffer.alloc(0), { address: "192.168.1.9", port: 53001 });
    expect(sent).toHaveLength(2);
    void advertiser.stop();
  });
});

describe("mDNS advertise decision", () => {
  it("advertises only TLS-configured lan/tailnet binds", () => {
    expect(shouldAdvertiseMdns({ mode: "lan", tlsConfigured: true }).advertise).toBe(true);
    expect(shouldAdvertiseMdns({ mode: "tailnet", tlsConfigured: true }).advertise).toBe(true);
    expect(shouldAdvertiseMdns({ mode: "loopback", tlsConfigured: true }).advertise).toBe(false);
    expect(shouldAdvertiseMdns({ mode: "lan", tlsConfigured: false }).advertise).toBe(false);
    expect(shouldAdvertiseMdns({ mode: "tailnet", tlsConfigured: false }).advertise).toBe(false);
  });

  it("the environment override wins in both directions", () => {
    expect(
      shouldAdvertiseMdns({
        mode: "loopback",
        tlsConfigured: true,
        env: { PORACODE_REMOTE_MDNS: "1" },
      }).advertise,
    ).toBe(true);
    expect(
      shouldAdvertiseMdns({ mode: "lan", tlsConfigured: true, env: { PORACODE_REMOTE_MDNS: "0" } })
        .advertise,
    ).toBe(false);
    // Forcing cannot advertise a plaintext listener: there is no fingerprint.
    expect(
      shouldAdvertiseMdns({ mode: "lan", tlsConfigured: false, env: { PORACODE_REMOTE_MDNS: "1" } })
        .advertise,
    ).toBe(false);
  });
});

describe("mDNS naming", () => {
  it("strips label separators and bounds the instance label", () => {
    expect(mdnsInstanceLabel("desktop-1234", "Work Desk")).toBe("Work Desk desktop1");
    expect(mdnsInstanceLabel("desktop-1234", "a.".repeat(60))).not.toContain(".");
    expect(
      Buffer.byteLength(mdnsInstanceLabel("desktop-1234", "長".repeat(60))),
    ).toBeLessThanOrEqual(63);
    expect(mdnsInstanceLabel("desktop-1234", "ctrl\u0007char")).toBe("ctrlchar desktop1");
  });

  it("builds a stable, name-safe service target", () => {
    expect(mdnsServiceTarget("Desktop_1234")).toBe("poracode-desktop1234.local");
    expect(mdnsServiceTarget("X").length).toBeLessThan(64);
  });
});
