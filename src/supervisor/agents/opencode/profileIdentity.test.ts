import { describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { opencodeDefaultCapabilities } from "./detection";

const mocks = vi.hoisted(() => ({
  resolveBinary: vi.fn<() => Promise<string | undefined>>(async () => undefined),
  detectAgentInstall: vi.fn<
    () => Promise<{
      kind: string;
      label: string;
      installed: boolean;
      authState: "authenticated";
      capabilities: typeof import("./detection").opencodeDefaultCapabilities;
    }>
  >(),
}));

vi.mock("./binary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binary")>()),
  cachedOpenCodeBinary: () => undefined,
  resolveOpenCodeBinary: mocks.resolveBinary,
}));
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  detectAgentInstall: mocks.detectAgentInstall,
}));

import { createOpenCodeProfileAdapter } from "./index";

const baseStatus = {
  kind: "opencode",
  label: "OpenCode",
  installed: true,
  authState: "authenticated" as const,
  capabilities: opencodeDefaultCapabilities,
};

describe("OpenCode agent-default profile identity", () => {
  it("keeps the profile kind and label when the CLI is missing", async () => {
    mocks.resolveBinary.mockResolvedValueOnce(undefined);
    const adapter = createOpenCodeProfileAdapter({
      id: "account",
      driver: "opencode",
      displayName: "Account",
      config: { connection: "agent" },
    });
    const status = (await adapter.detectInstall?.({ envKind: "posix" })) as AgentStatus;
    expect(status.kind).toBe("opencode:account");
    expect(status.label).toBe("OpenCode Account");
  });

  it("keeps the profile kind and label on an installed base account", async () => {
    mocks.resolveBinary.mockResolvedValueOnce("/usr/bin/opencode");
    mocks.detectAgentInstall.mockResolvedValueOnce(baseStatus);
    const adapter = createOpenCodeProfileAdapter({
      id: "account",
      driver: "opencode",
      displayName: "Account",
      config: { connection: "agent" },
    });
    const status = (await adapter.detectInstall?.({ envKind: "posix" })) as AgentStatus;
    expect(status.kind).toBe("opencode:account");
    expect(status.label).toBe("OpenCode Account");
  });
});
