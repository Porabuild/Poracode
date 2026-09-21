import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMuseAuth, parseMuseKeychainToken, resolveMuseToken } from "./museCredentials";
import { setWslCredentialProjectScope } from "./wslCredentials";

const keychainRead = vi.hoisted(() => vi.fn<() => Promise<{ stdout: string }>>());
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  return {
    ...actual,
    execFile: Object.assign(vi.fn<() => void>(), { [promisify.custom]: keychainRead }),
  };
});

describe("parseMuseAuth", () => {
  it("returns undefined for missing, empty, or malformed documents", () => {
    expect(parseMuseAuth("")).toBeUndefined();
    expect(parseMuseAuth("not-json")).toBeUndefined();
    expect(parseMuseAuth("[]")).toBeUndefined();
    expect(parseMuseAuth("{}")).toBeUndefined();
    expect(parseMuseAuth(JSON.stringify({ providers: {} }))).toBeUndefined();
    expect(parseMuseAuth(JSON.stringify({ providers: { meta: {} } }))).toBeUndefined();
    expect(
      parseMuseAuth(JSON.stringify({ providers: { meta: { access_token: "   " } } })),
    ).toBeUndefined();
  });

  it("reads the device-code access token and ignores the model API key", () => {
    // `api_key` alone (META_API_KEY-style headless setup) is rejected by the
    // usage key endpoint, so it must not resolve to a token.
    expect(
      parseMuseAuth(JSON.stringify({ providers: { meta: { api_key: "LLM|1|abc" } } })),
    ).toBeUndefined();
    expect(
      parseMuseAuth(
        JSON.stringify({
          providers: { meta: { access_token: "  dca:tok  ", api_key: "LLM|1|abc" } },
        }),
      ),
    ).toEqual({ accessToken: "dca:tok" });
  });
});

describe("resolveMuseToken (MUSE_AUTH_PATH override, never touches ~/.config/muse)", () => {
  let dir: string;
  const originalPlatform = process.platform;
  let previousAuthPath: string | undefined;
  let clearScope: (() => void) | undefined;

  beforeEach(() => {
    keychainRead.mockReset().mockRejectedValue(new Error("unavailable"));
    dir = mkdtempSync(join(tmpdir(), "muse-auth-"));
    previousAuthPath = process.env["MUSE_AUTH_PATH"];
    // Keep the WSL fallback from reaching a real distro so results are
    // deterministic on machines with WSL installed.
    clearScope = setWslCredentialProjectScope(() => false);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (previousAuthPath === undefined) delete process.env["MUSE_AUTH_PATH"];
    else process.env["MUSE_AUTH_PATH"] = previousAuthPath;
    clearScope?.();
    clearScope = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves the token from the override auth file", async () => {
    const authPath = join(dir, "auth.json");
    writeFileSync(
      authPath,
      JSON.stringify({ schema_version: 1, providers: { meta: { access_token: "dca:abc" } } }),
    );
    process.env["MUSE_AUTH_PATH"] = authPath;
    await expect(resolveMuseToken()).resolves.toEqual({ accessToken: "dca:abc" });
  });

  it("returns undefined when the auth file has no device-code token", async () => {
    const authPath = join(dir, "auth.json");
    writeFileSync(authPath, JSON.stringify({ schema_version: 1, providers: {} }));
    process.env["MUSE_AUTH_PATH"] = authPath;
    await expect(resolveMuseToken()).resolves.toBeUndefined();
  });
  it("reads a macOS OAuth login from Muse's Keychain item", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env["MUSE_AUTH_PATH"] = join(dir, "auth.json");
    writeFileSync(
      process.env["MUSE_AUTH_PATH"],
      JSON.stringify({ providers: { meta: { mechanism: "oauth", storage: "keychain" } } }),
    );
    keychainRead.mockResolvedValue({
      stdout: JSON.stringify({ access_token: "dca:keychain", api_key: "LLM|ignored" }),
    });
    expect(await resolveMuseToken()).toEqual({ accessToken: "dca:keychain" });
    expect(keychainRead).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["find-generic-password", "-s", "ai.meta.dev.credentials", "-a", "meta", "-w"],
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it.each(["dca:inline", "LLM|wrong", ""])(
    "never replaces an explicit inline token with another Keychain account: %s",
    async (token) => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      process.env["MUSE_AUTH_PATH"] = join(dir, "auth.json");
      writeFileSync(
        process.env["MUSE_AUTH_PATH"],
        JSON.stringify({ providers: { meta: { mechanism: "oauth", access_token: token } } }),
      );
      keychainRead.mockResolvedValue({ stdout: JSON.stringify({ access_token: "dca:other" }) });
      expect(await resolveMuseToken()).toEqual(
        token.startsWith("dca:") ? { accessToken: token } : undefined,
      );
      expect(keychainRead).not.toHaveBeenCalled();
    },
  );

  it.each(["darwin", "linux"])(
    "handles unavailable Keychain without launching Muse on %s",
    async (platform) => {
      Object.defineProperty(process, "platform", { value: platform });
      process.env["MUSE_AUTH_PATH"] = join(dir, "auth.json");
      writeFileSync(
        process.env["MUSE_AUTH_PATH"],
        JSON.stringify({ providers: { meta: { mechanism: "oauth" } } }),
      );
      expect(await resolveMuseToken()).toBeUndefined();
      expect(keychainRead).toHaveBeenCalledTimes(platform === "darwin" ? 1 : 0);
    },
  );
});

describe("Muse Keychain parser", () => {
  it("accepts only a device-code token from a valid payload", () => {
    expect(parseMuseKeychainToken('{"access_token":" dca:token "}')).toEqual({
      accessToken: "dca:token",
    });
    for (const body of ["null", "[]", "{}", "invalid", '{"access_token":"LLM|inference"}']) {
      expect(parseMuseKeychainToken(body)).toBeUndefined();
    }
  });
});
