import { beforeEach, describe, expect, it } from "vitest";

const state = new Map<string, string>();
const writes: string[] = [];
const stateStore = {
  get: (key: string) => state.get(key) ?? null,
  set: (key: string, value: string) => {
    state.set(key, value);
    writes.push(value);
  },
};

import { BrowserCredentialStore, normalizeBrowserCredentialOrigin } from "./BrowserCredentialStore";

describe("BrowserCredentialStore", () => {
  beforeEach(() => {
    state.clear();
    writes.length = 0;
  });

  it("normalizes HTTP(S) origins and rejects other protocols", () => {
    expect(normalizeBrowserCredentialOrigin("HTTPS://Example.com:443/login?q=1")).toBe(
      "https://example.com",
    );
    expect(normalizeBrowserCredentialOrigin("http://example.com:8080/path")).toBe(
      "http://example.com:8080",
    );
    expect(() => normalizeBrowserCredentialOrigin("file:///tmp/login")).toThrow("HTTP(S) origin");
  });

  it("persists only sealed passwords and returns metadata-only lists", async () => {
    const store = new BrowserCredentialStore(stateStore);
    const metadata = await store.upsert({
      origin: "https://example.com/login",
      username: "ada@example.com",
      password: "correct horse battery staple",
    });

    expect(metadata).not.toHaveProperty("password");
    expect(metadata).not.toHaveProperty("sealedPassword");
    expect(store.list()).toEqual([metadata]);
    const raw = [...state.values()][0];
    expect(raw).toBeDefined();
    expect(raw).not.toContain("correct horse battery staple");
    expect(raw).toContain("lc-safe:v1:");
  });

  it("decrypts only through explicit get and survives a new store instance", async () => {
    const metadata = await new BrowserCredentialStore(stateStore).upsert({
      origin: "https://example.com",
      username: "ada",
      password: "secret",
    });

    expect(new BrowserCredentialStore(stateStore).get(metadata.id)).toEqual({
      ...metadata,
      password: "secret",
    });
  });

  it("encrypts passwords that resemble the shared sealed-value format", async () => {
    const password = "lc-safe:v1:not-really-encrypted";
    const metadata = await new BrowserCredentialStore(stateStore).upsert({
      origin: "https://example.com",
      username: "ada",
      password,
    });

    expect([...state.values()][0]).not.toContain(password);
    expect(new BrowserCredentialStore(stateStore).get(metadata.id)?.password).toBe(password);
  });

  it("upserts by exact normalized origin and username", async () => {
    const store = new BrowserCredentialStore(stateStore);
    const original = await store.upsert({
      origin: "https://EXAMPLE.com/login",
      username: "ada",
      password: "old",
    });
    const updated = await store.upsert({
      origin: "https://example.com:443/account",
      username: "ada",
      password: "new",
    });

    expect(updated.id).toBe(original.id);
    expect(store.list()).toHaveLength(1);
    expect(store.get(original.id)?.password).toBe("new");
  });

  it("persists successful batch entries once and reports invalid rows", async () => {
    const store = new BrowserCredentialStore(stateStore);
    const result = await store.upsertMany([
      { origin: "https://example.com/login", username: "ada", password: "one" },
      { origin: "file:///invalid", username: "skip", password: "two" },
      { origin: "https://example.org/login", username: "grace", password: "three" },
    ]);

    expect(result).toMatchObject({ failed: 1 });
    expect(result.saved).toHaveLength(2);
    expect(
      store
        .list()
        .map((credential) => credential.username)
        .sort(),
    ).toEqual(["ada", "grace"]);
    expect(writes).toHaveLength(1);
  });

  it("updates metadata by id while preserving an existing import source", async () => {
    const store = new BrowserCredentialStore(stateStore);
    const original = await store.upsert({
      origin: "https://example.com",
      username: "ada",
      password: "old",
      source: "chrome:Default",
    });
    const updated = await store.upsert({
      id: original.id,
      origin: "https://example.org/account",
      username: "grace",
      password: "new",
    });

    expect(updated).toMatchObject({
      id: original.id,
      origin: "https://example.org",
      username: "grace",
      source: "chrome:Default",
    });
    expect(store.get(original.id)?.password).toBe("new");
  });

  it("filters metadata by exact origin instead of parent or subdomains", async () => {
    const store = new BrowserCredentialStore(stateStore);
    await store.upsert({ origin: "https://example.com", username: "root", password: "one" });
    await store.upsert({ origin: "https://sub.example.com", username: "sub", password: "two" });

    expect(store.list("https://example.com/path").map((entry) => entry.username)).toEqual(["root"]);
    expect(() => store.list("")).toThrow("Invalid URL");
  });

  it("deletes credentials by id", async () => {
    const store = new BrowserCredentialStore(stateStore);
    const metadata = await store.upsert({
      origin: "https://example.com",
      username: "ada",
      password: "secret",
    });

    expect(await store.delete(metadata.id)).toBe(true);
    expect(await store.delete(metadata.id)).toBe(false);
    expect(store.get(metadata.id)).toBeUndefined();
  });

  it("reads the previous array format and retains its sealed password on upgrade", async () => {
    const metadata = await new BrowserCredentialStore(stateStore).upsert({
      origin: "https://example.test",
      username: "legacy",
      password: "before-upgrade",
    });
    const current = JSON.parse(state.get("browser-credentials-v1")!) as { credentials: unknown[] };
    state.set("browser-credentials-v1", JSON.stringify(current.credentials));
    const upgraded = new BrowserCredentialStore(stateStore);
    expect(upgraded.get(metadata.id)?.password).toBe("before-upgrade");
    await upgraded.upsert({
      origin: "https://other.test",
      username: "new",
      password: "after-upgrade",
    });
    expect(JSON.parse(state.get("browser-credentials-v1")!)).toMatchObject({ version: 1 });
    expect(new BrowserCredentialStore(stateStore).get(metadata.id)?.password).toBe(
      "before-upgrade",
    );
  });

  it("preserves a future envelope and rejects reads and writes", async () => {
    const bytes = JSON.stringify({ version: 2, credentials: [{ future: "custody" }] });
    state.set("browser-credentials-v1", bytes);
    const store = new BrowserCredentialStore(stateStore);
    expect(() => store.list()).toThrow("Unable to read");
    await expect(
      store.upsert({ origin: "https://example.test", username: "new", password: "secret" }),
    ).rejects.toThrow("Unable to read");
    expect(state.get("browser-credentials-v1")).toBe(bytes);
    expect(writes).toHaveLength(0);
  });

  it("keeps previous credentials after a rejected durable write and retries later", async () => {
    const metadata = await new BrowserCredentialStore(stateStore).upsert({
      origin: "https://example.test",
      username: "user",
      password: "old",
    });
    let fail = true;
    const store = new BrowserCredentialStore({
      ...stateStore,
      setDurable: async (key, value) => {
        if (fail) throw new Error("Disk unavailable");
        stateStore.set(key, value);
      },
    });
    await expect(
      store.upsert({ id: metadata.id, origin: metadata.origin, username: "user", password: "new" }),
    ).rejects.toThrow("Disk unavailable");
    expect(store.get(metadata.id)?.password).toBe("old");
    expect(new BrowserCredentialStore(stateStore).get(metadata.id)?.password).toBe("old");
    fail = false;
    await store.upsert({
      id: metadata.id,
      origin: metadata.origin,
      username: "user",
      password: "retried",
    });
    expect(new BrowserCredentialStore(stateStore).get(metadata.id)?.password).toBe("retried");
  });

  it("serializes concurrent saves without exposing uncommitted metadata or losing entries", async () => {
    const commit = Promise.withResolvers<void>();
    let writeCount = 0;
    const store = new BrowserCredentialStore({
      ...stateStore,
      setDurable: async (key, value) => {
        if (++writeCount === 1) await commit.promise;
        stateStore.set(key, value);
      },
    });
    const first = store.upsert({ origin: "https://first.test", username: "a", password: "first" });
    const second = store.upsert({
      origin: "https://second.test",
      username: "b",
      password: "second",
    });
    await Promise.resolve();
    expect(store.list()).toEqual([]);
    expect(writeCount).toBe(1);
    commit.resolve();
    await Promise.all([first, second]);
    expect(new BrowserCredentialStore(stateStore).list()).toHaveLength(2);
  });

  it("refuses invalid persisted credentials without replacing their bytes", () => {
    state.set(
      "browser-credentials-v1",
      JSON.stringify([
        {
          id: "plaintext",
          origin: "https://example.com",
          username: "ada",
          sealedPassword: "secret",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "file-origin",
          origin: "file://example.com",
          username: "ada",
          sealedPassword: "lc-safe:v1:invalid",
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );

    expect(() => new BrowserCredentialStore(stateStore).list()).toThrow("Unable to read");
    expect(writes).toHaveLength(0);
  });
});
