import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RemoteAuthStore,
  createPersistentRemoteAuthStore,
  readRemoteAccessAuthFile,
  writeRemoteAccessAuthFile,
} from "./auth";

const baseDirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const baseDir of baseDirs.splice(0)) rmSync(baseDir, { recursive: true, force: true });
});

function temporaryBaseDir(): string {
  const baseDir = mkdtempSync(join(tmpdir(), "poracode-auth-expiry-"));
  baseDirs.push(baseDir);
  return baseDir;
}

function pair(store: RemoteAuthStore) {
  const pairing = store.issuePairingCredential({ scopes: ["session:read"] });
  return store.exchangePairingCredential({ credential: pairing.credential, ttlMs: 1000 });
}

describe("remote session access and refresh deadlines", () => {
  it("rejects expired access and its ticket while retaining the refresh grant", () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const store = new RemoteAuthStore();
    const tokens = pair(store);
    const ticket = store.issueWebSocketTicket({ accessToken: tokens.accessToken });
    clock.mockReturnValue(now + 1000);
    expect(() => store.authenticateBearerToken(tokens.accessToken)).toThrow("Invalid access token");
    expect(() => store.issueWebSocketTicket({ accessToken: tokens.accessToken })).toThrow(
      "Invalid access token",
    );
    expect(() => store.consumeWebSocketTicket(ticket.ticket)).toThrow("Invalid access token");
    expect(store.listAccessSessions()).toHaveLength(1);
    const refreshed = store.refreshAccessToken({ refreshToken: tokens.refreshToken! });
    expect(store.authenticateBearerToken(refreshed.accessToken).scopes).toEqual(["session:read"]);
  });

  it("restores an expired bearer with an unexpired refresh grant from the existing disk shape", () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const baseDir = temporaryBaseDir();
    const tokens = pair(createPersistentRemoteAuthStore(baseDir));
    clock.mockReturnValue(now + 1000);
    expect(readRemoteAccessAuthFile(baseDir).accessSessions).toHaveLength(1);
    const restarted = createPersistentRemoteAuthStore(baseDir);
    expect(() => restarted.authenticateBearerToken(tokens.accessToken)).toThrow(
      "Invalid access token",
    );
    const refreshed = restarted.refreshAccessToken({ refreshToken: tokens.refreshToken! });
    expect(restarted.authenticateBearerToken(refreshed.accessToken).scopes).toEqual([
      "session:read",
    ]);
  });

  it("prunes sessions at refresh expiry and never extends legacy sessions", () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const baseDir = temporaryBaseDir();
    const store = createPersistentRemoteAuthStore(baseDir);
    const tokens = pair(store);
    clock.mockReturnValue(Date.parse(tokens.refreshTokenExpiresAt!));
    expect(() => store.refreshAccessToken({ refreshToken: tokens.refreshToken! })).toThrow(
      "Invalid refresh token",
    );
    expect(store.listAccessSessions()).toEqual([]);
    expect(readRemoteAccessAuthFile(baseDir).accessSessions).toEqual([]);
    const legacy = {
      id: "legacy",
      tokenHash: "old-token-hash",
      scopes: ["session:read" as const],
      issuedAtMs: now - 1000,
      expiresAtMs: now + 1000,
    };
    writeRemoteAccessAuthFile(baseDir, { accessSessions: [legacy], revokedTokenHashes: [] });
    expect(readRemoteAccessAuthFile(baseDir).accessSessions).toEqual([]);
    expect(new RemoteAuthStore({ accessSessions: [legacy] }).listAccessSessions()).toEqual([]);
  });
});
