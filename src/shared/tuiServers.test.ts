import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  findTuiServer,
  readTuiServers,
  saveTuiServer,
  takeTuiServerSwitch,
  tuiServerIdForEndpoint,
  tuiSessionDirectory,
  TUI_SERVERS_FILE_NAME,
  TUI_SERVER_SWITCH_FILE_NAME,
  writeTuiServerSwitch,
} from "./tuiServers";

const homes: string[] = [];
const tempHome = () => {
  const home = mkdtempSync(join(tmpdir(), "poracode-tui-servers-"));
  homes.push(home);
  return home;
};
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const server = (endpoint: string, name: string) => ({
  id: tuiServerIdForEndpoint(endpoint),
  name,
  endpoint,
  addedAt: "2026-11-01T00:00:00.000Z",
});

it("keeps one slot per endpoint and finds servers by id or name", () => {
  const home = tempHome();
  expect(readTuiServers(home)).toEqual([]);
  saveTuiServer(home, server("https://mac.local:49152", "mac"));
  saveTuiServer(home, server("https://nas.local:49152", "nas"));
  // Re-pairing the same endpoint replaces its entry instead of adding one.
  saveTuiServer(home, server("https://mac.local:49152", "MacBook"));
  const saved = readTuiServers(home);
  expect(saved.map((value) => value.name)).toEqual(["nas", "MacBook"]);
  expect(findTuiServer(saved, "macbook")?.endpoint).toBe("https://mac.local:49152");
  expect(findTuiServer(saved, tuiServerIdForEndpoint("https://nas.local:49152"))?.name).toBe("nas");
  expect(tuiSessionDirectory(home)).toBe(home);
  expect(tuiSessionDirectory(home, saved[0]!.id)).toBe(join(home, "servers", saved[0]!.id));
});

it("never overwrites a server list from a newer version", () => {
  const home = tempHome();
  const newer = JSON.stringify({ version: 2, servers: [{ future: true }] });
  writeFileSync(join(home, TUI_SERVERS_FILE_NAME), newer);
  expect(readTuiServers(home)).toEqual([]);
  expect(() => saveTuiServer(home, server("https://mac.local:49152", "mac"))).toThrow(
    "newer Poracode",
  );
  expect(readFileSync(join(home, TUI_SERVERS_FILE_NAME), "utf8")).toBe(newer);
});

it("consumes a switch request exactly once", () => {
  const home = tempHome();
  writeTuiServerSwitch(home, {
    kind: "pair",
    pairingUrl: "https://mac.local/#token=t",
    name: "mac",
  });
  expect(takeTuiServerSwitch(home)).toEqual({
    kind: "pair",
    pairingUrl: "https://mac.local/#token=t",
    name: "mac",
  });
  // The pairing link is a credential: the file is gone after the read.
  expect(existsSync(join(home, TUI_SERVER_SWITCH_FILE_NAME))).toBe(false);
  expect(takeTuiServerSwitch(home)).toBeUndefined();
  writeFileSync(join(home, TUI_SERVER_SWITCH_FILE_NAME), JSON.stringify({ version: 9 }));
  expect(takeTuiServerSwitch(home)).toBeUndefined();
  expect(existsSync(join(home, TUI_SERVER_SWITCH_FILE_NAME))).toBe(false);
});
