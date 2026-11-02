import { relative, sep } from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import recordedDurations from "./testDurations.json" with { type: "json" };

/** Import, environment and transform cost a file adds beyond its own tests. */
const PER_FILE_OVERHEAD_MS = 250;

/**
 * Vitest's default `--shard` splits files by count, so a shard that drew the
 * slowest files ran far longer than the rest. This assigns each file to the
 * currently lightest shard, longest first, using the per-file times of a recent
 * CI run (`node scripts/update-test-durations.mjs <run id>`). Files without a
 * recorded time count as the mean. Every shard job computes the same assignment
 * from the same file list, so shards stay disjoint and complete.
 */
export function assignDurationShards(
  files: readonly { readonly id: string; readonly path: string }[],
  count: number,
  durations: Readonly<Record<string, number>> = recordedDurations,
): string[][] {
  // The mean, not the median: most recorded files sit at the 50 ms floor.
  const known = Object.values(durations);
  const fallback = known.length > 0 ? known.reduce((sum, ms) => sum + ms, 0) / known.length : 1_000;
  const weighted = files
    .map(({ id, path }) => ({ id, weight: (durations[path] ?? fallback) + PER_FILE_OVERHEAD_MS }))
    .toSorted((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shards = Array.from({ length: count }, () => ({ load: 0, files: [] as string[] }));
  for (const { id, weight } of weighted) {
    let lightest = shards[0]!;
    for (const shard of shards) if (shard.load < lightest.load) lightest = shard;
    lightest.load += weight;
    lightest.files.push(id);
  }
  return shards.map((shard) => shard.files);
}

export class DurationShardSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { shard, root } = this.ctx.config;
    if (!shard) return files;
    // A file can belong to more than one project; each pairing is one unit.
    const units = files.map((spec) => {
      const path = relative(root, spec.moduleId).split(sep).join("/");
      return { id: `${spec.project.name}:${path}`, path };
    });
    const selected = new Set(assignDurationShards(units, shard.count)[shard.index - 1]);
    return files.filter((_, index) => selected.has(units[index]!.id));
  }
}
