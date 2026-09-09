import { describe, expect, it } from "vitest";
import executionEnvironmentFixture from "../../../protocol/remote/v3/fixtures/thread-config-execution-environment.json";
import { isThreadConfigEqual, threadConfigSchema } from "./config";

describe("thread execution environment", () => {
  it("persists a selected WSL distro", () => {
    expect(threadConfigSchema.parse(executionEnvironmentFixture)).toEqual({
      model: "fixture-model",
      effort: "medium",
      executionEnvironment: { kind: "wsl", distro: "Ubuntu-22.04" },
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
