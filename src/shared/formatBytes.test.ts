import { describe, it, expect } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes below 1 KB as integer B", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats exactly 1 KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });

  it("caps at GB for very large values", () => {
    expect(formatBytes(1099511627776)).toBe("1024.0 GB");
  });

  it("formats 1 byte", () => {
    expect(formatBytes(1)).toBe("1 B");
  });

  it("formats fractional MB", () => {
    expect(formatBytes(2621440)).toBe("2.5 MB");
  });
});
