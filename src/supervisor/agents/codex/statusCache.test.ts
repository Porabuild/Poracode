import { expect, it } from "vitest";
import { decodeAgentStatusCache, STATUS_CACHE_VERSION } from "@/shared/agentStatusCache";
import { agentCapabilitySchema } from "@/shared/contracts/agent";

it.each(["codex", "codex:work"])(
  "refreshes v81 model labels for %s in native and WSL caches",
  (kind) => {
    const stale = {
      kind,
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilitySchema.parse({
        models: [{ id: "gpt-6.1-terra", label: "GPT-6.1 Terra" }],
      }),
    };
    const unaffected = { ...stale, kind: "unaffected", label: "Unaffected" };
    const upgraded = decodeAgentStatusCache({
      version: 81,
      windows: [stale, unaffected],
      wsl: [{ ...stale, envKind: "wsl", envDistro: "Ubuntu" }],
    });
    expect(upgraded.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
    const fresh = {
      ...stale,
      capabilities: agentCapabilitySchema.parse({
        models: [{ id: "gpt-6.1-terra", label: "6.1 Terra" }],
      }),
    };
    expect(
      decodeAgentStatusCache({ version: STATUS_CACHE_VERSION, windows: [fresh], wsl: [] }).statuses,
    ).toEqual({ windows: [fresh], wsl: [], fromCache: true });
  },
);

it.each(["codex", "codex:profile"])(
  "refreshes obsolete Codex commands for %s without dropping another provider",
  (kind) => {
    const cached = {
      kind,
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: agentCapabilitySchema.parse({
        slashCommands: [{ id: "personality", label: "personality" }],
      }),
    };
    const unaffected = { ...cached, kind: "unaffected", label: "Unaffected" };
    const upgraded = decodeAgentStatusCache({
      version: 76,
      windows: [cached, unaffected],
      wsl: [{ ...cached, envKind: "wsl", envDistro: "Ubuntu" }],
    });
    expect(upgraded.statuses).toEqual({ windows: [unaffected], wsl: [], fromCache: false });
    const fresh = decodeAgentStatusCache({
      version: STATUS_CACHE_VERSION,
      windows: [cached, unaffected],
      wsl: [],
    });
    expect(fresh.statuses).toEqual({ windows: [cached, unaffected], wsl: [], fromCache: true });
  },
);
