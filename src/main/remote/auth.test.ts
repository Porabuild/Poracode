import { describe, expect, it } from "vitest";
import { RemoteHttpError, RemoteAuthStore } from "./auth";

describe("RemoteAuthStore", () => {
  it("exchanges a one-time pairing credential for a bearer token", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({
      scopes: ["session:read"],
      label: "Phone",
    });

    const token = store.exchangePairingCredential({
      credential: pairing.credential,
      client: { label: "Serhii's iPhone", deviceType: "mobile" },
    });

    expect(token.tokenType).toBe("Bearer");
    expect(token.scopes).toEqual(["session:read"]);
    expect(() => store.exchangePairingCredential({ credential: pairing.credential })).toThrow(
      RemoteHttpError,
    );
  });

  it("rejects scopes not granted by the pairing credential", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });

    expect(() =>
      store.exchangePairingCredential({
        credential: pairing.credential,
        scopes: ["session:operate"],
      }),
    ).toThrow(/does not grant/);
  });

  it("issues one-use websocket tickets for authenticated sessions", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({ credential: pairing.credential });
    const ticket = store.issueWebSocketTicket({ accessToken: token.accessToken });

    expect(store.consumeWebSocketTicket(ticket.ticket).scopes).toEqual(["session:read"]);
    expect(() => store.consumeWebSocketTicket(ticket.ticket)).toThrow(RemoteHttpError);
  });

  it("restores access sessions from persisted token hashes", () => {
    let persistedSessions: NonNullable<
      ConstructorParameters<typeof RemoteAuthStore>[0]
    >["accessSessions"] = [];
    const store = new RemoteAuthStore({
      onAccessSessionsChanged: (sessions) => {
        persistedSessions = sessions;
      },
    });
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({ credential: pairing.credential });

    const restored = new RemoteAuthStore({ accessSessions: persistedSessions });

    expect(restored.authenticateBearerToken(token.accessToken, ["session:read"]).scopes).toEqual([
      "session:read",
    ]);
  });

  it("lists and revokes persisted access sessions", () => {
    let persistedSessions: NonNullable<
      ConstructorParameters<typeof RemoteAuthStore>[0]
    >["accessSessions"] = [];
    const store = new RemoteAuthStore({
      onAccessSessionsChanged: (sessions) => {
        persistedSessions = sessions;
      },
    });
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({
      credential: pairing.credential,
      client: { label: "Serhii's iPhone", deviceType: "mobile", os: "iOS" },
    });

    const [session] = store.listAccessSessions();
    expect(session).toMatchObject({
      scopes: ["session:read"],
      client: { label: "Serhii's iPhone", deviceType: "mobile", os: "iOS" },
    });
    expect(session?.id).toBeTruthy();

    expect(store.revokeAccessSession(session!.id)).toBe(true);
    expect(store.listAccessSessions()).toEqual([]);
    expect(persistedSessions).toEqual([]);
    expect(() => store.authenticateBearerToken(token.accessToken, ["session:read"])).toThrow(
      RemoteHttpError,
    );
    expect(store.revokeAccessSession(session!.id)).toBe(false);
  });
});
