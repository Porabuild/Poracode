import { describe, expect, it } from "vitest";
import {
  PORACODE_RELAY_PROTOCOL_VERSION,
  relayRegisterFrameSchema,
  relayRegisteredFrameSchema,
  parseRelayVisitorPath,
  relayPublicUrl,
  relayRequestFrameSchema,
  relayWsOpenFrameSchema,
} from "./relayProtocol";

describe("relayProtocol helpers", () => {
  it("builds a visitor public URL with the /s/<id>/ prefix", () => {
    expect(relayPublicUrl("https://relay.example.com", "srv-1")).toBe(
      "https://relay.example.com/s/srv-1/",
    );
    expect(relayPublicUrl("https://relay.example.com/base/", "a b")).toBe(
      "https://relay.example.com/base/s/a%20b/",
    );
  });

  it("parses /s/<id>/<rest> into serverId + path", () => {
    expect(parseRelayVisitorPath("/s/srv-1/api/snapshot")).toEqual({
      serverId: "srv-1",
      path: "/api/snapshot",
    });
    expect(parseRelayVisitorPath("/s/srv-1")).toEqual({ serverId: "srv-1", path: "/" });
    expect(parseRelayVisitorPath("/s/srv-1/")).toEqual({ serverId: "srv-1", path: "/" });
    expect(parseRelayVisitorPath("/s/a%20b/x")).toEqual({ serverId: "a b", path: "/x" });
  });

  it("rejects non-visitor paths", () => {
    expect(parseRelayVisitorPath("/host")).toBeNull();
    expect(parseRelayVisitorPath("/healthz")).toBeNull();
    expect(parseRelayVisitorPath("/s/")).toBeNull();
    expect(parseRelayVisitorPath("/")).toBeNull();
  });

  it("rejects malformed encoded server ids instead of throwing", () => {
    expect(parseRelayVisitorPath("/s/%E0%A4%A/api/snapshot")).toBeNull();
  });

  describe("visitor clientId on req/ws-open frames", () => {
    const baseReq = { t: "req", id: "r1", method: "GET", path: "/", headers: {} };
    const baseWsOpen = { t: "ws-open", id: "w1", path: "/ws" };

    it("accepts a bounded clientId on req and ws-open frames", () => {
      const clientId = "a".repeat(128);
      expect(relayRequestFrameSchema.safeParse({ ...baseReq, clientId })).toMatchObject({
        success: true,
      });
      expect(relayWsOpenFrameSchema.safeParse({ ...baseWsOpen, clientId })).toMatchObject({
        success: true,
      });
    });

    it("still parses frames without clientId (old relay compatibility)", () => {
      const req = relayRequestFrameSchema.parse(baseReq);
      const wsOpen = relayWsOpenFrameSchema.parse(baseWsOpen);
      expect(req.clientId).toBeUndefined();
      expect(wsOpen.clientId).toBeUndefined();
    });

    it("rejects clientIds beyond the length bound", () => {
      const clientId = "a".repeat(129);
      expect(relayRequestFrameSchema.safeParse({ ...baseReq, clientId }).success).toBe(false);
      expect(relayWsOpenFrameSchema.safeParse({ ...baseWsOpen, clientId }).success).toBe(false);
    });
  });
});

