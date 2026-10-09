import { describe, expect, it } from "vitest";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { createPiAdapter } from "./index";

describe("Pi utility controls", () => {
  const adapter = createPiAdapter();
  const lanes = ["buildOneShotCommand", "buildTextOnlyOneShotCommand"] as const;

  it.each(lanes)("maps native effort and rejects unsupported controls on %s", async (lane) => {
    const build = (selection: ModelSelection) =>
      Promise.resolve().then(() =>
        adapter[lane]?.(selection.model, selection.effort, "prompt", undefined, selection.fast, {
          selection,
        }),
      );
    const command = await build({ model: "vendor/model", effort: "high", fast: false });
    expect(command?.args.slice(0, 5)).toEqual([
      "--approve",
      "--model",
      "vendor/model",
      "--thinking",
      "high",
    ]);
    expect(command?.args).toContain("--no-tools");
    for (const control of [
      { effort: "unsupported-effort" },
      { fast: true },
      { thinking: false },
      { contextSize: "" },
    ]) {
      await expect(build({ model: "vendor/model", ...control })).rejects.toMatchObject({
        name: "UnsupportedOneShotControlError",
        axes: Object.keys(control),
      });
    }
  });
});
