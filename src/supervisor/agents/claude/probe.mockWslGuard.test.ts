import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetectProbeCtx } from "../base";

const readWsl = vi.hoisted(() =>
  vi.fn<typeof import("../base").readWslLoginShellCommandOutputAsync>(),
);
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readWslLoginShellCommandOutputAsync: readWsl,
}));

import { probeClaudeCapabilities } from "./probe";

const context: DetectProbeCtx = {
  location: {
    kind: "wsl",
    distro: "FixtureDistro",
    linuxPath: "/tmp/fixture",
    uncPath: "\\\\wsl.localhost\\FixtureDistro\\tmp\\fixture",
  },
  executablePath: "/fixture/agent",
};

beforeEach(() => {
  readWsl.mockReset();
  readWsl.mockResolvedValue({
    ok: true,
    stdout: '{"models":[{"id":"fixture-model"}]}',
    stderr: "",
  });
  vi.stubEnv("PORACODE_IS_DEV", "1");
});
afterEach(() => vi.unstubAllEnvs());

it("refuses before entering WSL, where parent mock flags need not exist", async () => {
  vi.stubEnv("PORACODE_MOCK_AGENTS", "1");
  const result = await probeClaudeCapabilities(context);
  expect(readWsl).not.toHaveBeenCalled();
  expect(result?.models).toBeUndefined();
  expect(result?.authLogoutSupported).toBe(true);
});

it("retains the WSL probe dispatch and result outside mock mode", async () => {
  vi.stubEnv("PORACODE_MOCK_AGENTS", "");
  const result = await probeClaudeCapabilities(context);
  expect(readWsl).toHaveBeenCalledOnce();
  expect(result?.models).toEqual([{ id: "fixture-model" }]);
});
