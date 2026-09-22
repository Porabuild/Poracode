import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

interface InventoryFile {
  readonly protocolVersion: number;
  readonly bindingFormatVersion: number;
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
    expect(architecture).toContain(
      "`protocolVersion` (currently " + String(inventory.protocolVersion) + ")",
    );
    expect(architecture).toContain(
      "binding format currently " + String(inventory.bindingFormatVersion),
    );

    const mobile = readFileSync(join(repoRoot, "docs/RELEASE_MOBILE.md"), "utf8");
    expect(mobile).toContain(
      `${String(routes)} HTTP routes, ${String(procedures)} supervisor procedures, ${String(webSocketClientMessages)} client WebSocket messages, ${String(webSocketServerMessages)}`,
    );
    expect(mobile).toContain(
      `all ${String(routes)} routes, ${String(procedures)} procedures, and ${String(wsTotal)} WebSocket`,
    );

    // V4/V5 plans are dated execution histories. Their quoted counts describe
    // those revisions and must not be rewritten whenever today's registry grows.
    // Only the live architecture/release docs above track the current inventory.
  });
});
