import { describe, expect, it, vi } from "vitest";
import {
  antigravityAccountFromUserStatus,
  probeAntigravityAccount,
  type AntigravityAccountProbeDeps,
} from "./antigravityAccountProbe";

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
  const account = { authenticatedAs: "user@example.com", plan: "Google AI Pro" };

  function makeDeps(
    overrides: Partial<AntigravityAccountProbeDeps> = {},
  ): AntigravityAccountProbeDeps {
    return {
      readRunningAccount: vi
        .fn<AntigravityAccountProbeDeps["readRunningAccount"]>()
        .mockResolvedValue(undefined),
      spawnAndReadAccount: vi
        .fn<AntigravityAccountProbeDeps["spawnAndReadAccount"]>()
        .mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("reuses a running language server without spawning", async () => {
    const deps = makeDeps({
      readRunningAccount: vi
        .fn<AntigravityAccountProbeDeps["readRunningAccount"]>()
        .mockResolvedValue(account),
    });

    const result = await probeAntigravityAccount({ executablePath: "agy", allowSpawn: true }, deps);

    expect(result).toEqual(account);
    expect(deps.spawnAndReadAccount).not.toHaveBeenCalled();
  });

  it("spawns agy when no LS is running and spawning is allowed", async () => {
    const deps = makeDeps({
      spawnAndReadAccount: vi
        .fn<AntigravityAccountProbeDeps["spawnAndReadAccount"]>()
        .mockResolvedValue(account),
    });

    const result = await probeAntigravityAccount(
      { executablePath: "/path/to/agy", allowSpawn: true },
      deps,
    );

    expect(result).toEqual(account);
    expect(deps.spawnAndReadAccount).toHaveBeenCalledWith("/path/to/agy");
  });

  it("never spawns when allowSpawn is false (signed-out / passive-only)", async () => {
    const deps = makeDeps();

    const result = await probeAntigravityAccount(
      { executablePath: "/path/to/agy", allowSpawn: false },
      deps,
    );

    expect(result).toBeUndefined();
    expect(deps.spawnAndReadAccount).not.toHaveBeenCalled();
  });

  it("never spawns when there is no executable path to launch", async () => {
    const deps = makeDeps();

    const result = await probeAntigravityAccount({ allowSpawn: true }, deps);

    expect(result).toBeUndefined();
    expect(deps.spawnAndReadAccount).not.toHaveBeenCalled();
  });
});
