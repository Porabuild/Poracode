import { beforeEach, describe, expect, it, vi } from "vitest";

const state = new Map<string, string>();
const writes: string[] = [];
vi.mock("../db", () => ({
  dbGetState: (key: string) => state.get(key) ?? null,
  dbSetState: (key: string, value: string) => {
    state.set(key, value);
    writes.push(value);
  },
}));

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

  it("persists only sealed passwords and returns metadata-only lists", () => {
    const store = new BrowserCredentialStore();
    const metadata = store.upsert({
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

  it("decrypts only through explicit get and survives a new store instance", () => {
    const metadata = new BrowserCredentialStore().upsert({
      origin: "https://example.com",
      username: "ada",
      password: "secret",
    });

    expect(new BrowserCredentialStore().get(metadata.id)).toEqual({
      ...metadata,
      password: "secret",
    });
  });

  it("encrypts passwords that resemble the shared sealed-value format", () => {
    const password = "lc-safe:v1:not-really-encrypted";
    const metadata = new BrowserCredentialStore().upsert({
      origin: "https://example.com",
      username: "ada",
      password,
    });

    expect([...state.values()][0]).not.toContain(password);
    expect(new BrowserCredentialStore().get(metadata.id)?.password).toBe(password);
  });

  it("upserts by exact normalized origin and username", () => {
    const store = new BrowserCredentialStore();
    const original = store.upsert({
      origin: "https://EXAMPLE.com/login",
      username: "ada",
      password: "old",
    });
    const updated = store.upsert({
      origin: "https://example.com:443/account",
      username: "ada",
      password: "new",
    });

    expect(updated.id).toBe(original.id);
    expect(store.list()).toHaveLength(1);
    expect(store.get(original.id)?.password).toBe("new");
  });

  it("persists successful batch entries once and reports invalid rows", () => {
    const store = new BrowserCredentialStore();
    const result = store.upsertMany([
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

  it("updates metadata by id while preserving an existing import source", () => {
    const store = new BrowserCredentialStore();
    const original = store.upsert({
      origin: "https://example.com",
      username: "ada",
      password: "old",
      source: "chrome:Default",
    });
    const updated = store.upsert({
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

  it("filters metadata by exact origin instead of parent or subdomains", () => {
    const store = new BrowserCredentialStore();
    store.upsert({ origin: "https://example.com", username: "root", password: "one" });
    store.upsert({ origin: "https://sub.example.com", username: "sub", password: "two" });

    expect(store.list("https://example.com/path").map((entry) => entry.username)).toEqual(["root"]);
    expect(() => store.list("")).toThrow("Invalid URL");
  });

  it("deletes credentials by id", () => {
    const store = new BrowserCredentialStore();
    const metadata = store.upsert({
      origin: "https://example.com",
      username: "ada",
      password: "secret",
    });

    expect(store.delete(metadata.id)).toBe(true);
    expect(store.delete(metadata.id)).toBe(false);
    expect(store.get(metadata.id)).toBeUndefined();
  });

  it("ignores persisted plaintext and malformed origins", () => {
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

    expect(new BrowserCredentialStore().list()).toEqual([]);
  });
});
