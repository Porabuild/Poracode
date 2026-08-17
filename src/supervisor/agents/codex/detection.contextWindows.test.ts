import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const probeCodexCapabilities = vi.hoisted(() =>
  vi.fn<typeof import("./probe").probeCodexCapabilities>(),
);

vi.mock("./probe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./probe")>();
  return {
    ...actual,
    probeCodexCapabilities,
  };
});

import { codexDetectionSpec } from "./detection";

const location: ProjectLocation = { kind: "windows", path: "C:\\repo" };

describe("codex capabilitiesProbe context windows", () => {
  beforeEach(() => {
    probeCodexCapabilities.mockReset().mockResolvedValue({
      models: [
        { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
        { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      ],
    });
  });

  it("applies the saved custom list to every probed model", async () => {
    const result = await codexDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "codex",
      agentSettings: { contextWindows: '["512k","1m"]' },
    });

    expect(result?.defaultContextSize).toBe("512k");
    expect(result?.contextSizes?.map((size) => size.id)).toEqual(["512k", "1m"]);
    expect(result?.modelContextSizes).toEqual({
      "gpt-5.6-sol": ["512k", "1m"],
      "gpt-5.6-terra": ["512k", "1m"],
    });
  });
});
