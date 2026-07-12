import { describe, expect, it } from "vitest";
import { gateAcpMcpServers, type AcpHttpMcpServer } from "./mcpBrowser";

const servers: AcpHttpMcpServer[] = [
  { type: "http", name: "browser", url: "http://127.0.0.1:9100/mcp", headers: [] },
  { type: "http", name: "subagents", url: "http://127.0.0.1:9200/mcp", headers: [] },
];

const sseServer = { type: "sse", name: "events", url: "http://127.0.0.1:9300/sse" };
const stdioServer = { name: "local", command: "mcp-local", args: [] };

describe("gateAcpMcpServers", () => {
  it("keeps HTTP servers when the agent advertises mcpCapabilities.http", () => {
    expect(gateAcpMcpServers(servers, { http: true })).toEqual(servers);
  });

  it("drops HTTP servers when the agent does not advertise http support", () => {
    expect(gateAcpMcpServers(servers, { http: false })).toEqual([]);
    expect(gateAcpMcpServers(servers, { sse: true })).toEqual([]);
    expect(gateAcpMcpServers(servers, {})).toEqual([]);
    expect(gateAcpMcpServers(servers, undefined)).toEqual([]);
  });

  it("gates SSE servers on mcpCapabilities.sse", () => {
    expect(gateAcpMcpServers([sseServer], { sse: true })).toEqual([sseServer]);
    expect(gateAcpMcpServers([sseServer], { http: true })).toEqual([]);
    expect(gateAcpMcpServers([sseServer], undefined)).toEqual([]);
  });

  it("always keeps servers without a transport type (stdio)", () => {
    expect(gateAcpMcpServers([stdioServer], undefined)).toEqual([stdioServer]);
  });

  it("returns the empty input unchanged regardless of capabilities", () => {
    expect(gateAcpMcpServers([], undefined)).toEqual([]);
    expect(gateAcpMcpServers([], { http: true })).toEqual([]);
  });
});
