import { describe, expect, it } from "vitest";
import { remoteWebSocketServerMessageSchema } from "./wire";
import { withEventEpochDeclaration } from "./eventEpoch";

describe("event-stream epoch declaration", () => {
  it("declares v1 and carries only a bound epoch, preserving other parameters", () => {
    const base = "wss://host.test/s/1/ws?ticket=t&lastSeenSeq=4&parentTicket=p";
    const bound = new URL(withEventEpochDeclaration(base, "e1"));
    expect(bound.searchParams.get("eventEpoch")).toBe("v1");
    expect(bound.searchParams.get("lastSeenEpoch")).toBe("e1");
    expect(bound.searchParams.get("parentTicket")).toBe("p");
    expect(bound.pathname).toBe("/s/1/ws");

    const unbound = new URL(withEventEpochDeclaration(bound.toString(), undefined));
    expect(unbound.searchParams.get("eventEpoch")).toBe("v1");
    expect(unbound.searchParams.has("lastSeenEpoch")).toBe(false);
    expect(withEventEpochDeclaration(unbound.toString(), undefined)).toBe(unbound.toString());
  });

  it("keeps the legacy ready shape valid and accepts the optional epoch", () => {
    expect(remoteWebSocketServerMessageSchema.parse({ type: "ready", seq: 3 })).toEqual({
      type: "ready",
      seq: 3,
    });
    expect(
      remoteWebSocketServerMessageSchema.parse({ type: "ready", seq: 3, epoch: "e1" }),
    ).toEqual({ type: "ready", seq: 3, epoch: "e1" });
    expect(
      remoteWebSocketServerMessageSchema.safeParse({ type: "ready", seq: 3, epoch: "" }).success,
    ).toBe(false);
  });
});
