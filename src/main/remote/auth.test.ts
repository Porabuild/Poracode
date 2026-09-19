import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REMOTE_ACCESS_SCOPE_PRESETS,
  REMOTE_OPERATOR_SCOPES,
  REMOTE_STANDARD_SCOPES,
  REMOTE_VIEWER_SCOPES,
  isRemoteAccessScopePreset,
  remoteAccessScopesForPreset,
} from "@/shared/remote";
import {
  RemoteHttpError,
  RemoteAuthStore,
  parseBearerAuthorizationHeader,
  remoteAuthFilePath,
  writeRemoteAccessSessions,
} from "./auth";

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

  it("defaults the pairing grant to the operator preset (Gate 6 item 4.3)", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential();

    expect(pairing.scopes).toEqual(REMOTE_OPERATOR_SCOPES);
    expect(pairing.scopes).toEqual(REMOTE_STANDARD_SCOPES);

    // An exchange that names no scopes inherits the credential's grant.
    const token = store.exchangePairingCredential({ credential: pairing.credential });
    expect(token.scopes).toEqual(REMOTE_OPERATOR_SCOPES);
  });

  it("issues viewer-preset pairings limited to read scopes (Gate 6 item 4.3)", () => {
    const store = new RemoteAuthStore();
    const viewer = store.issuePairingCredential({ scopes: REMOTE_VIEWER_SCOPES });

    expect(REMOTE_VIEWER_SCOPES).toEqual(["session:read", "terminal:read"]);
    // Narrowing requests are honored…
    expect(
      store.exchangePairingCredential({
        credential: viewer.credential,
        scopes: ["session:read"],
      }).scopes,
    ).toEqual(["session:read"]);

    // …and an omitted request inherits exactly the viewer grant…
    const viewerAgain = store.issuePairingCredential({ scopes: REMOTE_VIEWER_SCOPES });
    expect(store.exchangePairingCredential({ credential: viewerAgain.credential }).scopes).toEqual(
      REMOTE_VIEWER_SCOPES,
    );

    // …but the grant ceiling is never widenable, not even to one extra scope.
    const third = store.issuePairingCredential({ scopes: REMOTE_VIEWER_SCOPES });
    expect(() =>
      store.exchangePairingCredential({
        credential: third.credential,
        scopes: [...REMOTE_VIEWER_SCOPES, "session:operate"],
      }),
    ).toThrow(/does not grant/);
  });

  it("exposes disjoint operator/viewer presets", () => {
    expect(REMOTE_ACCESS_SCOPE_PRESETS.operator).toEqual(REMOTE_STANDARD_SCOPES);
    for (const scope of REMOTE_VIEWER_SCOPES) {
      expect(REMOTE_STANDARD_SCOPES).toContain(scope);
    }
    expect(remoteAccessScopesForPreset("viewer")).toEqual(REMOTE_VIEWER_SCOPES);
    expect(remoteAccessScopesForPreset("operator")).toEqual(REMOTE_OPERATOR_SCOPES);
    expect(isRemoteAccessScopePreset("viewer")).toBe(true);
    expect(isRemoteAccessScopePreset("sewer")).toBe(false);
  });

  it("can retire an unconsumed pairing credential", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential();

    expect(store.revokePairingCredential(pairing.credential)).toBe(true);
    expect(store.revokePairingCredential(pairing.credential)).toBe(false);
    expect(() => store.exchangePairingCredential({ credential: pairing.credential })).toThrow(
      RemoteHttpError,
    );
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

  // POSIX-only: Windows does not honor the 0o600 mode bits (stat reports 0o666).
  it.skipIf(process.platform === "win32")(
    "writes persisted access sessions with owner-only permissions",
    () => {
      const baseDir = mkdtempSync(join(tmpdir(), "lc-remote-auth-"));
      try {
        writeRemoteAccessSessions(baseDir, []);

        expect(statSync(remoteAuthFilePath(baseDir)).mode & 0o777).toBe(0o600);
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    },
  );

  it("parses bearer authorization schemes case-insensitively", () => {
    expect(parseBearerAuthorizationHeader("Bearer lc_access_token")).toBe("lc_access_token");
    expect(parseBearerAuthorizationHeader("bearer lc_access_token")).toBe("lc_access_token");
    expect(parseBearerAuthorizationHeader("BEARER lc_access_token")).toBe("lc_access_token");
    expect(parseBearerAuthorizationHeader("  Bearer   lc_access_token  ")).toBe("lc_access_token");
    expect(parseBearerAuthorizationHeader("Bearer")).toBeNull();
    expect(parseBearerAuthorizationHeader("Bearer   ")).toBeNull();
    expect(parseBearerAuthorizationHeader("Basic lc_access_token")).toBeNull();
  });
});
