import { describe, expect, it, vi } from "vitest";
import type { ClaudeRefreshedToken, OAuthToken } from "@lightcode/agents-usage";
import {
  type ClaudeRefreshDeps,
  isClaudeTokenExpired,
  mergeClaudeCredentialsJson,
  refreshClaudeFileTokenIfExpired,
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
  it("only reports expiry once the token is past expiry plus the grace window", () => {
    expect(isClaudeTokenExpired({ expiresAt: NOW - 60_000 }, NOW)).toBe(true); // 60s past expiry
    // Still valid, and just-barely-past-expiry tokens are left for a live CLI to rotate first.
    expect(isClaudeTokenExpired({ expiresAt: NOW - 10_000 }, NOW)).toBe(false); // within 30s grace
    expect(isClaudeTokenExpired({ expiresAt: NOW + 30_000 }, NOW)).toBe(false); // not yet expired
    expect(isClaudeTokenExpired({ expiresAt: NOW + 5 * 60_000 }, NOW)).toBe(false);
  });

  it("never reports expiry when expiresAt is absent", () => {
    expect(isClaudeTokenExpired({}, NOW)).toBe(false);
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
  const fresh: OAuthToken = { accessToken: "A1", refreshToken: "R1", expiresAt: NOW + 5 * 60_000 };
  // Well past expiry + grace, so refresh is eligible to fire.
  const expired: OAuthToken = {
    accessToken: "A1",
    refreshToken: "R1",
    expiresAt: NOW - 5 * 60_000,
    subscriptionType: "max",
  };

  it("returns the token untouched when it is not expired", async () => {
    const deps = makeDeps({ file: credsFile(fresh) });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(fresh), fresh, deps);
    expect(out).toBe(fresh);
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("returns the token untouched when there is no refresh token", async () => {
    const noRef: OAuthToken = { accessToken: "A1", expiresAt: NOW - 5 * 60_000 };
    const deps = makeDeps({ file: credsFile(noRef) });
    expect(await refreshClaudeFileTokenIfExpired(PATH, credsFile(noRef), noRef, deps)).toBe(noRef);
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
    expect(out.accessToken).toBe("A2");
    expect(out.refreshToken).toBe("R2");
    expect(out.expiresAt).toBe(refreshed.expiresAt);
    // subscriptionType from the original token is preserved.
    expect(out.subscriptionType).toBe("max");
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
      expiresAt: NOW + 5 * 60_000,
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
    expect(out.accessToken).toBe("WIN");
    expect(written).toBeUndefined();
  });

  it("keeps the original token when the refresh fails", async () => {
    const deps = makeDeps({ file: credsFile(expired), refreshed: undefined });
    const out = await refreshClaudeFileTokenIfExpired(PATH, credsFile(expired), expired, deps);
    expect(out).toStrictEqual(expired);
    expect(deps.written.content).toBeUndefined();
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
    expect(out.accessToken).toBe("A2");
  });
});
