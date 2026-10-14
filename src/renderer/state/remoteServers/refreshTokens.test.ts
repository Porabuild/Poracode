import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDesktopToken, __resetTokenVaultForTest } from "./tokenVault";
import {
  acquireConnectionIncarnation,
  acquireRefreshSubjectOwnership,
  connectionIncarnationOwner,
  connectionRefreshSubject,
  deleteRefreshTokenFromVault,
  ensureConnectionIncarnation,
  hydrateRefreshTokens,
  managedEnvironmentRefreshSubject,
  ownsConnectionIncarnation,
  ownsRefreshSubject,
  refreshSubjectVaultKey,
  refreshTokenForSubject,
  releaseRefreshSubjectOwnership,
  remoteEnvironmentRefreshSubject,
  rememberRefreshTokenForSubject,
  revokeConnectionIncarnation,
  revokeRefreshSubjectOwnership,
  writeRefreshTokenToVault,
  __resetRefreshTokensForTest,
  type RefreshSubject,
} from "./refreshTokens";

const PARENT = "parent-connection";
const ENVIRONMENT_ID = "11111111-1111-4111-8111-111111111111";
const HOST = "host-desktop";

const remoteSubject = remoteEnvironmentRefreshSubject(PARENT, ENVIRONMENT_ID);
const managedSubject = managedEnvironmentRefreshSubject(HOST, ENVIRONMENT_ID);
const directSubject = connectionRefreshSubject("direct-connection");

/** The pre-correction alias a direct connection id can still address. */
const legacyAlias = `environment.${PARENT}.${ENVIRONMENT_ID}`;

async function deleteVaultDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("lightcode-mobile-vault");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  __resetRefreshTokensForTest();
  __resetTokenVaultForTest();
  await deleteVaultDatabase();
  // The vault crypto-key record is owned by tokenVault; a real session always
  // stores an access token before its first refresh rotation.
  await setDesktopToken("vault-warmup", "warm");
});

afterEach(() => {
  __resetRefreshTokensForTest();
  vi.restoreAllMocks();
});

describe("refresh subjects own disjoint vault roots", () => {
  it("keeps every accepted direct root, including opaque grant-shaped ids", () => {
    expect(refreshSubjectVaultKey(directSubject)).toBe("refresh.direct-connection");
    expect(refreshSubjectVaultKey(remoteSubject)).toBe(
      `environmentRefresh.${PARENT}.${ENVIRONMENT_ID}`,
    );
    expect(refreshSubjectVaultKey(managedSubject)).toBe(
      `managedEnvironment.${HOST}.${ENVIRONMENT_ID}`,
    );
  });

  it("cannot address an environment grant from an arbitrary direct connection id", () => {
    // The rejected legacy domain: a direct id of `environment.<parent>.<envId>`
    // addresses the old `refresh.environment.<parent>.<envId>` alias, never the
    // new remote-environment root (which carries no `refresh.` prefix).
    const aliasKey = refreshSubjectVaultKey(connectionRefreshSubject(legacyAlias));
    expect(aliasKey).toBe(`refresh.${legacyAlias}`);
    expect(aliasKey).not.toBe(refreshSubjectVaultKey(remoteSubject));
    // Nor can a direct id equal to the managed root's suffix reach it.
    const managedShaped = `managedEnvironment.${HOST}.${ENVIRONMENT_ID}`;
    expect(refreshSubjectVaultKey(connectionRefreshSubject(managedShaped))).not.toBe(
      refreshSubjectVaultKey(managedSubject),
    );
    const remoteShaped = `environmentRefresh.${PARENT}.${ENVIRONMENT_ID}`;
    expect(refreshSubjectVaultKey(connectionRefreshSubject(remoteShaped))).not.toBe(
      refreshSubjectVaultKey(remoteSubject),
    );
  });

  it("keeps cache identity kind-aware for identical id values", () => {
    const asConnection = refreshSubjectVaultKey(connectionRefreshSubject(ENVIRONMENT_ID));
    const asRemote = refreshSubjectVaultKey(
      remoteEnvironmentRefreshSubject(PARENT, ENVIRONMENT_ID),
    );
    const asManaged = refreshSubjectVaultKey(
      managedEnvironmentRefreshSubject(HOST, ENVIRONMENT_ID),
    );
    expect(new Set([asConnection, asRemote, asManaged]).size).toBe(3);
  });
});

