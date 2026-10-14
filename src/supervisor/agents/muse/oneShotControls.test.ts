import { describe, expect, it } from "vitest";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { createMuseAdapter } from "./index";

const location = { kind: "posix" as const, path: "/fixture/repo" };

describe("muse utility control policy", () => {
  const adapter = createMuseAdapter();
  const lanes = ["general"] as const;
  function build(_lane: (typeof lanes)[number], selection: ModelSelection) {
    return Promise.resolve().then(() =>
      adapter.buildOneShotCommand?.(
        selection.model,
        selection.effort,
        "prompt",
        location,
        selection.fast,
        { selection },
      ),
    );
  }

  it.each(lanes)(
    "refuses unsupported controls on %s before returning executable argv",
    async (lane) => {
      const controls: ModelSelection[] = [
        { model: "fixture/model", fast: true },
        { model: "fixture/model", thinking: false },
        { model: "fixture/model", contextSize: "default" },
      ];
      for (const selection of controls) {
        await expect(build(lane, selection)).rejects.toMatchObject({
          name: "UnsupportedOneShotControlError",
          axes: Object.keys(selection).filter((key) => key !== "model"),
        });
      }
    },
  );

  it.each(lanes)("applies the declared native controls on %s", async (lane) => {
    const command = await build(lane, { model: "fixture/model", effort: "high", fast: false });
    expect(command?.args).toContain("fixture/model");
    const effortFlag = command!.args.indexOf("--reasoning-effort");
    expect(effortFlag).toBeGreaterThanOrEqual(0);
    expect(command!.args[effortFlag + 1]).toBe("high");
  });
});
