/** Unicode code-point order. Do not use localeCompare — it is locale-dependent. */
function stringCodePoints(value: string): string[] {
  const points: string[] = [];
  for (const point of value) points.push(point);
  return points;
}

export function compareCodePoints(left: string, right: string): number {
  if (left === right) return 0;
  const leftPoints = stringCodePoints(left);
  const rightPoints = stringCodePoints(right);
  const limit = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < limit; index += 1) {
    const delta =
      (leftPoints[index]!.codePointAt(0) ?? 0) - (rightPoints[index]!.codePointAt(0) ?? 0);
    if (delta !== 0) return delta;
  }
  return leftPoints.length - rightPoints.length;
}

export function sortCodePoints(values: Iterable<string>): string[] {
  return [...values].sort(compareCodePoints);
}

export function sortedUniqueCodePoints(values: Iterable<string>): string[] {
  return sortCodePoints(new Set(values));
}
