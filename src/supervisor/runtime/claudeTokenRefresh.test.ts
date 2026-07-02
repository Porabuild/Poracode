import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ClaudeRefreshedToken, OAuthToken } from "@lightcode/agents-usage";
import {
  type ClaudeRefreshDeps,
  isClaudeTokenExpired,
  isClaudeTokenRefreshDue,
  mergeClaudeCredentialsJson,
  refreshRejectedClaudeToken,
  refreshClaudeFileTokenIfExpired,
  resolveClaudeToken,
} from "./claudeCredentials";

const NOW = 1_700_000_000_000;
const PATH = "/home/u/.claude/.credentials.json";

function credsFile(oauth: object): string {
  return JSON.stringify({ claudeAiOauth: oauth });
}

/** Deps backed by a single in-memory file, with a refresh spy. */
function makeDeps(opts: {
  file: string;
  refreshed?: ClaudeRefreshedToken | undefined;
  now?: number;
}): ClaudeRefreshDeps & {
  written: { content?: string };
  refresh: ReturnType<typeof vi.fn>;
} {
  const store = { content: opts.file };
  const written: { content?: string } = {};
  const refresh = vi.fn<
    (refreshToken: string, nowMs: number) => Promise<ClaudeRefreshedToken | undefined>
  >(async () => opts.refreshed);
  return {
    now: () => opts.now ?? NOW,
    refresh,
    readFile: () => store.content,
    writeFile: (_path, content) => {
      store.content = content;
      written.content = content;
    },
    written,
  };
}

describe("isClaudeTokenExpired", () => {
  it("reports expiry once the token reaches expiresAt", () => {
    expect(isClaudeTokenExpired({ expiresAt: NOW - 1 }, NOW)).toBe(true);
    expect(isClaudeTokenExpired({ expiresAt: NOW }, NOW)).toBe(true);
    expect(isClaudeTokenExpired({ expiresAt: NOW + 1 }, NOW)).toBe(false);
    expect(isClaudeTokenExpired({ expiresAt: NOW + 5 * 60_000 }, NOW)).toBe(false);
  });

  it("never reports expiry when expiresAt is absent", () => {
    expect(isClaudeTokenExpired({}, NOW)).toBe(false);
  });
});

describe("isClaudeTokenRefreshDue", () => {
  it("reports due inside the proactive refresh window", () => {
    expect(isClaudeTokenRefreshDue({ expiresAt: NOW + 5 * 60_000 }, NOW)).toBe(true);
    expect(isClaudeTokenRefreshDue({ expiresAt: NOW + 5 * 60_000 + 1 }, NOW)).toBe(false);
    expect(isClaudeTokenRefreshDue({ expiresAt: NOW + 10 * 60_000 }, NOW)).toBe(false);
  });
});

describe("mergeClaudeCredentialsJson", () => {
  const refreshed: ClaudeRefreshedToken = {
    accessToken: "A2",
    refreshToken: "R2",
    expiresAt: NOW + 1000,
  };

  it("rewrites the oauth fields inside the wrapper, preserving other fields", () => {
    const out = mergeClaudeCredentialsJson(
      credsFile({ accessToken: "A1", refreshToken: "R1", expiresAt: 1, subscriptionType: "max" }),
      refreshed,
    );
    expect(JSON.parse(out)).toEqual({
      claudeAiOauth: {
        accessToken: "A2",
        refreshToken: "R2",
        expiresAt: NOW + 1000,
        subscriptionType: "max",
      },
    });
  });

  it("handles a bare (unwrapped) oauth object", () => {
    const out = mergeClaudeCredentialsJson(
      JSON.stringify({ accessToken: "A1", refreshToken: "R1", expiresAt: 1 }),
      refreshed,
    );
    expect(JSON.parse(out)).toEqual({
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: NOW + 1000,
    });
  });
});

