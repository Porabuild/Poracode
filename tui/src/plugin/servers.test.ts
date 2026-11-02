import { expect, test } from "bun:test";
import { serverChoices, serverLabel } from "./servers";

const mac = {
  id: "s-0123456789ab",
  name: "mac",
  endpoint: "https://mac.local:49152",
  addedAt: "2026-11-01T00:00:00.000Z",
};

test("the picker lists this computer, saved servers, then pairing", () => {
  const rows = serverChoices(mac.id, [
    { ...mac, signedIn: true },
    { ...mac, id: "s-ba9876543210", name: "nas", signedIn: false },
  ]);
  expect(rows.map((row) => row.title)).toEqual([
    "This computer",
    "mac (connected)",
    "nas",
    "Pair a new server…",
  ]);
  expect(rows[2]?.description).toContain("pair again");
  expect(serverChoices(undefined, [])[0]?.title).toBe("This computer (connected)");
});

test("the status line names the server once there is more than one", () => {
  expect(serverLabel(undefined, 0)).toBeNull();
  expect(serverLabel(undefined, 1)).toBe("Server · local");
  expect(serverLabel({ name: "mac" }, 1)).toBe("Server · mac");
});
