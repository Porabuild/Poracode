import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendDatabaseCaller } from "@/shared/backendHostProtocol";
import { BackendStateStore } from "./BackendStateStore";

describe("BackendStateStore", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("drains pending writes before shutdown and ignores late window-close saves", async () => {
    const write = Promise.withResolvers<never>();
    const callDatabase = vi.fn<BackendDatabaseCaller["callDatabase"]>(() => write.promise);
    const store = new BackendStateStore({ callDatabase });
    store.set("window-bounds", "final bounds");
    const closed = vi.fn<() => void>();
    const closing = store.close().then(closed);
    store.set("window-bounds", "late close notification");
    await Promise.resolve();
    expect(closed).not.toHaveBeenCalled();
    expect(callDatabase).toHaveBeenCalledOnce();
    expect(store.get("window-bounds")).toBe("final bounds");
    write.resolve(undefined as never);
    await closing;
    expect(closed).toHaveBeenCalledOnce();
  });

  it("reports failed writes without an unhandled rejection or blocking shutdown", async () => {
    const error = new Error("Backend host unavailable.");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const callDatabase = vi.fn<BackendDatabaseCaller["callDatabase"]>().mockRejectedValue(error);
    const store = new BackendStateStore({ callDatabase });
    store.set("browser-tabs", "latest local tabs");
    await store.close();
    expect(warn).toHaveBeenCalledWith(
      "[poracode] failed to persist shell state",
      "browser-tabs",
      error,
    );
  });
});
