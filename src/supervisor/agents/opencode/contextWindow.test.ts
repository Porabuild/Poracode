import { describe, expect, it, vi } from "vitest";
import type { OpenCodeClient } from "./clientTypes";
import { readOpenCodeContextWindowTokens } from "./contextWindow";

function clientWithCatalog(respond: () => Promise<unknown>): {
  client: OpenCodeClient;
  list: ReturnType<typeof vi.fn>;
} {
  const list = vi.fn<() => Promise<unknown>>(() => respond());
  return { client: { model: { list } } as unknown as OpenCodeClient, list };
}

function catalogEntry(providerID: string, id: string, context: number) {
  return { providerID, id, limit: { context, output: 64_000 } };
}

const DEEPSEEK = "opencode-go/deepseek-v4.1-flash";

describe("readOpenCodeContextWindowTokens", () => {
  it("reads limit.context for the requested composite model id", async () => {
    const { client } = clientWithCatalog(async () => ({
      data: [catalogEntry("opencode-go", "deepseek-v4.1-flash", 1_000_000)],
    }));

    await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
      1_000_000,
    );
  });

  it("returns undefined for a model the catalog does not advertise", async () => {
    const { client } = clientWithCatalog(async () => ({
      data: [catalogEntry("opencode", "gpt-6-astra", 400_000)],
    }));

    await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
      undefined,
    );
  });

  it("reuses one catalog request per server and directory", async () => {
    const { client, list } = clientWithCatalog(async () => ({
      data: [catalogEntry("opencode-go", "deepseek-v4.1-flash", 1_000_000)],
    }));

    await readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK);
    await readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK);
    await readOpenCodeContextWindowTokens(client, "/other", DEEPSEEK);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, { location: { directory: "/repo" } });
    expect(list).toHaveBeenNthCalledWith(2, { location: { directory: "/other" } });
  });

  it("retries a catalog that has not finished activating", async () => {
    let calls = 0;
    const { client } = clientWithCatalog(async () => {
      calls += 1;
      return calls === 1
        ? { data: [] }
        : { data: [catalogEntry("opencode-go", "deepseek-v4.1-flash", 1_000_000)] };
    });

    await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
      undefined,
    );
    await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
      1_000_000,
    );
  });

  it("does not cache a failed lookup", async () => {
    let calls = 0;
    const { client } = clientWithCatalog(async () => {
      calls += 1;
      if (calls === 1) throw new Error("catalog down");
      return { data: [catalogEntry("opencode-go", "deepseek-v4.1-flash", 1_000_000)] };
    });

    await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).rejects.toThrow(
      "catalog down",
    );
    await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
      1_000_000,
    );
  });

  it("keeps a miss cached until the snapshot ages out", async () => {
    const now = vi.spyOn(Date, "now");
    try {
      let calls = 0;
      const { client, list } = clientWithCatalog(async () => {
        calls += 1;
        return {
          data:
            calls === 1
              ? [catalogEntry("opencode", "gpt-6-astra", 400_000)]
              : [
                  catalogEntry("opencode", "gpt-6-astra", 400_000),
                  catalogEntry("opencode-go", "deepseek-v4.1-flash", 1_000_000),
                ],
        };
      });
      now.mockReturnValue(1_000_000);
      await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
        undefined,
      );
      // Within the TTL a miss must not refetch: a model the catalog cannot
      // answer for would otherwise cost a whole-catalog request every turn.
      await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
        undefined,
      );
      expect(list).toHaveBeenCalledTimes(1);
      // Once the snapshot ages out, a model that appeared mid-session resolves.
      now.mockReturnValue(1_000_000 + 5 * 60_000);
      await expect(readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK)).resolves.toBe(
        1_000_000,
      );
      expect(list).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it("refreshes a cached catalog once its snapshot ages out", async () => {
    const now = vi.spyOn(Date, "now");
    try {
      const { client, list } = clientWithCatalog(async () => ({
        data: [catalogEntry("opencode-go", "deepseek-v4.1-flash", 1_000_000)],
      }));
      now.mockReturnValue(1_000_000);
      await readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK);
      now.mockReturnValue(1_000_000 + 60_000);
      await readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK);
      expect(list).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_000_000 + 5 * 60_000);
      await readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK);
      expect(list).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it("passes the caller's abort signal through to the catalog request", async () => {
    const { client, list } = clientWithCatalog(async () => ({ data: [] }));
    const signal = AbortSignal.timeout(1_000);

    await readOpenCodeContextWindowTokens(client, "/repo", DEEPSEEK, signal);

    expect(list).toHaveBeenCalledWith({ location: { directory: "/repo" } }, { signal });
  });
});
