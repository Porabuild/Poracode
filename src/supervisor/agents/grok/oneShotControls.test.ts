import { describe, expect, it, vi } from "vitest";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { createGrokAdapter } from "./index";
import { grokDefaultCapabilities } from "./detection";

const detect = vi.hoisted(() =>
  vi.fn<() => Promise<{ capabilities: typeof grokDefaultCapabilities }>>(),
);
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  detectAgentInstall: detect,
}));

describe("Grok utility controls", () => {
  it("reuses advertised Fast siblings and preserves explicit Fast off", async () => {
    detect.mockResolvedValue({
      capabilities: { ...grokDefaultCapabilities, fastModels: ["grok-4.7"] },
    });
    const adapter = createGrokAdapter();
    await adapter.detectInstall(); // Mocked catalog only; no provider process.
    const build = (selection: ModelSelection) =>
      Promise.resolve().then(() =>
        adapter.buildOneShotCommand?.(
          selection.model,
          selection.effort,
          "prompt",
          undefined,
          selection.fast,
          { selection },
        ),
      );
    const command = await build({ model: "grok-4.7", effort: "high", fast: true });
    expect(command?.args).toEqual([
      "--no-auto-update",
      "-p",
      "prompt",
      "-m",
      "grok-4.7-build-fast",
      "--reasoning-effort",
      "high",
      "--always-approve",
    ]);
    const standard = await build({ model: "grok-4.7-build-fast", fast: false });
    expect(standard?.args).toContain("grok-4.7");
    expect(standard?.args).not.toContain("grok-4.7-build-fast");
    for (const control of [{ fast: true }, { thinking: false }, { contextSize: "" }]) {
      await expect(build({ model: "unadvertised-model", ...control })).rejects.toMatchObject({
        name: "UnsupportedOneShotControlError",
        axes: Object.keys(control),
      });
    }
  });
});
