import { beforeEach, describe, expect, it, vi } from "vitest";

const probeMock = vi.hoisted(() => vi.fn<() => [number, number, number] | null>(() => [0, 165, 0]));
vi.mock("./plugin/install", () => ({ probeCodexCliSemver: probeMock }));

import type { ProjectLocation } from "@/shared/contracts";

const native: ProjectLocation = { kind: "windows", path: "C:\\repo" };
const ubuntu: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/repo",
  uncPath: "\\\\wsl$\\Ubuntu\\repo",
};

async function load() {
  vi.resetModules();
  return import("./agentsConfigSupport");
}

beforeEach(() => {
  probeMock.mockReset().mockReturnValue([0, 165, 0]);
});

describe("isCodexAgentsConfigSupported", () => {
  it("probes the native CLI once and caches the answer", async () => {
    const { isCodexAgentsConfigSupported } = await load();

    expect(isCodexAgentsConfigSupported(native)).toBe(true);
    expect(isCodexAgentsConfigSupported(native)).toBe(true);
    expect(probeMock).toHaveBeenCalledTimes(1);
  });

  it("treats an old or unreadable native CLI as unsupported", async () => {
    probeMock.mockReturnValue([0, 144, 2]);
    expect((await load()).isCodexAgentsConfigSupported(native)).toBe(false);

    probeMock.mockReturnValue(null);
    expect((await load()).isCodexAgentsConfigSupported(native)).toBe(false);
  });

  it("never probes for WSL and stays unsupported until detection primes it", async () => {
    const { isCodexAgentsConfigSupported, primeCodexAgentsConfigSupport } = await load();

    expect(isCodexAgentsConfigSupported(ubuntu)).toBe(false);
    expect(probeMock).not.toHaveBeenCalled();

    primeCodexAgentsConfigSupport(ubuntu, "codex-cli 0.165.0");
    expect(isCodexAgentsConfigSupported(ubuntu)).toBe(true);
  });

  it("re-evaluates when detection reports a different version", async () => {
    const { isCodexAgentsConfigSupported, primeCodexAgentsConfigSupport } = await load();

    primeCodexAgentsConfigSupport(native, "codex-cli 0.144.0");
    expect(isCodexAgentsConfigSupported(native)).toBe(false);

    primeCodexAgentsConfigSupport(native, "codex-cli 0.165.0");
    expect(isCodexAgentsConfigSupported(native)).toBe(true);
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("keeps WSL distros independent", async () => {
    const { isCodexAgentsConfigSupported, primeCodexAgentsConfigSupport } = await load();
    const debian: ProjectLocation = { ...ubuntu, distro: "Debian" };

    primeCodexAgentsConfigSupport(ubuntu, "codex-cli 0.165.0");

    expect(isCodexAgentsConfigSupported(ubuntu)).toBe(true);
    expect(isCodexAgentsConfigSupported(debian)).toBe(false);
  });
});
