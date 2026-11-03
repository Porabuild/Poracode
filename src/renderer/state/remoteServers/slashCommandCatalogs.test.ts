import { describe, expect, it, vi } from "vitest";
import type { AgentSlashCommand } from "@/shared/contracts";
import type { RemoteAgentStatuses } from "@/shared/remote/protocol";
import {
  applyCachedSlashCommandCatalogs,
  cachedSlashCommands,
  fetchSlashCommandCatalog,
  refreshSlashCommandCatalogs,
} from "./slashCommandCatalogs";

const commands: AgentSlashCommand[] = [{ id: "review", label: "review — review it" }];

function statuses(withCommands: boolean): RemoteAgentStatuses {
  const entry = {
    kind: "claude",
    label: "Claude Code",
    installed: true,
    authState: "authenticated",
    envKind: "posix",
    capabilities: withCommands
      ? { models: [], efforts: [], settingDefs: [], slashCommands: commands }
      : { models: [], efforts: [], settingDefs: [] },
  };
  return {
    windows: [entry],
    wsl: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as RemoteAgentStatuses;
}

describe("slashCommandCatalogs", () => {
  it("fetches once per scope and kind, splicing into subsequent payloads", async () => {
    const fetcher = vi.fn<() => Promise<AgentSlashCommand[]>>(async () => commands);
    const scope = "http://host-a";
    await expect(fetchSlashCommandCatalog(scope, "claude", fetcher)).resolves.toEqual(commands);
    await expect(fetchSlashCommandCatalog(scope, "claude", fetcher)).resolves.toEqual(commands);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // A command-less statuses payload gets the catalog spliced back in.
    const patched = applyCachedSlashCommandCatalogs(scope, statuses(false));
    expect(patched.windows[0]?.capabilities?.slashCommands).toEqual(commands);
  });

  it("scopes caches per server and leaves unknown agents untouched", () => {
    const patched = applyCachedSlashCommandCatalogs("http://host-b", statuses(false));
    expect(patched.windows[0]?.capabilities?.slashCommands).toBeUndefined();
  });

  it("does not cache failures, so a retry can succeed", async () => {
    const fetcher = vi
      .fn<() => Promise<AgentSlashCommand[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(commands);
    const scope = "http://host-c";
    await expect(fetchSlashCommandCatalog(scope, "claude", fetcher)).rejects.toThrow("offline");
    await expect(fetchSlashCommandCatalog(scope, "claude", fetcher)).resolves.toEqual(commands);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes only requested catalogs and keeps other hosts isolated", async () => {
    const scope = "http://refresh-host";
    await fetchSlashCommandCatalog(scope, "claude", async () => commands);
    await fetchSlashCommandCatalog("http://other-refresh-host", "claude", async () => commands);
    const fresh = [{ id: "goal", label: "goal" }];
    const fetcher = vi.fn<(kind: string) => Promise<AgentSlashCommand[]>>(async () => fresh);
    const input = statuses(false);
    input.windows.push({ ...input.windows[0]!, kind: "codex" });
    const result = await refreshSlashCommandCatalogs(scope, input, fetcher);
    expect(fetcher.mock.calls).toEqual([["claude"]]);
    expect(result.windows[0]?.capabilities.slashCommands).toEqual(fresh);
    expect(result.windows[1]?.capabilities.slashCommands).toBeUndefined();
    expect(cachedSlashCommands("http://other-refresh-host", "claude")).toEqual(commands);
  });

  it("rejects a late pre-refresh result even when it resolves after the fresh catalog", async () => {
    const scope = "http://pending-refresh-host";
    let resolveOld!: (value: AgentSlashCommand[]) => void;
    const old = fetchSlashCommandCatalog(
      scope,
      "claude",
      () => new Promise((resolve) => (resolveOld = resolve)),
    );
    const fresh = [{ id: "goal", label: "goal" }];
    await refreshSlashCommandCatalogs(scope, statuses(false), async () => fresh);
    resolveOld(commands);
    await old;
    expect(cachedSlashCommands(scope, "claude")).toEqual(fresh);
  });

  it("drops stale commands when refresh fails and permits a subsequent retry", async () => {
    const scope = "http://failed-refresh-host";
    await fetchSlashCommandCatalog(scope, "claude", async () => commands);
    const result = await refreshSlashCommandCatalogs(scope, statuses(false), async () => {
      throw new Error("unavailable");
    });
    expect(result.windows[0]?.capabilities.slashCommands).toBeUndefined();
    expect(cachedSlashCommands(scope, "claude")).toBeUndefined();
    await expect(fetchSlashCommandCatalog(scope, "claude", async () => [])).resolves.toEqual([]);
  });

  it("retries a failed initial request on an unchanged status refresh", async () => {
    const scope = "http://initial-failure-refresh-host";
    await expect(
      fetchSlashCommandCatalog(scope, "claude", async () => {
        throw new Error("unavailable");
      }),
    ).rejects.toThrow("unavailable");
    const fetcher = vi.fn<(kind: string) => Promise<AgentSlashCommand[]>>(async () => commands);
    const result = await refreshSlashCommandCatalogs(scope, statuses(false), fetcher);
    expect(fetcher.mock.calls).toEqual([["claude"]]);
    expect(result.windows[0]?.capabilities.slashCommands).toEqual(commands);
  });

  it("uses an older host's complete status payload instead of overwriting it with cached commands", async () => {
    const scope = "http://legacy-refresh-host";
    await fetchSlashCommandCatalog(scope, "claude", async () => commands);
    const input = statuses(true);
    const fresh = [{ id: "goal", label: "goal" }];
    input.windows[0]!.capabilities.slashCommands = fresh;
    expect(
      applyCachedSlashCommandCatalogs(scope, input).windows[0]?.capabilities.slashCommands,
    ).toEqual(fresh);
    const fetcher = vi.fn<(kind: string) => Promise<AgentSlashCommand[]>>();
    const result = await refreshSlashCommandCatalogs(scope, input, fetcher);
    expect(result.windows[0]?.capabilities.slashCommands).toEqual(fresh);
    expect(cachedSlashCommands(scope, "claude")).toEqual(fresh);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forgets catalogs for providers no longer detected", async () => {
    const scope = "http://removed-provider-host";
    await fetchSlashCommandCatalog(scope, "claude", async () => commands);
    const input = statuses(false);
    input.windows[0]!.installed = false;
    const fetcher = vi.fn<(kind: string) => Promise<AgentSlashCommand[]>>();
    await refreshSlashCommandCatalogs(scope, input, fetcher);
    expect(cachedSlashCommands(scope, "claude")).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
