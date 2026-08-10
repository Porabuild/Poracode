import { describe, expect, it, vi } from "vitest";
import type { BackendDatabaseCaller } from "@/shared/backendHostProtocol";
import { BackendStateStore } from "./BackendStateStore";

describe("BackendStateStore", () => {
  it("preloads synchronous shell state and writes through to BackendHost", async () => {
    const callDatabase = vi.fn<BackendDatabaseCaller["callDatabase"]>(async (name, payload) => {
      if (name === "dbGetState") return `value:${payload}` as never;
      return undefined as never;
    });
    const store = new BackendStateStore({ callDatabase });

    await store.preload(["window-bounds", "browser-tabs"]);
    expect(store.get("window-bounds")).toBe("value:window-bounds");
    expect(store.get("missing")).toBeNull();

    store.set("window-bounds", "next");
    expect(store.get("window-bounds")).toBe("next");
    expect(callDatabase).toHaveBeenCalledWith("dbSetState", {
      key: "window-bounds",
      value: "next",
    });
  });
});
