import { describe, expect, it } from "vitest";
import { DevicePreviewTickets } from "./DevicePreviewTickets";

const binding = {
  principal: "principal-a",
  threadId: "thread-a",
  sessionId: "lease-a",
  previewId: "preview-a",
  generation: "host-a",
  channel: "android" as const,
};

describe("feature-bound device preview tickets", () => {
  it("preserves every authority coordinate and consumes an upgrade grant once", () => {
    const tickets = new DevicePreviewTickets(() => 1000);
    const result = tickets.issue(binding, 100_000);
    expect(result.expiresAt).toBe(31_000);
    expect(tickets.consume(result.ticket)).toEqual(binding);
    expect(() => tickets.consume(result.ticket)).toThrow(expect.objectContaining({ status: 401 }));
  });

  it("refuses old/future/file/event/agent tokens and tampering", () => {
    const tickets = new DevicePreviewTickets(() => 1000);
    const result = tickets.issue(binding, 100_000);
    for (const token of [
      "",
      result.ticket.replace("dwp1_", "dwp2_"),
      result.ticket.replace("dwp1_", "pc_media_"),
      `device-v1.${"a".repeat(43)}`,
      `${result.ticket.slice(0, -1)}!`,
    ])
      expect(() => tickets.consume(token)).toThrow(expect.objectContaining({ status: 401 }));
    expect(tickets.consume(result.ticket)).toEqual(binding);
  });

  it("cannot outlive the issuing authority and removes an expired grant", () => {
    let now = 1000;
    const tickets = new DevicePreviewTickets(() => now);
    const result = tickets.issue(binding, 1500);
    expect(result.expiresAt).toBe(1500);
    now = 1500;
    expect(() => tickets.consume(result.ticket)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => tickets.issue(binding, 1500)).toThrow(expect.objectContaining({ status: 401 }));
  });

  it("bounds abandoned mints per principal and releases them at expiry/disposal", () => {
    let now = 1000;
    const tickets = new DevicePreviewTickets(() => now);
    for (let i = 0; i < 32; i++) tickets.issue(binding, 100_000);
    expect(() => tickets.issue(binding, 100_000)).toThrow(expect.objectContaining({ status: 429 }));
    expect(tickets.issue({ ...binding, principal: "principal-b" }, 100_000).ticket).toMatch(
      /^dwp1_/u,
    );
    now = 32_000;
    const result = tickets.issue(binding, 100_000);
    tickets.clear();
    expect(() => tickets.consume(result.ticket)).toThrow(expect.objectContaining({ status: 401 }));
  });
});
