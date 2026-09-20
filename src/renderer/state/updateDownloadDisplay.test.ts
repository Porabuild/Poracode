import { describe, expect, it } from "vitest";
import { updateDownloadDisplay } from "./updateDownloadDisplay";

describe("updateDownloadDisplay", () => {
  it("treats the pre-progress downloading snapshot as indeterminate", () => {
    expect(updateDownloadDisplay(0, null, null)).toEqual({
      determinate: false,
      percent: 0,
      byteLine: null,
    });
  });

  it("hides a 0% label when GitHub reports no content length", () => {
    expect(updateDownloadDisplay(0, 0, 0)).toEqual({
      determinate: false,
      percent: 0,
      byteLine: null,
    });
  });

  it("shows bytes alone when transferred ticks up without a total", () => {
    expect(updateDownloadDisplay(0, 12_288, 0)).toEqual({
      determinate: false,
      percent: 0,
      byteLine: "12.0 KB",
    });
  });

  it("becomes determinate once a real total arrives", () => {
    expect(updateDownloadDisplay(42.4, 424, 1000)).toEqual({
      determinate: true,
      percent: 42,
      byteLine: "424 B / 1000 B",
    });
  });
});
