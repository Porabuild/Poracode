import { expect, it, vi } from "vitest";

vi.mock("poracode:tool-presentation-adapters", () => ({
  toolPresentationAdapters: [
    {
      normalizeMcpServerIdentifier: (server: string) =>
        server.startsWith("transport_") ? server.slice("transport_".length) : undefined,
    },
  ],
}));

import { formatMcpToolTitle, normalizeMcpServerIdentifier } from "./toolPresentationAdapters";

it("applies supplied namespace hooks only to display labels", () => {
  const info = { server: "transport_my_docs", tool: "get_item" };
  expect(formatMcpToolTitle(info)).toBe("my docs: get_item");
  expect(info).toEqual({ server: "transport_my_docs", tool: "get_item" });
  expect(normalizeMcpServerIdentifier("ordinary_server")).toBe("ordinary_server");
  expect(formatMcpToolTitle({ server: "Ordinary_Server", tool: "get_item" })).toBe(
    "Ordinary Server: get_item",
  );
});
