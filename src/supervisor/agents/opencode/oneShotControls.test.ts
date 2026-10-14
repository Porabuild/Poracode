import { describe, expect, it } from "vitest";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { createOpenCodeAdapter } from "./index";

const location = { kind: "posix" as const, path: "/fixture/repo" };
const session = { providerSessionId: "fixture-session", discoveredAt: "2026-10-09" };

describe("opencode utility control policy", () => {
  const adapter = createOpenCodeAdapter();
  const lanes = ["general", "resume"] as const;
  function build(lane: (typeof lanes)[number], selection: ModelSelection) {
    return Promise.resolve().then(() =>
      lane === "general"
        ? adapter.buildOneShotCommand?.(
            selection.model,
            selection.effort,
            "prompt",
            location,
            selection.fast,
            { selection },
          )
        : adapter.buildContextExtractionCommand?.(session, location, selection.model, {
            selection,
          }),
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
