import { afterEach, describe, expect, it, vi } from "vitest";
import { HostLoadSampler } from "./hostLoadSampler.ts";
import { readProcessOutput } from "./asyncSampling.ts";

vi.mock("./asyncSampling.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./asyncSampling.ts")>()),
  readProcessOutput: vi.fn<typeof readProcessOutput>(),
}));
vi.mock("node:os", () => ({ cpus: () => Array(8), loadavg: () => [0, 0, 0] }));

afterEach(() => vi.clearAllMocks());

async function sample(output: string, status = 0) {
  vi.mocked(readProcessOutput).mockResolvedValue(status === 0 ? output : null);
  const sampler = new HostLoadSampler();
  sampler.start();
  await sampler.stop();
  return { sample: sampler.allSamples()[0]!, summary: await sampler.summary() };
}

describe("HostLoadSampler", () => {
  it.each([false, true])(
    "includes a pending scenario probe before serialization (failed: %s)",
    async (failed) => {
      const pending = Promise.withResolvers<string | null>();
      vi.mocked(readProcessOutput).mockReturnValue(pending.promise);
      const sampler = new HostLoadSampler();
      const from = Date.now();
      sampler.start();
      await Promise.resolve();
      const until = Date.now();
      let serialized: string | undefined;
      const finalized = sampler.window(from, until).then((window) => {
        serialized = JSON.stringify(window);
      });
      await Promise.resolve();
      expect(serialized).toBeUndefined();
      pending.resolve(failed ? null : `${process.pid} 1 node\n10 1 cargo build`);
      await finalized;
      await sampler.stop();
      expect(JSON.parse(serialized!)).toMatchObject({ samples: 1, contaminatedSamples: 1 });
      expect((await sampler.summary()).probeFailures).toBe(failed ? 1 : 0);
    },
  );

  it("excludes its process ancestry and descendants but includes a sibling test worker", async () => {
    const pid = process.pid;
    const parent = pid + 100_000;
    const result = await sample(
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

  it("does not mistake idle MCP services and incidental filename fragments for builds", async () => {
    const result = await sample(
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
  ])("recognizes a foreign build/test command: %s", async (command) => {
    const result = await sample(`${process.pid} 1 node (vitest 1)\n10 1 ${command}`);
    expect(result.sample.foreignBuildProcesses).toBe(1);
  });

  it.each([
    ["", 1],
    ["unparseable process output", 0],
  ] as const)(
    "does not label failed or incomplete probes as uncontended",
    async (output, status) => {
      const result = await sample(output, status);
      expect(result.sample.foreignBuildProcesses).toBeNull();
      expect(result.sample.contaminated).toBe(true);
      expect(result.summary.probeFailures).toBe(1);
    },
  );
});
