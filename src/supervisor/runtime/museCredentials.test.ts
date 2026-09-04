import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseMuseAuth, resolveMuseToken } from "./museCredentials";
import { setWslCredentialProjectScope } from "./wslCredentials";

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
  let previousAuthPath: string | undefined;
  let clearScope: (() => void) | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "muse-auth-"));
    previousAuthPath = process.env["MUSE_AUTH_PATH"];
    // Keep the WSL fallback from reaching a real distro so results are
    // deterministic on machines with WSL installed.
    clearScope = setWslCredentialProjectScope(() => false);
  });

  afterEach(() => {
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
});
