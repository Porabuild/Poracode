import { describe, expect, it } from "vitest";
import { isCursorSdkCancellation } from "./sdkCancellation";

describe("Cursor SDK detached cancellation", () => {
  it("recognizes native aborts and Connect cancellation wrappers", () => {
    const native = new DOMException("This operation was aborted", "AbortError");
    const node = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
      code: "ABORT_ERR",
    });
    const connect = Object.assign(new Error("[canceled] request ended"), {
      name: "ConnectError",
      code: 1,
    });
    const unknown = Object.assign(new Error("[unknown] [canceled] This operation was aborted"), {
      name: "ConnectError",
      code: 2,
    });
    for (const reason of [
      native,
      node,
      connect,
      unknown,
      new Error("wrapped", { cause: native }),
    ]) {
      expect(isCursorSdkCancellation(reason)).toBe(true);
    }
  });

  it("leaves unrelated errors, incidental cancellation text, and malformed causes fatal", () => {
    const cyclic = new Error("cycle");
    cyclic.cause = cyclic;
    for (const reason of [
      new Error("This operation was aborted"),
      new Error("[unknown] [canceled] This operation was aborted"),
      Object.assign(new Error("[unknown] failed"), { name: "ConnectError", code: 2 }),
      Object.assign(new Error("[aborted] transaction failed"), { name: "ConnectError", code: 10 }),
      Object.assign(new Error("abort handler crashed"), { name: "AbortError" }),
      cyclic,
      null,
      undefined,
      "[canceled] request ended",
      1,
    ]) {
      expect(isCursorSdkCancellation(reason)).toBe(false);
    }
  });
});
