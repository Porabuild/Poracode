import { describe, expect, it } from "vitest";
import {
  CURSOR_CLI_KEYCHAIN_ACCOUNT,
  CURSOR_CLI_KEYCHAIN_SERVICE,
  parseCursorCliAuth,
  cursorUserIdFromJwt,
  parseCursorCliEmail,
} from "./usageCredentials";

/** Build a JWT-shaped token whose payload carries the given claims. */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

describe("cursorUserIdFromJwt", () => {
  it("strips the identity-provider prefix from the sub claim", () => {
    expect(cursorUserIdFromJwt(fakeJwt({ sub: "auth0|user_01ABC" }))).toBe("user_01ABC");
  });

  it("returns the sub verbatim when it has no provider prefix", () => {
    expect(cursorUserIdFromJwt(fakeJwt({ sub: "user_01XYZ" }))).toBe("user_01XYZ");
  });

  it("returns undefined for a missing/malformed token or absent sub", () => {
    expect(cursorUserIdFromJwt(undefined)).toBeUndefined();
    expect(cursorUserIdFromJwt("not-a-jwt")).toBeUndefined();
    expect(cursorUserIdFromJwt(fakeJwt({ other: "x" }))).toBeUndefined();
  });
});

describe("Cursor CLI keychain fallback", () => {
  it("targets the cursor-agent keychain namespace (service + shared account)", () => {
    // The CLI builds services as `cursor-<secret>` under one `cursor-user` account.
    expect(CURSOR_CLI_KEYCHAIN_SERVICE).toBe("cursor-access-token");
    expect(CURSOR_CLI_KEYCHAIN_ACCOUNT).toBe("cursor-user");
  });

  it("extracts the signed-in email from cli-config.json authInfo", () => {
    expect(
      parseCursorCliEmail(
        JSON.stringify({ authInfo: { email: " user@example.com ", userId: 1 }, model: {} }),
      ),
    ).toBe("user@example.com");
  });

  it("parses the CLI auth file without exposing the desktop credential source", () => {
    expect(
      parseCursorCliAuth(
        JSON.stringify({ accessToken: " cli-access ", refreshToken: " cli-refresh " }),
      ),
    ).toEqual({ accessToken: "cli-access", refreshToken: "cli-refresh" });
  });

  it("rejects auth files without an access token", () => {
    expect(parseCursorCliAuth(JSON.stringify({ refreshToken: "refresh" }))).toBeUndefined();
    expect(parseCursorCliAuth("not json")).toBeUndefined();
  });

  it("returns undefined when authInfo/email is absent or JSON is invalid", () => {
    expect(parseCursorCliEmail(JSON.stringify({ authInfo: {} }))).toBeUndefined();
    expect(parseCursorCliEmail(JSON.stringify({ authInfo: { email: "" } }))).toBeUndefined();
    expect(parseCursorCliEmail("not json")).toBeUndefined();
  });
});
