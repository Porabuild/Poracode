import { describe, expect, it, vi } from "vitest";
import type { AgentEnvContext } from "../base";
import { AgentStatusPublication } from "../../runtime/agentStatusPublication";

// Probe I/O is outside this test; retain the real adapter factory and shared
// publication admission so an incorrect detection identity cannot disappear.
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  detectAgentInstall: vi.fn<typeof import("../base").detectAgentInstall>(async (ctx, spec) => ({
    kind: spec.kind,
    label: spec.label,
    installed: true,
    authState: "authenticated",
    capabilities: spec.capabilities,
    envKind: ctx?.envKind ?? "posix",
    ...(ctx?.wslDistro ? { envDistro: ctx.wslDistro } : {}),
  })),
}));

import { createDevinProfileAdapter } from "./profiles";
import { createDevinAdapter } from "./index";

describe("profile detection publication", () => {
  it.each<AgentEnvContext>([{ envKind: "posix" }, { envKind: "wsl", wslDistro: "Ubuntu" }])(
    "publishes two same-login profiles independently in $envKind",
    async (ctx) => {
      const publication = new AgentStatusPublication();
      const adapters = ["a", "b"].map((id) =>
        createDevinProfileAdapter({
          id,
          driver: "devin",
          displayName: id.toUpperCase(),
          config: { format: 1, auth: { kind: "native-default" }, configPath: `/qa/${id}.json` },
        }),
      );
      for (const adapter of adapters) {
        const target = {
          kind: adapter.kind,
          envKind: ctx.envKind,
          ...(ctx.wslDistro ? { envDistro: ctx.wslDistro } : {}),
        };
        const ticket = publication.begin([target]);
        const status = await adapter.detectInstall(ctx);
        expect(status).toMatchObject({ kind: adapter.kind, label: adapter.label });
        expect(publication.accept(ticket, target, status)).toMatchObject(target);
        publication.complete(ticket);
      }
      const view = publication.view({ windows: [], wsl: [], fromCache: false });
      expect([...view.windows, ...view.wsl].map((status) => status.kind)).toEqual([
        "devin:a",
        "devin:b",
      ]);
    },
  );

  it("keeps the default adapter identity", async () => {
    expect(await createDevinAdapter().detectInstall({ envKind: "posix" })).toMatchObject({
      kind: "devin",
      label: "Devin",
    });
  });
});
