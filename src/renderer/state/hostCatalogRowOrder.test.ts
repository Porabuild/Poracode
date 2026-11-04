import { expect, it } from "vitest";
import { orderHostRows } from "./hostCatalogRowOrder";

interface Row {
  readonly id: string;
  readonly host: string;
  readonly remoteId?: string;
}

const row = (id: string, host: string, remoteId?: string): Row => ({
  id,
  host,
  ...(remoteId ? { remoteId } : {}),
});
const inHost = (host: string) => (candidate: Row) => candidate.host === host;

it("permutes one host's rows between the slots they occupy and keeps other hosts' rows in place", () => {
  const rows = [row("a1", "a"), row("b1", "b"), row("a2", "a"), row("b2", "b"), row("a3", "a")];
  const ordered = orderHostRows(rows, inHost("a"), ["a3", "a1", "a2"]);
  expect(ordered.map((entry) => entry.id)).toEqual(["a3", "b1", "a1", "b2", "a2"]);
});

it("matches a projected row by its host id, and leaves unnamed rows after named ones in their old order", () => {
  const rows = [row("p:x", "a", "x"), row("p:y", "a", "y"), row("p:z", "a", "z")];
  expect(orderHostRows(rows, inHost("a"), ["z"]).map((entry) => entry.id)).toEqual([
    "p:z",
    "p:x",
    "p:y",
  ]);
});

it("keeps a repeated id's first rank and returns the same array when nothing moves", () => {
  const rows = [row("1", "a"), row("2", "a")];
  expect(orderHostRows(rows, inHost("a"), ["2", "1", "2"]).map((entry) => entry.id)).toEqual([
    "2",
    "1",
  ]);
  expect(orderHostRows(rows, inHost("a"), ["1", "2"])).toBe(rows);
  expect(orderHostRows(rows, inHost("a"), [])).toBe(rows);
  expect(orderHostRows([row("only", "a")], inHost("a"), ["only"])).toHaveLength(1);
});
