import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import { logAdapterError } from "./diagnostics";

describe("adapter diagnostics", () => {
  test("logs sanitized inputs and RemoteClientError details under the TUI home", async () => {
    const home = await mkdtemp(join(tmpdir(), "poracode-tui-adapter-log-"));
    try {
      await logAdapterError({
        home,
        method: "POST",
        route: "/api/session/ses-private/prompt",
        input: {
          pairingUrl: "http://127.0.0.1:49152/#token=pairing-secret",
          access_token: "access-secret",
          prompt: "x".repeat(250),
        },
        error: new RemoteClientError("host failed with token=error-secret", 500, "host_error", {
          responseEvidence: { authorization: "Bearer response-secret" },
        }),
      });
      const log = await readFile(join(home, "log", "adapter.log"), "utf8");
      expect(log).toContain('"route":"/api/session/:id/prompt"');
      expect(log).toContain('"status":500');
      expect(log).toContain('"code":"host_error"');
      expect(log).toContain('"length":250');
      expect(log).toContain(`"preview":"${"x".repeat(200)}"`);
      expect(log).not.toContain("pairing-secret");
      expect(log).not.toContain("access-secret");
      expect(log).not.toContain("error-secret");
      expect(log).not.toContain("response-secret");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
