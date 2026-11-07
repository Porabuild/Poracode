import { describe, expect, it } from "vitest";
import { formatMessageTimestamp } from "./formatTime";

describe("formatMessageTimestamp", () => {
  const locale = "en-GB";
  const now = new Date(2026, 9, 23, 14, 30);

  it("shows only local time for today", () => {
    expect(formatMessageTimestamp(new Date(2026, 9, 23, 9, 5).getTime(), locale, now)).toBe("9:05");
  });

  it("shows weekday and local time for earlier days this week", () => {
    expect(formatMessageTimestamp(new Date(2026, 9, 22, 9, 5).getTime(), locale, now)).toBe(
      "Thu 09:05",
    );
  });

  it("shows date and local time for previous weeks", () => {
    const date = new Date(2026, 9, 18, 9, 5);
    expect(formatMessageTimestamp(date.getTime(), locale, now)).toBe(
      date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }),
    );
  });

  it("starts a new week on Monday across a year boundary", () => {
    const monday = new Date(2024, 0, 1, 0, 1);
    const sunday = new Date(2023, 11, 31, 23, 59);
    expect(formatMessageTimestamp(sunday.getTime(), locale, monday)).toBe(
      sunday.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }),
    );
  });

  it("switches to weekday after local midnight", () => {
    const midnight = new Date(2026, 9, 23, 0, 0);
    expect(formatMessageTimestamp(new Date(2026, 9, 22, 23, 59).getTime(), locale, midnight)).toBe(
      "Thu 23:59",
    );
  });
});
