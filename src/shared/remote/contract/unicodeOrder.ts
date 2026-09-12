/**
 * Stable Unicode code-point ordering. `String.prototype.localeCompare` is
 * locale- and implementation-dependent; canonical protocol output must not be.
 *
 * Iteration uses the string iterator (UTF-16 surrogate pairs → one code point).
 */
export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const limit = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < limit; index += 1) {
    const leftCode = leftPoints[index]!.codePointAt(0)!;
    const rightCode = rightPoints[index]!.codePointAt(0)!;
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return leftPoints.length - rightPoints.length;
}

export function sortByUnicodeCodePoints(values: readonly string[]): string[] {
  return [...values].sort(compareUnicodeCodePoints);
}
