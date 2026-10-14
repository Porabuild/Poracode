import { describe, expect, it } from "vitest";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { createKimiAdapter } from "./index";

const location = { kind: "posix" as const, path: "/fixture/repo" };

describe("kimi utility control policy", () => {
  const adapter = createKimiAdapter();
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
        { model: "fixture/model", effort: "high" },
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
    const command = await build(lane, { model: "fixture/model", effort: "", fast: false });
    expect(command?.args).toContain("fixture/model");
  });
});
