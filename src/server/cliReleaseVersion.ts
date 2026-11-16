/** Compare published release versions, including the numeric nightly suffix. */
export function compareCliReleaseVersions(a: string, b: string): -1 | 0 | 1 | undefined {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u.exec(value);
    if (!match) return undefined;
    return {
      core: [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)],
      pre: match[4]?.split("."),
    };
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return undefined;
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index]! !== right.core[index]!)
      return left.core[index]! < right.core[index]! ? -1 : 1;
  }
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    const l = left.pre[index];
    const r = right.pre[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = /^\d+$/u.test(l);
    const rn = /^\d+$/u.test(r);
    if (ln && rn) {
      if (BigInt(l) !== BigInt(r)) return BigInt(l) < BigInt(r) ? -1 : 1;
      continue;
    }
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return 0;
}
export function isNightlyRelease(version: string): boolean {
  return /^\d+\.\d+\.\d+-nightly\.\d+$/u.test(version);
}
