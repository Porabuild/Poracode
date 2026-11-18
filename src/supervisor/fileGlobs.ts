import { Minimatch, type MinimatchOptions } from "minimatch";

function compilePatterns(patterns: readonly string[], matchBase: boolean) {
  const options: MinimatchOptions = {
    dot: true,
    matchBase,
    nocomment: true,
    nonegate: true,
    platform: "linux",
    optimizationLevel: 0,
  };
  return patterns.filter(Boolean).map((pattern) => {
    let negated = false;
    let start = 0;
    while (pattern[start] === "!" && pattern[start + 1] !== "(") {
      negated = !negated;
      start++;
    }
    const glob = pattern.slice(start).replace(/^\.\//, "");
    const matcher = new Minimatch(glob, options);
    // A trailing globstar also covers the directory itself.
    const directory = glob.endsWith("/**") ? new Minimatch(glob.slice(0, -3), options) : undefined;
    return {
      negated,
      negatedExtglob: glob.startsWith("!("),
      matches: (path: string) => matcher.match(path) || directory?.match(path) === true,
    };
  });
}

export function compileGlobMatcher(patterns: readonly string[], matchBase = false) {
  const compiled = compilePatterns(patterns, matchBase);
  return (path: string) => compiled.some(({ matches, negated }) => matches(path) !== negated);
}

export function compileOrderedGlobMatcher(patterns: readonly string[]) {
  const compiled = compilePatterns(patterns, false);
  const allNegated =
    compiled.length > 0 &&
    compiled.every(({ negated, negatedExtglob }) => negated || negatedExtglob);
  return (path: string) => {
    let matched = allNegated;
    for (const { matches, negated, negatedExtglob } of compiled) {
      if (negated || negatedExtglob) {
        if (matches(path) === negated) matched = false;
      } else if (matches(path)) {
        matched = true;
      }
    }
    return matched;
  };
}

// Search excludes also apply to descendants of a matching directory.
export function expandDirectoryGlobs(patterns: readonly string[]): string[] {
  return patterns.flatMap((pattern) =>
    pattern.endsWith("*") ? [pattern] : [pattern, `${pattern}/**`],
  );
}