describe("strict vault persistence", () => {
  it("round-trips the remote and managed grant roots through the real vault", async () => {
    await expect(writeRefreshTokenToVault(remoteSubject, "remote-token")).resolves.toBe(true);
    await expect(writeRefreshTokenToVault(managedSubject, "managed-token")).resolves.toBe(true);
    await expect(writeRefreshTokenToVault(directSubject, "direct-token")).resolves.toBe(true);

    __resetRefreshTokensForTest();
    await hydrateRefreshTokens({ subjects: [remoteSubject, managedSubject, directSubject] });
    expect(refreshTokenForSubject(remoteSubject)).toBe("remote-token");
    expect(refreshTokenForSubject(managedSubject)).toBe("managed-token");
    expect(refreshTokenForSubject(directSubject)).toBe("direct-token");
  });

  it("resolves false, never silently persisted, without IndexedDB", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    try {
      await expect(writeRefreshTokenToVault(remoteSubject, "remote-token")).resolves.toBe(false);
      expect(refreshTokenForSubject(remoteSubject)).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, "indexedDB", descriptor!);
    }
  });

  it("fences a replaced owner and a removed grant against delayed writes", async () => {
    const first = acquireRefreshSubjectOwnership(remoteSubject);
    const second = acquireRefreshSubjectOwnership(remoteSubject);
    expect(ownsRefreshSubject(remoteSubject, first)).toBe(false);
    await expect(writeRefreshTokenToVault(remoteSubject, "stale", first)).resolves.toBe(false);
    await expect(writeRefreshTokenToVault(remoteSubject, "current", second)).resolves.toBe(true);
    rememberRefreshTokenForSubject(remoteSubject, "current");
    expect(refreshTokenForSubject(remoteSubject)).toBe("current");

    // Removal revokes every claim; a delayed writer cannot resurrect it.
    await deleteRefreshTokenFromVault(remoteSubject);
    expect(refreshTokenForSubject(remoteSubject)).toBeUndefined();
    await expect(writeRefreshTokenToVault(remoteSubject, "stale", second)).resolves.toBe(false);
    expect(refreshTokenForSubject(remoteSubject)).toBeUndefined();

    // A new pairing acquires a fresh fence and may write again.
    const repaired = acquireRefreshSubjectOwnership(remoteSubject);
    await expect(writeRefreshTokenToVault(remoteSubject, "repaired", repaired)).resolves.toBe(true);
  });

  it("release only clears the releasing owner's own claim", async () => {
    const first = acquireRefreshSubjectOwnership(managedSubject);
    const second = acquireRefreshSubjectOwnership(managedSubject);
    releaseRefreshSubjectOwnership(managedSubject, first);
    expect(ownsRefreshSubject(managedSubject, second)).toBe(true);
    revokeRefreshSubjectOwnership(managedSubject);
    expect(ownsRefreshSubject(managedSubject, second)).toBe(false);
  });
});

describe("connection incarnations", () => {
  const connectionSubject = connectionRefreshSubject(PARENT);

  it("shares one incarnation across live writers and fences re-pair/removal", async () => {
    const first = ensureConnectionIncarnation(PARENT);
    // A second legitimate writer (the per-request client or the long-lived
    // parent session) joins the SAME incarnation; no competing claim.
    expect(ensureConnectionIncarnation(PARENT)).toBe(first);
    expect(connectionIncarnationOwner(PARENT)).toBe(first);
    await expect(writeRefreshTokenToVault(connectionSubject, "one", first)).resolves.toBe(true);

    // Explicit re-pair: a fresh incarnation replaces the old one, so the
    // retired writer can neither write the vault nor pass the ownership fence.
    const repaired = acquireConnectionIncarnation(PARENT);
    expect(repaired).not.toBe(first);
    expect(ownsConnectionIncarnation(PARENT, first)).toBe(false);
    await expect(writeRefreshTokenToVault(connectionSubject, "stale", first)).resolves.toBe(false);
    await expect(writeRefreshTokenToVault(connectionSubject, "fresh", repaired)).resolves.toBe(
      true,
    );

    // Removal revokes the incarnation with the grant; a captured writer cannot
    // resurrect it in memory or in the vault.
    await deleteRefreshTokenFromVault(connectionSubject);
    expect(connectionIncarnationOwner(PARENT)).toBeUndefined();
    await expect(
      writeRefreshTokenToVault(connectionSubject, "resurrected", repaired),
    ).resolves.toBe(false);
    __resetRefreshTokensForTest();
    await hydrateRefreshTokens({ subjects: [connectionSubject] });
    expect(refreshTokenForSubject(connectionSubject)).toBeUndefined();
  });

  it("revokes explicitly so a later establishment can acquire again", async () => {
    const owner = ensureConnectionIncarnation("incarnation-connection");
    const subject = connectionRefreshSubject("incarnation-connection");
    revokeConnectionIncarnation("incarnation-connection");
    expect(connectionIncarnationOwner("incarnation-connection")).toBeUndefined();
    await expect(writeRefreshTokenToVault(subject, "stale", owner)).resolves.toBe(false);

    const next = acquireConnectionIncarnation("incarnation-connection");
    expect(next).not.toBe(owner);
    await expect(writeRefreshTokenToVault(subject, "next", next)).resolves.toBe(true);
  });
});

