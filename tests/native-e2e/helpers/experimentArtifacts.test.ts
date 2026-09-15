import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn<typeof import("node:child_process").spawnSync>(),
}));

import { spawnSync } from "node:child_process";
import { captureTreeDiff, writeExperimentArtifact } from "./experimentArtifacts.ts";

describe("experiment artifact credential handling", () => {
  it("redacts every credential-shaped diff literal while retaining surrounding changes", () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout:
        "+ pair=lc_pair_fixture\n+ access=lc_access_fixture\n+ ticket=lc_ws_fixture\n+ unchanged text\n",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    });
    expect(captureTreeDiff("/fixture")).toBe(
      "+ pair=[REDACTED CREDENTIAL]\n+ access=[REDACTED CREDENTIAL]\n+ ticket=[REDACTED CREDENTIAL]\n+ unchanged text\n",
    );
  });

  it.each(["lc_pair_fixture", "lc_access_fixture", "lc_ws_fixture"])(
    "still refuses secret-shaped measurement payloads: %s",
    (credential) => {
      expect(() => writeExperimentArtifact("/fixture", "metrics.json", { credential })).toThrow(
        "secret-shaped material detected",
      );
    },
  );
});
