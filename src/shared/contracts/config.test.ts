import { describe, expect, it } from "vitest";
import { isThreadConfigEqual, threadConfigSchema } from "./config";

describe("thread execution environment", () => {
  it("persists a selected WSL distro", () => {
    expect(
      threadConfigSchema.parse({
        model: "model",
        executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
      }),
    ).toEqual({
      model: "model",
      executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
    });
  });

  it("treats a distro change as a config change", () => {
    expect(
      isThreadConfigEqual(
        { model: "model", executionEnvironment: { kind: "wsl", distro: "Ubuntu" } },
        { model: "model", executionEnvironment: { kind: "wsl", distro: "Debian" } },
      ),
    ).toBe(false);
  });
});
