import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CredentialStore } from "@poracode/agents-usage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUsageSecret, setUsageSecret, usageSecretsPath } from "@/shared/usageSecretStore";
import { createAntigravityAcpCredentialCache } from "./antigravityAcpCredentialCache";
import type { AntigravityAcpCredentials } from "./antigravityAcpCredentials";

const CREDENTIALS: AntigravityAcpCredentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  keychainFingerprint: "keychain-source",
};
type ResolveCredentials = () => Promise<AntigravityAcpCredentials | undefined>;

describe("Antigravity ACP credential cache", () => {
  let cacheDir: string;
  let store: CredentialStore;
  const readKeychainFingerprint = vi.fn<() => Promise<string | undefined>>();

  function createCache(resolveCredentials: ResolveCredentials) {
    return createAntigravityAcpCredentialCache(store, resolveCredentials, readKeychainFingerprint);
  }

  beforeEach(() => {
    readKeychainFingerprint.mockReset().mockResolvedValue(CREDENTIALS.keychainFingerprint);
    mkdirSync("tmp", { recursive: true });
    cacheDir = mkdtempSync(join("tmp", "antigravity-credentials-"));
    store = {
      getOAuthToken: async () => undefined,
      getSecret: vi.fn<CredentialStore["getSecret"]>(async (provider, key) =>
        getUsageSecret(cacheDir, provider, key),
      ),
      setSecret: vi.fn<NonNullable<CredentialStore["setSecret"]>>(async (provider, key, value) =>
        setUsageSecret(cacheDir, provider, key, value),
      ),
    };
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("imports into a pre-upgrade secret store and reuses the encrypted grant after restart", async () => {
    setUsageSecret(cacheDir, "existing-provider", "cookie", "existing-session");
    const resolveCredentials = vi.fn<ResolveCredentials>(async () => CREDENTIALS);
    const cache = createCache(resolveCredentials);
    await expect(cache.resolve()).resolves.toEqual(CREDENTIALS);
    await expect(cache.resolve()).resolves.toEqual(CREDENTIALS);

    const raw = readFileSync(usageSecretsPath(cacheDir), "utf8");
    expect(raw).toContain("lc-safe:v1:");
    expect(raw).not.toContain(CREDENTIALS.refreshToken);
    expect(raw).not.toContain(CREDENTIALS.clientSecret);
    expect(getUsageSecret(cacheDir, "existing-provider", "cookie")).toBe("existing-session");

    const restarted = createCache(resolveCredentials);
    await expect(restarted.resolve()).resolves.toEqual(CREDENTIALS);
    expect(resolveCredentials).toHaveBeenCalledOnce();
    expect(store.setSecret).toHaveBeenCalledOnce();
  });

  it("shares a pending read and persists the grant once", async () => {
    const grant = Promise.withResolvers<AntigravityAcpCredentials>();
    const readStarted = Promise.withResolvers<void>();
    const resolveCredentials = vi.fn<ResolveCredentials>(() => {
      readStarted.resolve();
      return grant.promise;
    });
    const cache = createCache(resolveCredentials);
    const first = cache.resolve();
    await readStarted.promise;
    const second = cache.resolve();
    expect(resolveCredentials).toHaveBeenCalledOnce();
    grant.resolve(CREDENTIALS);
    await expect(Promise.all([first, second])).resolves.toEqual([CREDENTIALS, CREDENTIALS]);
    expect(store.setSecret).toHaveBeenCalledOnce();
  });

  it("clears rejected credentials durably before a later launch", async () => {
    const cache = createCache(async () => CREDENTIALS);
    const rejected = await cache.resolve();
    await cache.invalidate(rejected!);
    const resolveCredentials = vi.fn<ResolveCredentials>(async () => undefined);
    const restarted = createCache(resolveCredentials);
    await expect(restarted.resolve()).resolves.toBeUndefined();
    expect(resolveCredentials).toHaveBeenCalledOnce();
    expect(getUsageSecret(cacheDir, "antigravity", "acp-credentials-v1")).toBe("null");
  });

  it("waits for invalidation before saving a replacement and ignores late old failures", async () => {
    const replacement = { ...CREDENTIALS, refreshToken: "replacement-token" };
    const resolveCredentials = vi
      .fn<ResolveCredentials>()
      .mockResolvedValueOnce(CREDENTIALS)
      .mockResolvedValue(replacement);
    const cache = createCache(resolveCredentials);
    const rejected = await cache.resolve();
    const cleared = Promise.withResolvers<void>();
    const originalSetSecret = store.setSecret!;
    store.setSecret = async (provider, key, value) => {
      if (value === "null") await cleared.promise;
      await originalSetSecret(provider, key, value);
    };
    const invalidation = cache.invalidate(rejected!);
    const refresh = cache.resolve();
    await Promise.resolve();
    expect(resolveCredentials).toHaveBeenCalledOnce();
    cleared.resolve();
    await invalidation;
    await expect(refresh).resolves.toEqual(replacement);
    await cache.invalidate(rejected!);
    const restarted = createCache(resolveCredentials);
    await expect(restarted.resolve()).resolves.toEqual(replacement);
    expect(resolveCredentials).toHaveBeenCalledTimes(2);
  });

  it.each(["not json", "null", JSON.stringify({ refresh_token: "incomplete" })])(
    "falls back when a saved artifact is invalid: %s",
    async (value) => {
      setUsageSecret(cacheDir, "antigravity", "acp-credentials-v1", value);
      const resolveCredentials = vi.fn<ResolveCredentials>(async () => CREDENTIALS);
      const cache = createCache(resolveCredentials);
      await expect(cache.resolve()).resolves.toEqual(CREDENTIALS);
      expect(resolveCredentials).toHaveBeenCalledOnce();
    },
  );

  it("still caches in memory when encrypted storage is unavailable", async () => {
    const unavailable = async (): Promise<never> => {
      throw new Error("Encrypted storage unavailable");
    };
    const resolveCredentials = vi.fn<ResolveCredentials>(async () => CREDENTIALS);
    const cache = createAntigravityAcpCredentialCache(
      { getSecret: unavailable, setSecret: unavailable },
      resolveCredentials,
      readKeychainFingerprint,
    );
    await expect(cache.resolve()).resolves.toEqual(CREDENTIALS);
    await expect(cache.resolve()).resolves.toEqual(CREDENTIALS);
    expect(resolveCredentials).toHaveBeenCalledOnce();
  });

  it("retries absent credentials so a later login can be picked up", async () => {
    const resolveCredentials = vi
      .fn<ResolveCredentials>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(CREDENTIALS);
    const cache = createCache(resolveCredentials);
    await expect(cache.resolve()).resolves.toBeUndefined();
    await expect(cache.resolve()).resolves.toEqual(CREDENTIALS);
  });

  it("reimports a replaced Keychain item instead of reusing another account after restart", async () => {
    await createCache(async () => CREDENTIALS).resolve();
    const replacement = {
      ...CREDENTIALS,
      refreshToken: "another-account-token",
      keychainFingerprint: "replacement-source",
    };
    readKeychainFingerprint.mockResolvedValue(replacement.keychainFingerprint);
    const resolveCredentials = vi.fn<ResolveCredentials>(async () => replacement);
    await expect(createCache(resolveCredentials).resolve()).resolves.toEqual(replacement);
    expect(resolveCredentials).toHaveBeenCalledOnce();
  });

  it("does not restore a grant when its Keychain source was removed", async () => {
    await createCache(async () => CREDENTIALS).resolve();
    readKeychainFingerprint.mockResolvedValue(undefined);
    const resolveCredentials = vi.fn<ResolveCredentials>(async () => undefined);
    await expect(createCache(resolveCredentials).resolve()).resolves.toBeUndefined();
    expect(resolveCredentials).toHaveBeenCalledOnce();
  });

  it("keeps file and WSL credentials process-local and rereads their source after restart", async () => {
    const { keychainFingerprint: _fingerprint, ...fileCredentials } = CREDENTIALS;
    const resolveCredentials = vi.fn<ResolveCredentials>(async () => fileCredentials);
    await expect(createCache(resolveCredentials).resolve()).resolves.toEqual(fileCredentials);
    await expect(createCache(resolveCredentials).resolve()).resolves.toEqual(fileCredentials);
    expect(resolveCredentials).toHaveBeenCalledTimes(2);
    expect(store.setSecret).not.toHaveBeenCalled();
  });
});
