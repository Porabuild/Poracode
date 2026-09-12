import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMcpBridgeTools } from "../../mcp/toolBridge";
import poracodeMcpExtension, { type PiMcpExtensionApi } from "./mcpExtension";

vi.mock("../../mcp/toolBridge", () => ({
  registerMcpBridgeTools: vi.fn<typeof registerMcpBridgeTools>(),
  mcpBridgeToolName: vi.fn<() => string>(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("Pi extension lifecycle", () => {
  it("closes connections on reload and quit but preserves them for native session switches", async () => {
    for (const reason of ["new", "resume", "fork", "reload", "quit"]) {
      const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      vi.mocked(registerMcpBridgeTools).mockResolvedValue(close);
      vi.stubEnv(
        "PORACODE_PI_MCP",
        Buffer.from(JSON.stringify({ version: 1, servers: [] })).toString("base64url"),
      );
      const on = vi.fn<PiMcpExtensionApi["on"]>();
      await poracodeMcpExtension({ registerTool() {}, on });
      expect(on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
      const result = on.mock.calls[0]![1]({ reason });
      expect(result).toBe(
        reason === "reload" || reason === "quit" ? close.mock.results[0]?.value : undefined,
      );
      await result;
      expect(close).toHaveBeenCalledTimes(reason === "reload" || reason === "quit" ? 1 : 0);
    }
  });
  it("rejects unsupported launch envelopes before connecting", async () => {
    vi.stubEnv(
      "PORACODE_PI_MCP",
      Buffer.from(JSON.stringify({ version: 0, servers: [] })).toString("base64url"),
    );
    await expect(poracodeMcpExtension({ registerTool() {}, on() {} })).rejects.toThrow(
      "Unsupported",
    );
    expect(registerMcpBridgeTools).not.toHaveBeenCalled();
  });
});