describe("legacy remote-environment slot migration", () => {
  async function seedLegacy(token: string): Promise<void> {
    // The legacy slot is exactly the direct root of the alias id.
    await expect(
      writeRefreshTokenToVault(connectionRefreshSubject(legacyAlias), token),
    ).resolves.toBe(true);
  }

  async function legacyStillPresent(): Promise<boolean> {
    __resetRefreshTokensForTest();
    const legacySubject = connectionRefreshSubject(legacyAlias);
    await hydrateRefreshTokens({ subjects: [legacySubject] });
    return refreshTokenForSubject(legacySubject) !== undefined;
  }

  it("migrates only an unambiguous slot after a strict write, then retires it", async () => {
    await seedLegacy("legacy-token");
    await hydrateRefreshTokens({
      subjects: [remoteSubject],
      legacyRemoteEnvironmentSubjects: [remoteSubject],
      directConnectionIds: new Set(),
    });
    expect(refreshTokenForSubject(remoteSubject)).toBe("legacy-token");
    expect(await legacyStillPresent()).toBe(false);
  });

  it("leaves an ambiguous slot alone and preserves the direct grant", async () => {
    await seedLegacy("shared-direct-token");
    await hydrateRefreshTokens({
      subjects: [remoteSubject],
      legacyRemoteEnvironmentSubjects: [remoteSubject],
      directConnectionIds: new Set([legacyAlias]),
    });
    // No copy into the environment authority; the direct grant still resolves.
    expect(refreshTokenForSubject(remoteSubject)).toBeUndefined();
    expect(await legacyStillPresent()).toBe(true);
  });

  it("keeps the legacy slot when the migration vault write fails, and retries later", async () => {
    await seedLegacy("legacy-token");
    const encrypt = vi
      .spyOn(crypto.subtle, "encrypt")
      .mockRejectedValueOnce(new Error("vault unavailable"));
    await hydrateRefreshTokens({
      subjects: [remoteSubject],
      legacyRemoteEnvironmentSubjects: [remoteSubject],
      directConnectionIds: new Set(),
    });
    encrypt.mockRestore();
    expect(refreshTokenForSubject(remoteSubject)).toBeUndefined();
    expect(await legacyStillPresent()).toBe(true);

    // Retry succeeds and only then retires the legacy slot.
    await hydrateRefreshTokens({
      subjects: [remoteSubject],
      legacyRemoteEnvironmentSubjects: [remoteSubject],
      directConnectionIds: new Set(),
    });
    expect(refreshTokenForSubject(remoteSubject)).toBe("legacy-token");
    expect(await legacyStillPresent()).toBe(false);
  });

  it("does not create a legacy slot for the new roots", async () => {
    await writeRefreshTokenToVault(remoteSubject, "remote-token");
    await writeRefreshTokenToVault(managedSubject, "managed-token");
    expect(await legacyStillPresent()).toBe(false);
  });
});

describe("old-reader refresh sweep", () => {
  it("cannot purge the new environment grant roots", async () => {
    await writeRefreshTokenToVault(remoteSubject, "remote-token");
    await writeRefreshTokenToVault(managedSubject, "managed-token");

    // An older reader removes records by its own `refresh.<connectionId>`
    // keys, including the pre-correction environment alias.
    const oldReaderSubjects: RefreshSubject[] = [
      connectionRefreshSubject(legacyAlias),
      connectionRefreshSubject(PARENT),
      connectionRefreshSubject(ENVIRONMENT_ID),
      connectionRefreshSubject(HOST),
    ];
    for (const subject of oldReaderSubjects) {
      await deleteRefreshTokenFromVault(subject);
    }

    __resetRefreshTokensForTest();
    await hydrateRefreshTokens({ subjects: [remoteSubject, managedSubject] });
    expect(refreshTokenForSubject(remoteSubject)).toBe("remote-token");
    expect(refreshTokenForSubject(managedSubject)).toBe("managed-token");
  });
});
