import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostLoadSampler } from "./hostLoadSampler.ts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn<typeof spawnSync>() }));
vi.mock("node:os", () => ({ cpus: () => Array(8), loadavg: () => [0, 0, 0] }));

afterEach(() => vi.clearAllMocks());

function sample(output: string, status = 0) {
  vi.mocked(spawnSync).mockReturnValue({ status, stdout: output } as ReturnType<typeof spawnSync>);
  const sampler = new HostLoadSampler();
  sampler.start();
  sampler.stop();
  return { sample: sampler.allSamples()[0]!, summary: sampler.summary() };
}

describe("HostLoadSampler", () => {
  it("excludes its process ancestry and descendants but includes a sibling test worker", () => {
    const pid = process.pid;
    const parent = pid + 100_000;
    const result = sample(
      [
        `${pid} ${parent} node (vitest 1)`,
        `${parent} 1 node /tools/vitest/vitest.mjs run constrainedNetwork.test.ts`,
        `${pid + 1} ${pid} node /repo/dist/main/server.cjs`,
        `${pid + 2} ${pid + 1} /tools/clang fixture.c`,
        `${pid + 3} ${parent} node (vitest 2)`,
      ].join("\n"),
    );
    expect(result.sample.foreignBuildProcesses).toBe(1);
    expect(result.sample.contaminated).toBe(true);
  });

  it("does not mistake idle MCP services and incidental filename fragments for builds", () => {
    const result = sample(
      [
        `${process.pid} 1 node (vitest 1)`,
        "10 1 npm exec xcodebuildmcp@latest mcp",
        "11 10 node /cache/node_modules/.bin/xcodebuildmcp mcp",
        "12 1 node /app/my-vitest-report.js",
        "13 1 node /app/esbuild-service-monitor.js",
      ].join("\n"),
    );
    expect(result.sample.foreignBuildProcesses).toBe(0);
    expect(result.sample.contaminated).toBe(false);
  });

  it.each([
    "/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test",
    "/tools/swift-frontend -c file.swift",
    "node /repo/node_modules/.bin/vitest run other.test.ts",
    "node /repo/node_modules/typescript/lib/tsc.js --noEmit",
    "/usr/bin/clang++ -c app.cpp",
    "./gradlew testDebugUnitTest",
    "cargo test",
  ])("recognizes a foreign build/test command: %s", (command) => {
    const result = sample(`${process.pid} 1 node (vitest 1)\n10 1 ${command}`);
    expect(result.sample.foreignBuildProcesses).toBe(1);
  });

  it.each([
    ["", 1],
    ["unparseable process output", 0],
  ] as const)("does not label failed or incomplete probes as uncontended", (output, status) => {
    const result = sample(output, status);
    expect(result.sample.foreignBuildProcesses).toBeNull();
    expect(result.sample.contaminated).toBe(true);
    expect(result.summary.probeFailures).toBe(1);
  });
});
