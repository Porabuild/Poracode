export const OPERATION_KINDS = [
  "route",
  "procedure",
  "ws-client",
  "ws-server",
  "replay",
  "runtime",
] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];

export const COVERAGE_STATUSES = [
  "unexercised",
  "mock-passed",
  "real-passed",
  "negative-passed",
  "host-mode-unavailable",
] as const;

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export function operationKey(kind: OperationKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseOperationKey(key: string): { kind: OperationKind; id: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const kind = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!(OPERATION_KINDS as readonly string[]).includes(kind) || id.length === 0) return null;
  return { kind: kind as OperationKind, id };
}
