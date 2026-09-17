import { describe, expect, it } from "vitest";
import { ImageTicketStore, imageTicketRequestBodySchema } from "./imageTickets";

describe("image tickets", () => {
  it("issues a prefixed ticket and accepts exactly one consumption for the minted path", () => {
    const store = new ImageTicketStore();
    const { ticket, expiresAt } = store.issue("/host/pictures/pixel.png", 1_000);

    expect(ticket).toMatch(/^lc_img_[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toBe(new Date(31_000).toISOString());
    expect(store.size()).toBe(1);

    // Consumption succeeds once, then the ticket is spent.
    store.consume(ticket, "/host/pictures/pixel.png", 2_000);
    expect(() => store.consume(ticket, "/host/pictures/pixel.png", 2_000)).toThrow(
      /image link has expired/,
    );
    expect(store.size()).toBe(0);
  });

  it("rejects a valid ticket used for a different path and burns it", () => {
    const store = new ImageTicketStore();
    const { ticket } = store.issue("/host/pictures/pixel.png", 1_000);

    expect(() => store.consume(ticket, "/host/private/notes.png", 2_000)).toThrow(
      /image link has expired/,
    );
    expect(() => store.consume(ticket, "/host/pictures/pixel.png", 2_000)).toThrow(
      /image link has expired/,
    );
    expect(store.size()).toBe(0);
  });

  it("rejects expired tickets", () => {
    const store = new ImageTicketStore();
    const { ticket } = store.issue("/host/pictures/pixel.png", 1_000);

    expect(() => store.consume(ticket, "/host/pictures/pixel.png", 31_001)).toThrow(
      /image link has expired/,
    );
  });

  it("rejects unknown tickets without storing anything", () => {
    const store = new ImageTicketStore();
    expect(() => store.consume("lc_img_unknown", "/host/pictures/pixel.png")).toThrow(
      /image link has expired/,
    );
    expect(store.size()).toBe(0);
  });

  it("caps the live store by dropping the oldest mints", () => {
    const store = new ImageTicketStore();
    const issued: string[] = [];
    for (let index = 0; index < 300; index++) {
      issued.push(store.issue(`/host/img-${index}.png`, 1_000 + index).ticket);
    }
    expect(store.size()).toBeLessThanOrEqual(256);

    // The oldest 44 mints were evicted; the newest one still works.
    expect(() => store.consume(issued[43]!, "/host/img-43.png", 2_000)).toThrow(
      /image link has expired/,
    );
    store.consume(issued[299]!, "/host/img-299.png", 2_000);
  });

  it("requires a non-empty path at mint time", () => {
    expect(imageTicketRequestBodySchema.safeParse({ path: "" }).success).toBe(false);
    expect(imageTicketRequestBodySchema.safeParse({ path: "/host/a.png" }).success).toBe(true);
    expect(imageTicketRequestBodySchema.safeParse({}).success).toBe(false);
  });
});