describe("refreshClaudeFileTokenIfExpired", () => {
  const fresh: OAuthToken = { accessToken: "A1", refreshToken: "R1", expiresAt: NOW + 10 * 60_000 };
  const nearExpiry: OAuthToken = {
    accessToken: "A1",
    refreshToken: "R1",
    expiresAt: NOW + 2 * 60_000,
    subscriptionType: "max",
  };
  const expired: OAuthToken = {
    accessToken: "A1",
    refreshToken: "R1",
    expiresAt: NOW - 5 * 60_000,
    subscriptionType: "max",
  };

  it("returns the token untouched when it is not due for refresh", async () => {
    const deps = makeDeps({ file: credsFile(fresh) });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(fresh), fresh, deps);
    expect(out).toBe(fresh);
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("returns a still-valid token even when it has no refresh token", async () => {
    const noRefValid: OAuthToken = { accessToken: "A1", expiresAt: NOW + 10 * 60_000 };
    const deps = makeDeps({ file: credsFile(noRefValid) });
    expect(
      await refreshClaudeFileTokenIfExpired(PATH, credsFile(noRefValid), noRefValid, deps),
    ).toBe(noRefValid);
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("proactively refreshes a near-expiry token", async () => {
    const refreshed: ClaudeRefreshedToken = {
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: NOW + 8 * 60 * 60_000,
    };
    const deps = makeDeps({ file: credsFile(nearExpiry), refreshed });
    const out = await refreshClaudeFileTokenIfExpired(
      PATH,
      credsFile(nearExpiry),
      nearExpiry,
      deps,
    );

    expect(deps.refresh).toHaveBeenCalledWith("R1", NOW);
    expect(out?.accessToken).toBe("A2");
    expect(out?.subscriptionType).toBe("max");
  });

  it("reports signed-out (undefined) when expired with no refresh token", async () => {
    const noRef: OAuthToken = { accessToken: "A1", expiresAt: NOW - 5 * 60_000 };
    const deps = makeDeps({ file: credsFile(noRef) });
    expect(
      await refreshClaudeFileTokenIfExpired(PATH, credsFile(noRef), noRef, deps),
    ).toBeUndefined();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("refreshes, persists the rotated token, and returns it", async () => {
    const refreshed: ClaudeRefreshedToken = {
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: NOW + 8 * 60 * 60_000,
    };
    const deps = makeDeps({ file: credsFile(expired), refreshed });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(expired), expired, deps);

    expect(deps.refresh).toHaveBeenCalledWith("R1", NOW);
    expect(out?.accessToken).toBe("A2");
    expect(out?.refreshToken).toBe("R2");
    expect(out?.expiresAt).toBe(refreshed.expiresAt);
    // subscriptionType from the original token is preserved.
    expect(out?.subscriptionType).toBe("max");
    // The file was rewritten with the rotated token.
    expect(JSON.parse(deps.written.content ?? "{}").claudeAiOauth).toMatchObject({
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: refreshed.expiresAt,
    });
  });

  it("defers to a token another writer rotated DURING the network refresh (no clobber)", async () => {
    const refreshed: ClaudeRefreshedToken = {
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: NOW + 1000,
    };
    const winner = credsFile({
      accessToken: "WIN",
      refreshToken: "RWIN",
      expiresAt: NOW + 10 * 60_000,
    });
    const store = { content: credsFile(expired) };
    let written: string | undefined;
    const deps: ClaudeRefreshDeps = {
      now: () => NOW,
      readFile: () => store.content,
      writeFile: (_path, content) => {
        store.content = content;
        written = content;
      },
      refresh: async () => {
        // Simulate the CLI rotating the on-disk token while we're in flight.
        store.content = winner;
        return refreshed;
      },
    };
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(expired), expired, deps);
    expect(out?.accessToken).toBe("WIN");
    expect(written).toBeUndefined();
  });

  it("reports signed-out (undefined) when the refresh fails — never the stale token", async () => {
    // The whole point of the fix: an idle account whose refresh token is dead
    // must not keep firing the expired token at the (rate-limited) usage
    // endpoint. Returning undefined lets the collector report auth-missing.
    const deps = makeDeps({ file: credsFile(expired), refreshed: undefined });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(expired), expired, deps);
    expect(out).toBeUndefined();
    expect(deps.written.content).toBeUndefined();
  });

  it("defers to a CLI-rotated valid token when our own refresh fails", async () => {
    // Our refresh POST fails (e.g. the refresh token was already consumed by the
    // live CLI), but the on-disk file now holds the CLI's freshly rotated token.
    const winner = credsFile({
      accessToken: "WIN",
      refreshToken: "RWIN",
      expiresAt: NOW + 10 * 60_000,
    });
    const store = { content: winner };
    const deps: ClaudeRefreshDeps = {
      now: () => NOW,
      readFile: () => store.content,
      writeFile: () => {},
      refresh: async () => undefined,
    };
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(expired), expired, deps);
    expect(out?.accessToken).toBe("WIN");
  });

  it("still returns the fresh token when persisting fails", async () => {
    const refreshed: ClaudeRefreshedToken = {
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: NOW + 1000,
    };
    const deps = makeDeps({ file: credsFile(expired), refreshed });
    deps.writeFile = () => {
      throw new Error("EROFS");
    };
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(expired), expired, deps);
    expect(out?.accessToken).toBe("A2");
  });

  it("force-refreshes a still-valid rejected token", async () => {
    const refreshed: ClaudeRefreshedToken = {
      accessToken: "A2",
      refreshToken: "R2",
      expiresAt: NOW + 8 * 60 * 60_000,
    };
    const deps = makeDeps({ file: credsFile(fresh), refreshed });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(fresh), fresh, deps, {
      force: true,
    });

    expect(deps.refresh).toHaveBeenCalledWith("R1", NOW);
    expect(out?.accessToken).toBe("A2");
  });

  it("does not return the same token when a forced refresh fails", async () => {
    const deps = makeDeps({ file: credsFile(fresh), refreshed: undefined });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(fresh), fresh, deps, {
      force: true,
    });
    expect(out).toBeUndefined();
  });

  it("coalesces proactive and forced refreshes for the same credentials file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lightcode-claude-refresh-"));
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      const token: OAuthToken = {
        accessToken: "A1",
        refreshToken: "R1",
        expiresAt: NOW + 2 * 60_000,
      };
      const path = join(dir, ".credentials.json");
      let file = credsFile(token);
      writeFileSync(path, file);
      const refreshed: ClaudeRefreshedToken = {
        accessToken: "A2",
        refreshToken: "R2",
        expiresAt: NOW + 8 * 60 * 60_000,
      };
      let resolveRefresh!: (value: ClaudeRefreshedToken | undefined) => void;
      const refresh = vi.fn<
        (refreshToken: string, nowMs: number) => Promise<ClaudeRefreshedToken | undefined>
      >(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const deps: ClaudeRefreshDeps = {
        now: () => NOW,
        refresh,
        readFile: () => file,
        writeFile: (_path, content) => {
          file = content;
        },
      };

      const proactive = resolveClaudeToken({ CLAUDE_CONFIG_DIR: dir }, deps);
      const forced = refreshRejectedClaudeToken(token, { CLAUDE_CONFIG_DIR: dir }, deps);
      await Promise.resolve();
      await Promise.resolve();
      expect(refresh).toHaveBeenCalledTimes(1);

      resolveRefresh(refreshed);
      const [proactiveToken, forcedToken] = await Promise.all([proactive, forced]);
      expect(proactiveToken?.accessToken).toBe("A2");
      expect(forcedToken?.accessToken).toBe("A2");
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      if (platform) Object.defineProperty(process, "platform", platform);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
