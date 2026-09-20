import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

interface InventoryFile {
  readonly inventory: {
    readonly routes: number;
    readonly procedures: number;
    readonly webSocketClientMessages: number;
    readonly webSocketServerMessages: number;
  };
}

describe("contract counts in docs (V6 F.3)", () => {
  const inventory = JSON.parse(
    readFileSync(join(repoRoot, "protocol/remote/v3/generated/inventory.json"), "utf8"),
  ) as InventoryFile;
  const { routes, procedures, webSocketClientMessages, webSocketServerMessages } =
    inventory.inventory;
  const wsTotal = webSocketClientMessages + webSocketServerMessages;

  it("keeps live architecture docs in lockstep with inventory.json", () => {
    const architecture = readFileSync(join(repoRoot, "docs/REMOTE_ARCHITECTURE.md"), "utf8");
    expect(architecture).toContain(`- ${String(routes)} HTTP routes;`);
    expect(architecture).toContain(`- ${String(procedures)} supervisor procedures;`);
    expect(architecture).toContain(
      `- ${String(webSocketClientMessages)} client-to-server WebSocket messages;`,
    );
    expect(architecture).toContain(
      `- ${String(webSocketServerMessages)} server-to-client WebSocket messages`,
    );

    const mobile = readFileSync(join(repoRoot, "docs/RELEASE_MOBILE.md"), "utf8");
    expect(mobile).toContain(
      `${String(routes)} HTTP routes, ${String(procedures)} supervisor procedures, ${String(webSocketClientMessages)} client WebSocket messages, ${String(webSocketServerMessages)}`,
    );
    expect(mobile).toContain(
      `all ${String(routes)} routes, ${String(procedures)} procedures, and ${String(wsTotal)} WebSocket`,
    );

    const v5 = readFileSync(join(repoRoot, "docs/V5_CLIENT_SERVER_HARDENING_PLAN.md"), "utf8");
    expect(v5).toContain(`(${String(routes)} routes)`);

    const v4 = readFileSync(join(repoRoot, "docs/V4_MERGE_GATES.md"), "utf8");
    expect(v4).toContain(`${String(routes)} routes, operation-map`);
  });
});
