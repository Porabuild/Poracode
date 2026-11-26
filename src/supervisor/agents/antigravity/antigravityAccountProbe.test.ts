import { describe, expect, it, vi } from "vitest";
import {
  antigravityAccountFromUserStatus,
  probeAntigravityAccount,
} from "./antigravityAccountProbe";
import { GET_USER_STATUS, queryLs } from "./antigravityLanguageServer";
import { resolveAntigravityLsEndpoints } from "./antigravityProcessScan";

vi.mock("./antigravityLanguageServer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./antigravityLanguageServer")>()),
  queryLs: vi.fn<typeof queryLs>(),
}));
vi.mock("./antigravityProcessScan", () => ({
  resolveAntigravityLsEndpoints: vi.fn<typeof resolveAntigravityLsEndpoints>(),
}));

describe("antigravityAccountFromUserStatus", () => {
  it("maps email + plan from a GetUserStatus body", () => {
    // Mirrors the real shape: email at userStatus.email, plan via userTier.name.
    expect(
      antigravityAccountFromUserStatus({
        userStatus: {
          email: "user@example.com",
          userTier: { name: "Google AI Pro" },
        },
      }),
    ).toEqual({ authenticatedAs: "user@example.com", plan: "Google AI Pro" });
  });

  it("returns just the email when no plan is present", () => {
    expect(antigravityAccountFromUserStatus({ userStatus: { email: "user@example.com" } })).toEqual(
      { authenticatedAs: "user@example.com" },
    );
  });

  it("returns undefined for an empty or missing body", () => {
    expect(antigravityAccountFromUserStatus({ userStatus: {} })).toBeUndefined();
    expect(antigravityAccountFromUserStatus(undefined)).toBeUndefined();
  });
});

describe("probeAntigravityAccount", () => {
  it("resolves account metadata from an already-running language server", async () => {
    vi.mocked(resolveAntigravityLsEndpoints).mockResolvedValue({
      ports: [1234, 1235],
      csrfTokens: [],
    });
    vi.mocked(queryLs)
      .mockReset()
      .mockRejectedValueOnce(new Error("closed"))
      .mockResolvedValueOnce({
        userStatus: { email: "user@example.com", userTier: { name: "Google AI Pro" } },
      });
    await expect(probeAntigravityAccount(["Ubuntu"])).resolves.toEqual({
      authenticatedAs: "user@example.com",
      plan: "Google AI Pro",
    });
    expect(resolveAntigravityLsEndpoints).toHaveBeenCalledWith(["Ubuntu"]);
    expect(queryLs).toHaveBeenLastCalledWith(1235, GET_USER_STATUS, []);
  });

  it("returns unknown account metadata when no language server is running", async () => {
    vi.mocked(resolveAntigravityLsEndpoints).mockResolvedValue({ ports: [], csrfTokens: [] });
    vi.mocked(queryLs).mockClear();
    await expect(probeAntigravityAccount()).resolves.toBeUndefined();
    expect(queryLs).not.toHaveBeenCalled();
  });
});