describe("isolated forwarding relay contract", () => {
  const registration = {
    t: "register",
    protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
    serverId: "host-a",
    secret: "relay password",
  };
  const originSecret = Buffer.alloc(32, 1).toString("base64url");
  const forward = {
    forwardId: "01234567-89ab-4cde-8f01-23456789abcd",
    origin: "https://forward.example.test",
  };

  it("rejects old framing instead of silently accepting changed routing semantics", () => {
    expect(
      relayRegisterFrameSchema.safeParse({ ...registration, protocolVersion: 1 }).success,
    ).toBe(false);
    // v2 peers cannot preserve v3's binary ws-data semantics (a v2 relay or
    // host reinterprets binary control traffic as text JSON and corrupts it),
    // so their register literal is rejected instead of silently accepted.
    expect(
      relayRegisterFrameSchema.safeParse({ ...registration, protocolVersion: 2 }).success,
    ).toBe(false);
    expect(relayRegisterFrameSchema.safeParse(registration).success).toBe(true);
  });

  it("accepts only a canonical dedicated origin secret", () => {
    expect(relayRegisterFrameSchema.parse({ ...registration, originSecret }).originSecret).toBe(
      originSecret,
    );
    expect(
      relayRegisterFrameSchema.safeParse({ ...registration, originSecret: "password" }).success,
    ).toBe(false);
    expect(
      relayRegisterFrameSchema.safeParse({ ...registration, originSecret: `${originSecret}=` })
        .success,
    ).toBe(false);
  });

  it("preserves the same origin-bound routing context on HTTP and WS", () => {
    expect(
      relayRequestFrameSchema.parse({
        t: "req",
        id: "r",
        method: "GET",
        path: "/api/data",
        headers: {},
        forward,
      }).forward,
    ).toEqual(forward);
    expect(
      relayWsOpenFrameSchema.parse({ t: "ws-open", id: "w", path: "/ws", forward }).forward,
    ).toEqual(forward);
  });

  it.each([
    "http://forward.example.test",
    "https://user@forward.example.test",
    "https://forward.example.test/path",
    "https://forward.example.test?query=1",
  ])("rejects non-origin routing authorities: %s", (origin) => {
    expect(
      relayWsOpenFrameSchema.safeParse({
        t: "ws-open",
        id: "w",
        path: "/ws",
        forward: { ...forward, origin },
      }).success,
    ).toBe(false);
  });

  it("advertises only canonical policy and bounded owner labels", () => {
    const frame = {
      t: "registered",
      serverId: "host-a",
      publicUrl: "https://relay.example.test/s/host-a/",
      forwardOrigin: { baseUrl: "https://apps.example.test", ownerId: "a".repeat(24) },
    };
    expect(relayRegisteredFrameSchema.parse(frame).forwardOrigin).toEqual(frame.forwardOrigin);
    expect(
      relayRegisteredFrameSchema.safeParse({
        ...frame,
        forwardOrigin: { ...frame.forwardOrigin, ownerId: "chosen.domain" },
      }).success,
    ).toBe(false);
  });
});

it("rejects authority-like paths before the adapter joins them to its fixed local endpoint", () => {
  expect(
    relayRequestFrameSchema.safeParse({
      t: "req",
      id: "r",
      method: "GET",
      path: "@evil.test",
      headers: {},
    }).success,
  ).toBe(false);
  expect(
    relayWsOpenFrameSchema.safeParse({ t: "ws-open", id: "w", path: "@evil.test" }).success,
  ).toBe(false);
});

describe("protocol 3 channel id (binary envelope bound)", () => {
  const wsOpen = (id: string) => relayWsOpenFrameSchema.safeParse({ t: "ws-open", id, path: "/" });

  it("accepts ids the protocol-3 binary envelope can carry", () => {
    expect(wsOpen("channel-a").success).toBe(true);
    expect(wsOpen("01234567-89ab-4cde-8f01-23456789abcd").success).toBe(true);
    expect(wsOpen("a".repeat(128)).success).toBe(true);
    expect(wsOpen("频道-😀").success).toBe(true);
  });

  it("rejects ids beyond 128 UTF-8 bytes — measured in bytes, not UTF-16 units", () => {
    // 129 ASCII chars: 129 UTF-16 units and 129 UTF-8 bytes.
    expect(wsOpen("a".repeat(129)).success).toBe(false);
    // 100 UTF-16 units but 200 UTF-8 bytes: a code-unit `.max(128)` would
    // wrongly accept this, so the bound is checked by the codec itself.
    expect(wsOpen("é".repeat(100)).success).toBe(false);
    // 128 UTF-16 units (the zod `.max` ceiling) but 256 UTF-8 bytes.
    expect(wsOpen("😀".repeat(64)).success).toBe(false);
  });

  it("rejects ids that are not well-formed UTF-8 (lone surrogates)", () => {
    expect(wsOpen("\ud800").success).toBe(false);
    expect(wsOpen(`ok-\udfff-bad`).success).toBe(false);
  });

  it("request-frame ids are a separate protocol and stay unbounded by this rule", () => {
    expect(
      relayRequestFrameSchema.safeParse({
        t: "req",
        id: "é".repeat(100),
        method: "GET",
        path: "/",
        headers: {},
      }).success,
    ).toBe(true);
  });
});
