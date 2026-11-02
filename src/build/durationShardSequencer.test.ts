import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TestSpecification, Vitest } from "vitest/node";
import { assignDurationShards, DurationShardSequencer } from "./durationShardSequencer";
import recordedDurations from "./testDurations.json" with { type: "json" };

const units = (paths: string[]) => paths.map((path) => ({ id: `node:${path}`, path }));

describe("assignDurationShards", () => {
  it("covers every file exactly once across shards", () => {
    const files = units(Array.from({ length: 50 }, (_, index) => `src/f${index}.test.ts`));
    const durations = Object.fromEntries(files.map((file, index) => [file.path, index * 100]));

    const shards = assignDurationShards(files, 8, durations);

    expect(shards).toHaveLength(8);
    expect(shards.flat().toSorted()).toEqual(files.map((file) => file.id).toSorted());
  });

  it("keeps the slowest files apart and balances the rest by duration", () => {
    const durations = {
      "src/slow-a.test.ts": 100_000,
      "src/slow-b.test.ts": 90_000,
      ...Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`src/f${index}.test.ts`, 5_000]),
      ),
    };
    const shards = assignDurationShards(units(Object.keys(durations)), 2, durations);
    const load = (shard: string[]) =>
      shard.reduce(
        (sum, id) => sum + durations[id.slice("node:".length) as keyof typeof durations],
        0,
      );

    expect(shards[0]).toContain("node:src/slow-a.test.ts");
    expect(shards[1]).toContain("node:src/slow-b.test.ts");
    expect(Math.abs(load(shards[0]!) - load(shards[1]!))).toBeLessThanOrEqual(10_000);
  });

  it("assigns the same shards regardless of input order", () => {
    const files = units(["src/a.test.ts", "src/b.test.ts", "src/c.test.ts", "src/d.test.ts"]);
    const durations = { "src/a.test.ts": 300, "src/b.test.ts": 300, "src/c.test.ts": 900 };

    expect(assignDurationShards(files.toReversed(), 2, durations)).toEqual(
      assignDurationShards(files, 2, durations),
    );
  });

  it("weighs files without a recorded time as the mean", () => {
    // Mean 3,400 ms against a median of 100 ms: the new file must not count as cheap.
    const durations = { "src/a.test.ts": 100, "src/b.test.ts": 100, "src/c.test.ts": 10_000 };
    const shards = assignDurationShards(
      units(["src/a.test.ts", "src/b.test.ts", "src/c.test.ts", "src/new.test.ts"]),
      3,
      durations,
    );

    expect(shards).toEqual([
      ["node:src/c.test.ts"],
      ["node:src/new.test.ts"],
      ["node:src/a.test.ts", "node:src/b.test.ts"],
    ]);
  });
});

describe("DurationShardSequencer", () => {
  // The recorded data decides the weights, so pick its slowest and fastest files.
  const ranked = Object.entries(recordedDurations).toSorted(([, a], [, b]) => b - a);
  const slowest = ranked[0]![0];
  const fastest = ranked.slice(-3).map(([path]) => path);
  const root = resolve("repo-root");
  const spec = (path: string, project = "node") =>
    ({ moduleId: join(root, ...path.split("/")), project: { name: project } }) as TestSpecification;
  const sequencer = (shard?: { index: number; count: number }) =>
    new DurationShardSequencer({ config: { root, shard } } as unknown as Vitest);

  it("matches platform paths to the recorded times and keeps the slowest file alone", async () => {
    const files = [slowest, ...fastest].map((path) => spec(path));

    const first = await sequencer({ index: 1, count: 2 }).shard(files);
    const second = await sequencer({ index: 2, count: 2 }).shard(files);

    expect(first.map((file) => file.moduleId)).toEqual([files[0]!.moduleId]);
    expect(second).toHaveLength(3);
  });

  it("shards a file collected by two projects as two units", async () => {
    const files = [spec(fastest[0]!, "node"), spec(fastest[0]!, "renderer")];

    const first = await sequencer({ index: 1, count: 2 }).shard(files);
    const second = await sequencer({ index: 2, count: 2 }).shard(files);

    expect([...first, ...second]).toHaveLength(2);
    expect(first).not.toEqual(second);
  });

  it("returns every file when the run is not sharded", async () => {
    const files = [slowest, ...fastest].map((path) => spec(path));

    expect(await sequencer().shard(files)).toEqual(files);
  });
});
