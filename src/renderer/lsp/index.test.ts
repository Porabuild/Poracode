import { expect, it, vi } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { PoracodeBridge } from "@/shared/ipc";

const bridge = vi.hoisted(() => ({ lspStart: vi.fn<PoracodeBridge["lspStart"]>() }));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

import { LspOrchestrator } from "./index";

it("does not start a local language server for a remote project path", async () => {
  const orchestrator = new LspOrchestrator();

  await expect(
    orchestrator.ensureServer(
      {} as Monaco,
      "remote-project",
      {
        kind: "posix",
        path: "/remote/project",
        remoteServerId: "d1",
      },
      "src/index.ts",
    ),
  ).resolves.toBeNull();
  expect(bridge.lspStart).not.toHaveBeenCalled();
});
