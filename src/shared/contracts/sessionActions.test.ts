import { describe, expect, it } from "vitest";
import { ipcProcedureMap } from "../ipc/procedureMap";
import {
  invokeThreadSessionActionPayloadSchema,
  invokeThreadSessionActionResultSchema,
} from "./sessionActions";
import { assertBoundedJson } from "../jsonBounds";

describe("session action wire boundary", () => {
  it("declares typed action ids without a raw RPC method field", () => {
    const incoming = {
      threadId: "thread-1",
      actionId: "fixture.inspect",
      payload: { value: 1 },
      method: "_unknown/rpc",
    };
    const payload = ipcProcedureMap.invokeThreadSessionAction.parseArgs(incoming);
    expect(payload).toEqual({
      threadId: "thread-1",
      actionId: "fixture.inspect",
      payload: { value: 1 },
    });
    expect(
      ipcProcedureMap.listThreadSessionActions.resultSchema?.parse({
        actions: [{ id: "fixture.inspect" }],
      }),
    ).toEqual({ actions: [{ id: "fixture.inspect" }] });
  });

  it("refuses oversized requests and lossy JSON results", () => {
    expect(
      invokeThreadSessionActionPayloadSchema.safeParse({
        threadId: "thread-1",
        actionId: "fixture.inspect",
        payload: { huge: "x".repeat(65536) },
      }).success,
    ).toBe(false);
    for (const value of [
      { value: undefined },
      { value: NaN },
      { value: BigInt(1) },
      { value: new Date() },
      { value: Array(1) },
    ]) {
      expect(invokeThreadSessionActionResultSchema.safeParse(value).success).toBe(false);
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(invokeThreadSessionActionResultSchema.safeParse(cyclic).success).toBe(false);
  });

  it("bounds UTF-8 bytes and permits repeated references without cycles", () => {
    expect(() => assertBoundedJson("é", 3)).toThrow("byte bound");
    const common = { name: "fixture" };
    expect(() => assertBoundedJson({ a: common, b: common }, 100)).not.toThrow();
  });
});
