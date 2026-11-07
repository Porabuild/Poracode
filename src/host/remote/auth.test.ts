import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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
  RefreshTokenReuseError,
  RemoteAuthStore,
  MANAGED_RENDERER_ACCESS_TTL_MS,
  createPersistentRemoteAuthStore,
  parseBearerAuthorizationHeader,
  readRemoteAccessAuthFile,
  remoteAuthFilePath,
  writeRemoteAccessAuthFile,
  type PersistedRemoteAuthFile,
} from "./auth";

describe("RemoteAuthStore", () => {
  it("retains legacy credentials and persists connection time through refresh and restart", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "poracode-auth-presence-"));
    try {
      const original = createPersistentRemoteAuthStore(baseDir);
      const grant = original.issuePairingCredential();
      const token = original.exchangePairingCredential({ credential: grant.credential });
      const [legacy] = readRemoteAccessAuthFile(baseDir).accessSessions;
      expect(legacy).not.toHaveProperty("lastConnectedAtMs");
      const upgraded = createPersistentRemoteAuthStore(baseDir);
      expect(upgraded.listAccessSessions()[0]).not.toHaveProperty("lastConnectedAt");
      const session = upgraded.authenticateBearerToken(token.accessToken);
      upgraded.markSessionConnected(session.sessionId);
      const lastConnectedAt = upgraded.listAccessSessions()[0]?.lastConnectedAt;
      expect(lastConnectedAt).toBeTruthy();
      const refreshed = upgraded.refreshAccessToken({ refreshToken: token.refreshToken! });
      const restarted = createPersistentRemoteAuthStore(baseDir);
      expect(restarted.authenticateBearerToken(refreshed.accessToken).sessionId).toBe(
        session.sessionId,
      );
      expect(restarted.listAccessSessions()[0]?.lastConnectedAt).toBe(lastConnectedAt);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

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

  it.each(["revoke retry", "another session write"])(
    "keeps failed revocations retryable until persisted by %s",
    (flush) => {
      const baseDir = mkdtempSync(join(tmpdir(), "poracode-revoke-retry-"));
      try {
        let failWrites = false;
        const store = new RemoteAuthStore({
          onPersistedStateChanged: (state) => {
            if (failWrites) throw new Error("EBUSY: auth write failed");
            writeRemoteAccessAuthFile(baseDir, state);
          },
        });
        const token = store.exchangePairingCredential({
          credential: store.issuePairingCredential().credential,
        });
        const other = store.exchangePairingCredential({
          credential: store.issuePairingCredential().credential,
        });
        failWrites = true;
        expect(() => store.revokeAccessSession(token.sessionId!)).toThrow("EBUSY");
        expect(store.listAccessSessions().map((session) => session.id)).toContain(token.sessionId);
        expect(() => store.authenticateBearerToken(token.accessToken)).toThrow(RemoteHttpError);
        expect(() => store.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
          RemoteHttpError,
        );

        failWrites = false;
        let persisted = true;
        if (flush === "revoke retry") persisted = store.revokeAccessSession(token.sessionId!);
        else store.markSessionConnected(other.sessionId!);
        expect(persisted).toBe(true);
        expect(store.listAccessSessions().map((session) => session.id)).not.toContain(
          token.sessionId,
        );
        const restarted = createPersistentRemoteAuthStore(baseDir);
        expect(() => restarted.authenticateBearerToken(token.accessToken)).toThrow(RemoteHttpError);
        expect(() => restarted.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
          RemoteHttpError,
        );
        expect(restarted.authenticateBearerToken(other.accessToken).sessionId).toBe(
          other.sessionId,
        );
        expect(store.revokeAccessSession(token.sessionId!)).toBe(false);
      } finally {
        rmSync(baseDir, { recursive: true, force: true });
      }
    },
  );

  // POSIX-only: Windows does not honor the 0o600 mode bits (stat reports 0o666).
  it.skipIf(process.platform === "win32")(
    "writes persisted access sessions with owner-only permissions",
    () => {
      const baseDir = mkdtempSync(join(tmpdir(), "lc-remote-auth-"));
      try {
        writeRemoteAccessAuthFile(baseDir, { accessSessions: [], revokedTokenHashes: [] });

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

  // Gate 6 item 4.6 (S6): the token lifecycle. Access tokens are 24-hour;
  // refresh tokens carry the 30-day lifetime, rotate on use, and both halves
  // die at revocation.
  it("issues short-lived access tokens with a long-lived refresh token", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });

    const before = Date.now();
    const token = store.exchangePairingCredential({ credential: pairing.credential });

    expect(token.refreshToken).toBeTruthy();
    expect(token.refreshTokenExpiresAt).toBeTruthy();
    const accessTtl = new Date(token.expiresAt).getTime() - before;
    const refreshTtl = new Date(token.refreshTokenExpiresAt!).getTime() - before;
    // The access window is hours, the refresh window is ~a month. `before`
    // predates the store's own clock read, so allow a few seconds of
    // scheduling slack above the exact TTL.
    expect(accessTtl).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5_000);
    expect(accessTtl).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(refreshTtl).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(token.refreshToken).not.toBe(token.accessToken);
  });

  it("refreshes access tokens and rotates the refresh token on every use", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({ credential: pairing.credential });

    const refreshed = store.refreshAccessToken({ refreshToken: token.refreshToken! });
    expect(refreshed.accessToken).not.toBe(token.accessToken);
    expect(refreshed.refreshToken).toBeTruthy();
    expect(refreshed.refreshToken).not.toBe(token.refreshToken);
    expect(refreshed.scopes).toEqual(["session:read"]);
    // The rotated-out refresh token is dead on its next use…
    expect(() => store.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
      RemoteHttpError,
    );
    // …and the new pair authenticates.
    expect(store.authenticateBearerToken(refreshed.accessToken, ["session:read"]).scopes).toEqual([
      "session:read",
    ]);
    const again = store.refreshAccessToken({ refreshToken: refreshed.refreshToken! });
    expect(again.refreshToken).toBeTruthy();
  });

  it("signals refresh reuse with the session family id so the caller can revoke it", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({ credential: pairing.credential });
    const refreshed = store.refreshAccessToken({ refreshToken: token.refreshToken! });
    const [session] = store.listAccessSessions();

    let caught: unknown;
    try {
      store.refreshAccessToken({ refreshToken: token.refreshToken! });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RefreshTokenReuseError);
    expect((caught as RefreshTokenReuseError).sessionId).toBe(session!.id);
    expect((caught as RefreshTokenReuseError).code).toBe("refresh_token_reused");
    // The store leaves revocation to the caller so WebSocket teardown shares
    // the one revoke path.
    expect(store.authenticateBearerToken(refreshed.accessToken, ["session:read"]).sessionId).toBe(
      session!.id,
    );
    expect(store.revokeAccessSession(session!.id)).toBe(true);
    expect(() => store.authenticateBearerToken(refreshed.accessToken, ["session:read"])).toThrow(
      RemoteHttpError,
    );
    expect(() => store.refreshAccessToken({ refreshToken: refreshed.refreshToken! })).toThrow(
      RemoteHttpError,
    );
  });

  it("keeps the presented pair and records no predecessor when the rotation cannot be persisted", () => {
    let failWrites = false;
    const writes = vi.fn<(state: PersistedRemoteAuthFile) => void>(() => {
      if (failWrites) throw new Error("EBUSY: simulated auth file write failure");
    });
    const store = new RemoteAuthStore({ onPersistedStateChanged: writes });
    const token = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    const [pairedRow] = writes.mock.lastCall![0].accessSessions;

    failWrites = true;
    expect(() => store.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
      "simulated auth file write failure",
    );
    failWrites = false;

    // The client never received a successor, so the pair it holds still works…
    expect(store.authenticateBearerToken(token.accessToken).sessionId).toBe(token.sessionId);
    // …and the next durable write carries the original row with no predecessor
    // recorded, so a restart cannot turn the retry into reuse either.
    store.markSessionConnected(token.sessionId!);
    const persisted = writes.mock.lastCall![0];
    expect(persisted.accessSessions).toHaveLength(1);
    expect(persisted.accessSessions[0]).toMatchObject({
      tokenHash: pairedRow!.tokenHash,
      refreshTokenHash: pairedRow!.refreshTokenHash,
    });
    expect(persisted.rotatedRefreshHashes).toEqual([]);

    // Retrying with the same refresh token is an ordinary rotation…
    const retried = store.refreshAccessToken({ refreshToken: token.refreshToken! });
    expect(retried.sessionId).toBe(token.sessionId);
    expect(store.authenticateBearerToken(retried.accessToken).sessionId).toBe(token.sessionId);
    expect(writes.mock.lastCall![0].rotatedRefreshHashes).toHaveLength(1);
    // …after which presenting the rotated-out token is still reuse.
    expect(() => store.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
      RefreshTokenReuseError,
    );
  });

  it("rejects unknown refresh tokens", () => {
    const store = new RemoteAuthStore();
    expect(() => store.refreshAccessToken({ refreshToken: "lc_refresh_bogus" })).toThrow(
      RemoteHttpError,
    );
  });

  it("rejects both the access and the refresh token after revocation", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({ credential: pairing.credential });
    const [session] = store.listAccessSessions();

    expect(store.revokeAccessSession(session!.id)).toBe(true);
    expect(() => store.authenticateBearerToken(token.accessToken, ["session:read"])).toThrow(
      /Invalid access token/,
    );
    // The refresh half dies with the session — a stolen refresh token cannot
    // outlive a revoke.
    expect(() => store.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
      RemoteHttpError,
    );
  });

  it("persists revocations and refresh hashes across a restart of the store", () => {
    let persisted: ReturnType<typeof readRemoteAccessAuthFile> = {
      accessSessions: [],
      revokedTokenHashes: [],
    };
    const baseDir = mkdtempSync(join(tmpdir(), "lc-remote-auth-refresh-"));
    try {
      const store = new RemoteAuthStore({
        onPersistedStateChanged: (state) => {
          persisted = state;
          writeRemoteAccessAuthFile(baseDir, state);
        },
      });
      const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
      const token = store.exchangePairingCredential({ credential: pairing.credential });
      const [session] = store.listAccessSessions();
      store.revokeAccessSession(session!.id);

      // A fresh store (simulated restart) reads the same file.
      const restarted = new RemoteAuthStore({
        accessSessions: readRemoteAccessAuthFile(baseDir).accessSessions,
        revokedTokenHashes: readRemoteAccessAuthFile(baseDir).revokedTokenHashes,
      });
      expect(() => restarted.authenticateBearerToken(token.accessToken, ["session:read"])).toThrow(
        RemoteHttpError,
      );
      expect(() => restarted.refreshAccessToken({ refreshToken: token.refreshToken! })).toThrow(
        RemoteHttpError,
      );
      expect(persisted.revokedTokenHashes.length).toBeGreaterThan(0);
      // No raw credentials on disk — only hashes.
      const raw = readFileSync(remoteAuthFilePath(baseDir), "utf8");
      expect(raw.includes(token.accessToken)).toBe(false);
      expect(raw.includes(token.refreshToken!)).toBe(false);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("restores legacy (pre-refresh) persisted sessions without refresh fields", () => {
    // The exact persisted shape a Gate-6-pre-4.6 host wrote: long-lived access
    // token, no refresh fields. It must keep authenticating untouched.
    const legacySession = {
      id: "legacy-session",
      tokenHash: "aa".repeat(32),
      scopes: ["session:read" as const],
      issuedAtMs: Date.now() - 1000,
      expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    const store = new RemoteAuthStore({ accessSessions: [legacySession] });
    expect(store.listAccessSessions()).toHaveLength(1);
  });

  it("reports a session's live access deadline across refresh and revocation", () => {
    const store = new RemoteAuthStore();
    const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
    const token = store.exchangePairingCredential({ credential: pairing.credential, ttlMs: 250 });
    const sessionId = token.sessionId!;
    expect(store.accessSessionExpiresAtMs(sessionId)).toBe(new Date(token.expiresAt).getTime());

    const refreshed = store.refreshAccessToken({
      refreshToken: token.refreshToken!,
      accessTtlMs: 60_000,
    });
    expect(refreshed.sessionId).toBe(sessionId);
    expect(store.accessSessionExpiresAtMs(sessionId)).toBe(new Date(refreshed.expiresAt).getTime());

    expect(store.revokeAccessSession(sessionId)).toBe(true);
    expect(store.accessSessionExpiresAtMs(sessionId)).toBeNull();
  });

  it("keeps an ephemeral session out of the persisted state through exchange, refresh and revoke", () => {
    const writes = vi.fn<(state: PersistedRemoteAuthFile) => void>();
    const store = new RemoteAuthStore({ onPersistedStateChanged: writes });

    const ephemeral = store.exchangePairingCredential({
      credential: store.issuePairingCredential({
        scopes: ["session:read"],
        ephemeral: true,
      }).credential,
      client: { label: "Poracode desktop", deviceType: "desktop" },
    });
    // A memory-only exchange changes nothing the file carries: not even an
    // empty session list is written.
    expect(writes).not.toHaveBeenCalled();

    const durable = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(writes.mock.lastCall![0].accessSessions.map((session) => session.id)).toEqual([
      durable.sessionId,
    ]);

    expect(store.authenticateBearerToken(ephemeral.accessToken).sessionId).toBe(
      ephemeral.sessionId,
    );
    const refreshed = store.refreshAccessToken({ refreshToken: ephemeral.refreshToken! });
    expect(store.authenticateBearerToken(refreshed.accessToken).sessionId).toBe(
      ephemeral.sessionId,
    );
    // A rotated ephemeral session still never reaches the file.
    expect(writes).toHaveBeenCalledTimes(1);

    expect(store.revokeAccessSession(ephemeral.sessionId!)).toBe(true);
    expect(writes).toHaveBeenCalledTimes(1);
    const persisted = writes.mock.lastCall![0];
    expect(persisted.accessSessions.map((session) => session.id)).toEqual([durable.sessionId]);
    // Neither the retired refresh hash nor the revocation reached the file.
    expect(persisted.rotatedRefreshHashes).toEqual([]);
    expect(persisted.revokedTokenHashes).toEqual([]);
    expect(() => store.authenticateBearerToken(refreshed.accessToken)).toThrow(RemoteHttpError);
    expect(() => store.refreshAccessToken({ refreshToken: refreshed.refreshToken! })).toThrow(
      RemoteHttpError,
    );
  });

  it("keeps an ephemeral rotation for in-process reuse detection but persists only durable ones", () => {
    const writes = vi.fn<(state: PersistedRemoteAuthFile) => void>();
    const store = new RemoteAuthStore({ onPersistedStateChanged: writes });

    const ephemeral = store.exchangePairingCredential({
      credential: store.issuePairingCredential({
        scopes: ["session:read"],
        ephemeral: true,
      }).credential,
    });
    const retiredEphemeralRefresh = ephemeral.refreshToken!;
    expect(store.refreshAccessToken({ refreshToken: retiredEphemeralRefresh }).sessionId).toBe(
      ephemeral.sessionId,
    );

    // Reuse inside this process still carries the session family id, exactly
    // like a durable rotation, so the caller can revoke it.
    let caught: unknown;
    try {
      store.refreshAccessToken({ refreshToken: retiredEphemeralRefresh });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RefreshTokenReuseError);
    expect((caught as RefreshTokenReuseError).sessionId).toBe(ephemeral.sessionId);
    expect(writes).not.toHaveBeenCalled();

    // A durable rotation is still recorded for the next host process, and the
    // ephemeral one never rides along in that write.
    const durable = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    store.refreshAccessToken({ refreshToken: durable.refreshToken! });
    const persisted = writes.mock.lastCall![0];
    expect(persisted.rotatedRefreshHashes).toHaveLength(1);
    expect(persisted.rotatedRefreshHashes![0]!.sessionId).toBe(durable.sessionId);
    expect(
      persisted.rotatedRefreshHashes!.some((entry) => entry.sessionId === ephemeral.sessionId),
    ).toBe(false);
  });

  it("rejects an ephemeral session after a restart of the store", () => {
    let persisted: ReturnType<typeof readRemoteAccessAuthFile> = {
      accessSessions: [],
      revokedTokenHashes: [],
    };
    const store = new RemoteAuthStore({
      onPersistedStateChanged: (state) => {
        persisted = state;
      },
    });
    const ephemeral = store.exchangePairingCredential({
      credential: store.issuePairingCredential({
        scopes: ["session:read"],
        ephemeral: true,
      }).credential,
    });
    const refreshed = store.refreshAccessToken({ refreshToken: ephemeral.refreshToken! });
    const durable = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });

    const restarted = new RemoteAuthStore({ accessSessions: persisted.accessSessions });
    expect(() => restarted.authenticateBearerToken(refreshed.accessToken)).toThrow(RemoteHttpError);
    expect(() => restarted.refreshAccessToken({ refreshToken: refreshed.refreshToken! })).toThrow(
      RemoteHttpError,
    );
    expect(restarted.authenticateBearerToken(durable.accessToken).sessionId).toBe(
      durable.sessionId,
    );
    expect(restarted.listAccessSessions().map((session) => session.id)).toEqual([
      durable.sessionId,
    ]);
  });

  it("keeps pre-upgrade managed-desktop sessions that carry no ephemeral marker", () => {
    let persisted: ReturnType<typeof readRemoteAccessAuthFile> = {
      accessSessions: [],
      revokedTokenHashes: [],
    };
    const store = new RemoteAuthStore({
      onPersistedStateChanged: (state) => {
        persisted = state;
      },
    });
    // The previous version's file: a managed-desktop row with no marker, plus
    // another client. Both are real durable sessions and must stay that way.
    const managed = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
      client: { label: "Poracode desktop", deviceType: "desktop" },
    });
    const other = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
      client: { label: "Phone", deviceType: "mobile" },
    });
    const previousIds = [managed.sessionId!, other.sessionId!].sort();
    expect(persisted.accessSessions.map((session) => session.id).sort()).toEqual(previousIds);
    for (const session of persisted.accessSessions) {
      expect(session).not.toHaveProperty("ephemeral");
    }

    let rewritten: ReturnType<typeof readRemoteAccessAuthFile> = {
      accessSessions: [],
      revokedTokenHashes: [],
    };
    const upgraded = new RemoteAuthStore({
      accessSessions: persisted.accessSessions,
      onPersistedStateChanged: (state) => {
        rewritten = state;
      },
    });
    expect(upgraded.authenticateBearerToken(managed.accessToken).sessionId).toBe(managed.sessionId);
    expect(upgraded.authenticateBearerToken(other.accessToken).sessionId).toBe(other.sessionId);
    upgraded.markSessionConnected(managed.sessionId!);
    expect(rewritten.accessSessions.map((session) => session.id).sort()).toEqual(previousIds);
  });

  it("warns a refused bearer with the failure reason and a hash prefix, throttled", () => {
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new RemoteAuthStore();
    const token = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
      ttlMs: 0,
    });
    const hashPrefix = createHash("sha256").update(token.accessToken).digest("hex").slice(0, 12);

    // Expired: the reason names the deadline failure, and the id is only the
    // hash prefix — never the token value.
    expect(() => store.authenticateBearerToken(token.accessToken)).toThrow("Invalid access token");
    expect(warns).toHaveBeenCalledTimes(1);
    expect(warns.mock.lastCall![0]).toContain("expired");
    expect(warns.mock.lastCall![0]).toContain(hashPrefix);
    expect(warns.mock.lastCall![0]).not.toContain(token.accessToken);

    // A retry storm stays throttled: no second line inside the interval.
    expect(() => store.authenticateBearerToken(token.accessToken)).toThrow("Invalid access token");
    expect(warns).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();

    // An unknown token says so — the server-side session state was rebuilt
    // while the client kept presenting its bearer.
    const warnsLater = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => new RemoteAuthStore().authenticateBearerToken(token.accessToken)).toThrow(
      "Invalid access token",
    );
    expect(warnsLater).toHaveBeenCalledTimes(1);
    expect(warnsLater.mock.lastCall![0]).toContain("unknown_token");
    vi.restoreAllMocks();
  });

  it("yields the grant's extended access TTL for a managed renderer exchange", () => {
    const store = new RemoteAuthStore();
    const managed = store.exchangePairingCredential({
      credential: store.issuePairingCredential({
        scopes: ["session:read"],
        ephemeral: true,
        sessionTtlMs: MANAGED_RENDERER_ACCESS_TTL_MS,
      }).credential,
    });
    // The co-located window's session outlives any realistic host uptime: no
    // renewal ladder, no expiry close mid-session (the session is memory-only
    // and dies with the host process anyway).
    expect(Date.parse(managed.expiresAt)).toBeGreaterThan(
      Date.now() + MANAGED_RENDERER_ACCESS_TTL_MS - 60_000,
    );
    // A grant without the extension keeps the 24-hour default.
    const daily = store.exchangePairingCredential({
      credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    expect(Date.parse(daily.expiresAt)).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  });

  it("re-arms the grant's TTL, not the daily default, when a managed session rotates", () => {
    const store = new RemoteAuthStore();
    const managed = store.exchangePairingCredential({
      credential: store.issuePairingCredential({
        scopes: ["session:read"],
        ephemeral: true,
        sessionTtlMs: MANAGED_RENDERER_ACCESS_TTL_MS,
      }).credential,
    });
    // The backstop refresh path (a transient refusal healed on reconnect) must
    // not silently collapse the leg onto the 24-hour renewal ladder.
    const rotated = store.refreshAccessToken({ refreshToken: managed.refreshToken! });
    expect(rotated.sessionId).toBe(managed.sessionId);
    expect(Date.parse(rotated.expiresAt)).toBeGreaterThan(
      Date.now() + MANAGED_RENDERER_ACCESS_TTL_MS - 60_000,
    );
  });

  it("slides the refresh inactivity window on every rotation, so an active device never re-pairs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T00:00:00.000Z"));
    try {
      const store = new RemoteAuthStore();
      const paired = store.exchangePairingCredential({
        credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
      });
      const initialDeadline = Date.parse(paired.refreshTokenExpiresAt!);
      expect(initialDeadline - Date.now()).toBe(90 * 24 * 60 * 60 * 1000);

      // A device that keeps refreshing (daily bearer expiries) stays paired
      // far past any fixed pairing-date deadline: each rotation re-arms the
      // window from NOW.
      vi.setSystemTime(new Date("2026-12-25T00:00:00.000Z"));
      const rotated = store.refreshAccessToken({ refreshToken: paired.refreshToken! });
      expect(Date.parse(rotated.refreshTokenExpiresAt!) - Date.now()).toBe(
        90 * 24 * 60 * 60 * 1000,
      );
      expect(Date.parse(rotated.refreshTokenExpiresAt!)).toBeGreaterThan(initialDeadline);

      // …and the chain continues: rotate again a month later.
      vi.setSystemTime(new Date("2027-01-25T00:00:00.000Z"));
      const rotatedAgain = store.refreshAccessToken({ refreshToken: rotated.refreshToken! });
      expect(Date.parse(rotatedAgain.refreshTokenExpiresAt!) - Date.now()).toBe(
        90 * 24 * 60 * 60 * 1000,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a refresh token whose inactivity window has lapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T00:00:00.000Z"));
    try {
      const store = new RemoteAuthStore();
      const paired = store.exchangePairingCredential({
        credential: store.issuePairingCredential({ scopes: ["session:read"] }).credential,
      });
      // Unused for the whole window: the grant lapses and the pairing must be
      // redone (surfaced to the client as a dead grant, which retires the
      // connection instead of looping).
      vi.setSystemTime(new Date("2027-01-30T00:00:01.000Z"));
      expect(() => store.refreshAccessToken({ refreshToken: paired.refreshToken! })).toThrow(
        "Invalid refresh token.",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
