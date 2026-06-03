import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const buildAgentCommandMock = vi.hoisted(() =>
  vi.fn<(location: ProjectLocation, command: string, args: string[]) => unknown>(),
);

vi.mock("./agents/base", () => ({ buildAgentCommand: buildAgentCommandMock }));

import { buildOneShotSpec } from "./oneShotSpawn";

beforeEach(() => {
  vi.clearAllMocks();
  buildAgentCommandMock.mockImplementation((location) => ({ command: "agy", args: [], location }));
});

function capturedLocation(): ProjectLocation {
  return buildAgentCommandMock.mock.calls[0]?.[0] as ProjectLocation;
}

describe("buildOneShotSpec isolateCwd", () => {
  const windowsProject: ProjectLocation = { kind: "windows", path: "C:\\Users\\demo\\project" };
  const wslProject: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/demo/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
  };

  it("uses the project cwd by default", () => {
    buildOneShotSpec(windowsProject, "agy", ["-p", "hi"]);
    expect(capturedLocation()).toEqual(windowsProject);
  });

  it("redirects a native one-shot to the OS temp dir when isolated", () => {
    buildOneShotSpec(windowsProject, "agy", ["-p", "hi"], { isolateCwd: true });
    expect(capturedLocation()).toEqual({ kind: "windows", path: tmpdir() });
  });

  it("redirects a WSL one-shot to /tmp inside the distro when isolated", () => {
    buildOneShotSpec(wslProject, "agy", ["-p", "hi"], { isolateCwd: true });
    // Distro + uncPath are preserved; only the working directory is neutralized.
    expect(capturedLocation()).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/tmp",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
    });
  });

  it("does not neutralize the cwd when isolateCwd is false", () => {
    buildOneShotSpec(wslProject, "agy", ["-p", "hi"], { isolateCwd: false });
    expect(capturedLocation()).toEqual(wslProject);
  });
});
