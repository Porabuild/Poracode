import { describe, expect, it } from "vitest";
import { createCodexAdapter } from "./index";

describe("Codex utility controls", () => {
  it("sends effort and Fast using the existing native config keys", async () => {
    const selection = Object.freeze({ model: "gpt-5.5", effort: "high", fast: true });
    const command = await createCodexAdapter().buildOneShotCommand?.(
      selection.model,
      selection.effort,
      "prompt",
      undefined,
      selection.fast,
      { selection },
    );
    expect(command?.args).toEqual([
      "exec",
      "--skip-git-repo-check",
      "-m",
      "gpt-5.5",
      "-c",
      'model_reasoning_effort="high"',
      "-c",
      'service_tier="fast"',
      "-",
    ]);
  });

  it.each([{ thinking: true }, { contextSize: "1m" }])(
    "refuses unsupported %j",
    async (control) => {
      await expect(
        Promise.resolve().then(() =>
          createCodexAdapter().buildOneShotCommand?.(
            "gpt-5.5",
            undefined,
            "prompt",
            undefined,
            undefined,
            { selection: { model: "gpt-5.5", ...control } },
          ),
        ),
      ).rejects.toMatchObject({
        name: "UnsupportedOneShotControlError",
        axes: Object.keys(control),
      });
    },
  );
});
