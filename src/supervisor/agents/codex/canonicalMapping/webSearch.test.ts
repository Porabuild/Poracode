import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

function payloadOf(event: unknown): Record<string, unknown> {
  return (event as { payload?: Record<string, unknown> }).payload ?? {};
}

function map(item: Record<string, unknown>, method: "item/started" | "item/completed") {
  return mapCodexNotification(
    method,
    { threadId: "t", item: { id: "ws-1", type: "webSearch", ...item } },
    createCodexMapperState("thread-1"),
  );
}

describe("codex webSearch action payloads", () => {
  it("does not persist args:null on the started item", () => {
    const events = map({ query: "", action: null, results: null }, "item/started");
    const started = events.find((event) => event.type === "item.started");
    const payload = payloadOf(started);
    expect("args" in payload).toBe(false);
  });

  it("maps a multi-query search to query/queries/action/result on completion", () => {
    const events = map(
      {
        query: "OpenRGB latest release ...",
        status: "completed",
        action: {
          type: "search",
          query: "OpenRGB latest release",
          queries: ["OpenRGB latest release", "OpenRGB supported devices"],
        },
        results: [
          {
            type: "text_result",
            title: "OpenRGB - Releases",
            url: "https://openrgb.org/releases.html",
          },
          { type: "text_result", title: "Airgoo", url: "https://www.airgootech.com/" },
        ],
      },
      "item/completed",
    );
    const completed = events.find((event) => event.type === "item.completed");
    const payload = payloadOf(completed);
    expect(payload.query).toBe("OpenRGB latest release · OpenRGB supported devices");
    expect(payload.action).toBe("search");
    expect(payload.queries).toEqual(["OpenRGB latest release", "OpenRGB supported devices"]);
    expect(payload.resultCount).toBe(2);
    expect(payload.args).toEqual({
      type: "search",
      query: "OpenRGB latest release",
      queries: ["OpenRGB latest release", "OpenRGB supported devices"],
    });
    expect(payload.result).toEqual({
      contents: [
        { type: "text", text: "OpenRGB - Releases\nhttps://openrgb.org/releases.html" },
        { type: "text", text: "Airgoo\nhttps://www.airgootech.com/" },
      ],
    });
  });

  it("maps openPage to open_page with the url as query", () => {
    const events = map(
      {
        query: "https://openrgb.org/releases.html",
        status: "completed",
        action: { type: "openPage", url: "https://openrgb.org/releases.html" },
        results: [
          {
            type: "text_result",
            title: "OpenRGB - Releases",
            url: "https://openrgb.org/releases.html",
          },
        ],
      },
      "item/completed",
    );
    const completed = events.find((event) => event.type === "item.completed");
    const payload = payloadOf(completed);
    expect(payload.action).toBe("open_page");
    expect(payload.url).toBe("https://openrgb.org/releases.html");
    expect(payload.query).toBe("https://openrgb.org/releases.html");
    expect(payload.queries).toBeUndefined();
  });

  it("maps findInPage to find_in_page with pattern and url", () => {
    const events = map(
      {
        status: "completed",
        action: {
          type: "findInPage",
          url: "https://openrgb.org/releases.html",
          pattern: "Release",
        },
        results: [],
      },
      "item/completed",
    );
    const completed = events.find((event) => event.type === "item.completed");
    const payload = payloadOf(completed);
    expect(payload.action).toBe("find_in_page");
    expect(payload.pattern).toBe("Release");
    expect(payload.url).toBe("https://openrgb.org/releases.html");
    expect(payload.query).toBe("Release in https://openrgb.org/releases.html");
  });
});
