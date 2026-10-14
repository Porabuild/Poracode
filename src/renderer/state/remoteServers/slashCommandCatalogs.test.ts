import { describe, expect, it, vi } from "vitest";
import type { AgentSlashCommand } from "@/shared/contracts";
import type { RemoteAgentStatuses } from "@/shared/remote/protocol";
import { applyCachedSlashCommandCatalogs, fetchSlashCommandCatalog } from "./slashCommandCatalogs";

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
});
