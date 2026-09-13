import { describe, expect, it } from "vitest";
import { SSH_RUNTIME_ENTRY_CONFIG } from "./sshRuntimeManifest";

describe("SSH runtime build manifest", () => {
  it("preserves the structured provider client dependency", () => {
    expect(SSH_RUNTIME_ENTRY_CONFIG.supervisor).toContain("@opencode/client");
  });
});
