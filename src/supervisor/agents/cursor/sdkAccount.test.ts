import { describe, expect, it } from "vitest";
import { probeCursorSdkAccountEmail, readCursorSdkAccountEmail } from "./sdkAccount";

describe("readCursorSdkAccountEmail", () => {
  it("reads Cursor.me() SDKUser.userEmail", () => {
    expect(readCursorSdkAccountEmail({ userEmail: " work@example.com " })).toBe("work@example.com");
  });

  it("falls back to email on auth.status-shaped payloads", () => {
    expect(readCursorSdkAccountEmail({ status: "logged-in", email: "me@cursor.com" })).toBe(
      "me@cursor.com",
    );
  });

  it("ignores blank or non-object payloads", () => {
    expect(readCursorSdkAccountEmail(undefined)).toBeUndefined();
    expect(readCursorSdkAccountEmail({ userEmail: "  " })).toBeUndefined();
    expect(readCursorSdkAccountEmail("work@example.com")).toBeUndefined();
  });
});

describe("probeCursorSdkAccountEmail", () => {
  it("calls Cursor.me with the same apiKey used for catalog reads", async () => {
    const seen: unknown[] = [];
    const email = await probeCursorSdkAccountEmail(
      {
        me: async (options: unknown) => {
          seen.push(options);
          return { userEmail: "work@example.com", apiKeyName: "cli" };
        },
      },
      "crsr_work",
    );
    expect(seen).toEqual([{ apiKey: "crsr_work" }]);
    expect(email).toBe("work@example.com");
  });

  it("does not fail the probe when Cursor.me is missing or rejects", async () => {
    await expect(probeCursorSdkAccountEmail(undefined)).resolves.toBeUndefined();
    await expect(probeCursorSdkAccountEmail({})).resolves.toBeUndefined();
    await expect(
      probeCursorSdkAccountEmail({
        me: async () => {
          throw new Error("network");
        },
      }),
    ).resolves.toBeUndefined();
  });
});
