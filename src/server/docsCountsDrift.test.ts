import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Docs drift guard (V6 F.3): the route counts and protocol/version numbers
// quoted in the remote-architecture docs must come from
// protocol/remote/v3/generated/inventory.json, never from typed literals.
// Each test extracts the printed number from a stable sentence anchor, so the
// guard keeps working when a count changes — and fails loudly (asking for the
// anchor to be re-pointed) if a sentence is reworded past recognition.
// This is the docs owner's copy of the guard; it lives under src/server
// because the protocol/remote/v3 test directory is owned by the protocol
// agent, and tests/ is outside every vitest project's include patterns.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

interface GeneratedInventory {
  readonly protocolVersion: number;
  readonly bindingFormatVersion: number;
  readonly inventory: {
    readonly routes: number;
    readonly procedures: number;
    readonly webSocketClientMessages: number;
    readonly webSocketServerMessages: number;
  };
}

function loadDoc(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** Extract the number the doc prints at the anchor sentence. */
function printedNumber(doc: string, label: string, anchor: RegExp): number {
  const match = anchor.exec(doc);
  if (!match || match[1] === undefined) {
    throw new Error(
      `Docs drift: anchor for "${label}" no longer matches — the sentence was reworded or removed. Re-point the anchor in this test.`,
    );
  }
  return Number(match[1]);
}

describe("docs quote inventory.json numbers (V6 F.3 docs drift)", () => {
  const generated = JSON.parse(
    readFileSync(join(repoRoot, "protocol/remote/v3/generated/inventory.json"), "utf8"),
  ) as GeneratedInventory;
  const { routes, procedures, webSocketClientMessages, webSocketServerMessages } =
    generated.inventory;

  it("REMOTE_ARCHITECTURE: HTTP-routes bullet matches the generated route count", () => {
    const doc = loadDoc("docs/REMOTE_ARCHITECTURE.md");
    expect(printedNumber(doc, "HTTP route count", /^- (\d+) HTTP routes/m)).toBe(routes);
  });

  it("REMOTE_ARCHITECTURE: supervisor-procedures bullet matches the generated procedure count", () => {
    const doc = loadDoc("docs/REMOTE_ARCHITECTURE.md");
    expect(printedNumber(doc, "procedure count", /^- (\d+) supervisor procedures/m)).toBe(
      procedures,
    );
  });

  it("REMOTE_ARCHITECTURE: client-to-server WebSocket bullet matches the generated count", () => {
    const doc = loadDoc("docs/REMOTE_ARCHITECTURE.md");
    expect(
      printedNumber(
        doc,
        "client-to-server WebSocket count",
        /^- (\d+) client-to-server WebSocket messages/m,
      ),
    ).toBe(webSocketClientMessages);
  });

  it("REMOTE_ARCHITECTURE: server-to-client WebSocket bullet matches the generated count", () => {
    const doc = loadDoc("docs/REMOTE_ARCHITECTURE.md");
    expect(
      printedNumber(
        doc,
        "server-to-client WebSocket count",
        /^- (\d+) server-to-client WebSocket messages/m,
      ),
    ).toBe(webSocketServerMessages);
  });

  it("REMOTE_ARCHITECTURE: wire protocolVersion 'currently' matches the generated protocolVersion", () => {
    const doc = loadDoc("docs/REMOTE_ARCHITECTURE.md");
    expect(
      printedNumber(doc, "wire protocolVersion", /`protocolVersion` \(currently (\d+)\)/),
    ).toBe(generated.protocolVersion);
  });

  it("REMOTE_ARCHITECTURE: binding format 'currently' matches the generated bindingFormatVersion", () => {
    const doc = loadDoc("docs/REMOTE_ARCHITECTURE.md");
    expect(printedNumber(doc, "binding format version", /binding format currently (\d+)/)).toBe(
      generated.bindingFormatVersion,
    );
  });

  it("V4_MERGE_GATES: regenerated-artifacts sentence matches the generated route count", () => {
    const doc = loadDoc("docs/V4_MERGE_GATES.md");
    expect(
      printedNumber(doc, "regenerated route count", /all artifacts regenerated: (\d+) routes/),
    ).toBe(routes);
  });

  it("V5_CLIENT_SERVER_HARDENING: registry sentence matches the generated route count", () => {
    const doc = loadDoc("docs/V5_CLIENT_SERVER_HARDENING_PLAN.md");
    expect(
      printedNumber(doc, "registry route count", /added through the registry \((\d+) routes\)/),
    ).toBe(routes);
  });
});
