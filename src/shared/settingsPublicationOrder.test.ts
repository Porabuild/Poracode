import { describe, expect, it } from "vitest";
import { SettingsPublicationOrder } from "./settingsPublicationOrder";

describe("settings publication ordering", () => {
  it("requires a covering snapshot after a known gap, including newer gaps during a pending read", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    order.acceptSnapshot(order.beginSnapshot(connection)!, { authorityId: "fixture", sequence: 0 });
    const pending = order.beginSnapshot(connection)!;
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 3 })).toBe("resync");
    expect(order.acceptSnapshot(pending, { authorityId: "fixture", sequence: 1 })).toBe("resync");
    const retry = order.beginSnapshot(connection)!;
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 5 })).toBe("resync");
    expect(order.acceptSnapshot(retry, { authorityId: "fixture", sequence: 4 })).toBe("resync");
    expect(
      order.acceptSnapshot(order.beginSnapshot(connection)!, {
        authorityId: "fixture",
        sequence: 5,
      }),
    ).toBe("apply");
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 6 })).toBe("apply");
  });

  it("accepts an already-pending read if it covers the observed gap", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    order.acceptSnapshot(order.beginSnapshot(connection)!, { authorityId: "fixture", sequence: 0 });
    const pending = order.beginSnapshot(connection)!;
    order.acceptDelta(connection, { authorityId: "fixture", sequence: 3 });
    expect(order.acceptSnapshot(pending, { authorityId: "fixture", sequence: 3 })).toBe("apply");
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 4 })).toBe("apply");
  });

  it("does not accept an initial snapshot below a publication already observed", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    const pending = order.beginSnapshot(connection)!;
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 3 })).toBe("resync");
    expect(order.acceptSnapshot(pending, { authorityId: "fixture", sequence: 1 })).toBe("resync");
    expect(
      order.acceptSnapshot(order.beginSnapshot(connection)!, {
        authorityId: "fixture",
        sequence: 3,
      }),
    ).toBe("apply");
  });

  it("does not partially resume a gapped projection before the covering snapshot", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    order.acceptSnapshot(order.beginSnapshot(connection)!, { authorityId: "fixture", sequence: 0 });
    order.acceptDelta(connection, { authorityId: "fixture", sequence: 3 });
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 1 })).toBe("resync");
    expect(
      order.acceptSnapshot(order.beginSnapshot(connection)!, {
        authorityId: "fixture",
        sequence: 2,
      }),
    ).toBe("resync");
  });

  it("rejects older overlapping reads and snapshots older than an applied delta", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    const old = order.beginSnapshot(connection)!;
    const current = order.beginSnapshot(connection)!;
    expect(order.acceptSnapshot(current, { authorityId: "fixture", sequence: 4 })).toBe("apply");
    expect(order.acceptSnapshot(old, { authorityId: "fixture", sequence: 3 })).toBe("ignore");
    const refresh = order.beginSnapshot(connection)!;
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 5 })).toBe("apply");
    expect(order.acceptSnapshot(refresh, { authorityId: "fixture", sequence: 4 })).toBe("ignore");
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 5 })).toBe("ignore");
    expect(order.acceptDelta(connection, { authorityId: "fixture", sequence: 3 })).toBe("ignore");
  });

  it("cannot reuse a completed snapshot request to replace the authority again", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    const request = order.beginSnapshot(connection)!;
    expect(order.acceptSnapshot(request, { authorityId: "current", sequence: 4 })).toBe("apply");
    expect(order.acceptSnapshot(request, { authorityId: "old", sequence: 999 })).toBe("ignore");
    expect(order.acceptDelta(connection, { authorityId: "current", sequence: 5 })).toBe("apply");
  });

  it("reconnects on authority change and fences old reads and events from the previous connection", () => {
    const order = new SettingsPublicationOrder();
    const oldConnection = order.reset();
    order.acceptSnapshot(order.beginSnapshot(oldConnection)!, { authorityId: "old", sequence: 0 });
    const oldRead = order.beginSnapshot(oldConnection)!;
    expect(order.acceptDelta(oldConnection, { authorityId: "new", sequence: 1 })).toBe("reconnect");
    expect(order.acceptSnapshot(oldRead, { authorityId: "old", sequence: 1 })).toBe("ignore");
    expect(order.beginSnapshot(oldConnection)).toBeUndefined();
    const connection = order.reset();
    const read = order.beginSnapshot(connection)!;
    expect(order.acceptDelta(oldConnection, { authorityId: "old", sequence: 10 })).toBe("ignore");
    expect(order.acceptDelta(oldConnection, { authorityId: "new", sequence: 9 })).toBe("ignore");
    expect(order.acceptSnapshot(read, { authorityId: "new", sequence: 1 })).toBe("apply");
    expect(order.acceptDelta(connection, { authorityId: "new", sequence: 2 })).toBe("apply");
    expect(order.acceptSnapshot(oldRead, { authorityId: "old", sequence: 99 })).toBe("ignore");
    expect(order.beginSnapshot(oldConnection)).toBeUndefined();
  });

  it("requires reconnect when a snapshot itself reports a new authority", () => {
    const order = new SettingsPublicationOrder();
    const connection = order.reset();
    order.acceptSnapshot(order.beginSnapshot(connection)!, { authorityId: "old", sequence: 5 });
    expect(
      order.acceptSnapshot(order.beginSnapshot(connection)!, { authorityId: "new", sequence: 0 }),
    ).toBe("reconnect");
    expect(order.acceptDelta(connection, { authorityId: "old", sequence: 6 })).toBe("reconnect");
    expect(order.beginSnapshot(connection)).toBeUndefined();
  });
});
