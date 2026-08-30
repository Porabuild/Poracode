import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const contractDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(contractDirectory, "../../..");
const iosProject = readFileSync(
  join(repositoryRoot, "ios/App/App.xcodeproj/project.pbxproj"),
  "utf8",
);

const BATCHES = [
  "foundation",
  "bindings",
  "projects",
  "thread-lifecycle",
  "rich-chat-requests",
  "attachments",
  "terminal",
  "settings-integrations",
  "push-system",
  "explicitly-desktop-only",
] as const;

const DISPOSITIONS = ["implemented", "planned", "desktop-only", "unsupported-by-wire"] as const;

const EXPECTED_COUNTS = {
  httpRoutes: 61,
  procedures: 100,
  webSocketClientMessages: 8,
  webSocketServerMessages: 9,
  replayableEventTypes: 15,
  runtimeEventTypes: 14,
} as const;

const evidencePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) => !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes(".."),
    {
      message: "evidence must be a repository-relative POSIX path",
    },
  );

const platformSchema = z
  .object({
    disposition: z.enum(DISPOSITIONS),
    evidence: z.array(evidencePathSchema),
  })
  .strict();

const entrySchema = z
  .object({
    id: z.string().min(1),
    batch: z.enum(BATCHES),
    ios: platformSchema,
    android: platformSchema,
    note: z.string().min(1).optional(),
  })
  .strict();

const ledgerSchema = z
  .object({
    formatVersion: z.literal(1),
    contract: z.literal("poracode.remote.native-parity"),
    protocolVersion: z.literal(8),
    entries: z
      .object({
        httpRoutes: z.array(entrySchema),
        procedures: z.array(entrySchema),
        webSocketClientMessages: z.array(entrySchema),
        webSocketServerMessages: z.array(entrySchema),
        replayableEventTypes: z.array(entrySchema),
        runtimeEventTypes: z.array(entrySchema),
      })
      .strict(),
  })
  .strict();

const manifestSchema = z.object({
  contract: z.literal("poracode.remote"),
  protocolVersion: z.literal(8),
  httpRoutes: z.array(z.object({ id: z.string().min(1) })),
  procedures: z.array(z.object({ name: z.string().min(1) })),
  webSocket: z.object({
    clientMessages: z.array(z.string().min(1)),
    serverMessages: z.array(z.string().min(1)),
    replayableEventTypes: z.array(z.string().min(1)),
    runtimeEventTypes: z.array(z.string().min(1)),
  }),
});

type Ledger = z.infer<typeof ledgerSchema>;
type LedgerEntry = z.infer<typeof entrySchema>;
type Platform = "ios" | "android";
type Category = keyof Ledger["entries"];

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(repositoryRoot, relativePath), "utf8")) as unknown;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertLedger(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectExactInventory(
  category: Category,
  entries: readonly LedgerEntry[],
  authority: string[],
): void {
  expect(authority, `${category} manifest cardinality`).toHaveLength(EXPECTED_COUNTS[category]);
  expect(new Set(authority).size, `${category} manifest names must be unique`).toBe(
    authority.length,
  );
  const ids = entries.map((entry) => entry.id);
  expect(ids, `${category} ledger cardinality`).toHaveLength(EXPECTED_COUNTS[category]);
  expect(new Set(ids).size, `${category} ledger entries must be unique`).toBe(ids.length);
  expect(sorted(ids), `${category} must exactly match manifest names`).toEqual(sorted(authority));
}

function expectEvidence(entry: LedgerEntry, platform: Platform): void {
  const claim = entry[platform];
  expect(new Set(claim.evidence).size, `${platform} ${entry.id} evidence must be unique`).toBe(
    claim.evidence.length,
  );
  for (const relativePath of claim.evidence) {
    const absolutePath = join(repositoryRoot, relativePath);
    expect(
      existsSync(absolutePath),
      `${platform} ${entry.id} evidence missing: ${relativePath}`,
    ).toBe(true);
    expect(statSync(absolutePath).isFile(), `${platform} ${entry.id} evidence is not a file`).toBe(
      true,
    );
  }
  if (claim.disposition === "implemented") {
    assertLedger(claim.evidence.length > 0, `${platform} ${entry.id} needs production evidence`);
    const sourceRoot = platform === "ios" ? "ios/" : "android/";
    for (const relativePath of claim.evidence) {
      assertLedger(
        relativePath.startsWith(sourceRoot),
        `${platform} evidence must be native source`,
      );
      assertLedger(
        !/(?:^|\/)(?:generated|[^/]*(?:test|tests))\//i.test(relativePath),
        `${platform} evidence cannot be generated or test-only`,
      );
      if (platform === "ios" && relativePath.endsWith(".swift")) {
        assertLedger(
          iosProject.includes(`${basename(relativePath)} in Sources`),
          `ios ${entry.id} evidence is not compiled by an Xcode source phase: ${relativePath}`,
        );
      }
    }
  }
  if (claim.disposition === "desktop-only") {
    assertLedger(claim.evidence.length > 0, `${platform} ${entry.id} desktop-only needs evidence`);
  }
}

function validateSymmetricClaims(entry: LedgerEntry): void {
  const desktopOnly =
    entry.ios.disposition === "desktop-only" || entry.android.disposition === "desktop-only";
  if (desktopOnly) {
    assertLedger(
      entry.ios.disposition === "desktop-only",
      `${entry.id} desktop-only must be symmetric`,
    );
    assertLedger(
      entry.android.disposition === "desktop-only",
      `${entry.id} desktop-only must be symmetric`,
    );
    assertLedger(entry.batch === "explicitly-desktop-only", `${entry.id} desktop-only batch`);
  }
  if (entry.batch === "explicitly-desktop-only") {
    assertLedger(entry.ios.disposition === "desktop-only", `${entry.id} iOS desktop-only claim`);
    assertLedger(
      entry.android.disposition === "desktop-only",
      `${entry.id} Android desktop-only claim`,
    );
  }
  const unsupported =
    entry.ios.disposition === "unsupported-by-wire" ||
    entry.android.disposition === "unsupported-by-wire";
  if (unsupported) {
    assertLedger(entry.note !== undefined, `${entry.id} unsupported-by-wire requires a rationale`);
  }
}

describe("remote v3 native parity planning ledger", () => {
  const ledger = ledgerSchema.parse(readJson("protocol/remote/v3/native-parity.json"));
  const manifest = manifestSchema.parse(readJson("protocol/remote/v3/manifest.json"));
  const authority: Record<Category, string[]> = {
    httpRoutes: manifest.httpRoutes.map((route) => route.id),
    procedures: manifest.procedures.map((procedure) => procedure.name),
    webSocketClientMessages: manifest.webSocket.clientMessages,
    webSocketServerMessages: manifest.webSocket.serverMessages,
    replayableEventTypes: manifest.webSocket.replayableEventTypes,
    runtimeEventTypes: manifest.webSocket.runtimeEventTypes,
  };

  it("exhaustively and uniquely covers the frozen manifest inventories", () => {
    expect(ledger.protocolVersion).toBe(manifest.protocolVersion);
    for (const category of Object.keys(EXPECTED_COUNTS) as Category[]) {
      expectExactInventory(category, ledger.entries[category], authority[category]);
    }
  });

  it("uses valid evidence and symmetric desktop-only claims", () => {
    expect.hasAssertions();
    const entries = Object.values(ledger.entries).flat();
    for (const entry of entries) {
      expectEvidence(entry, "ios");
      expectEvidence(entry, "android");
      validateSymmetricClaims(entry);
    }
  });

  it("keeps generated cardinalities aligned without treating metadata as implementation", () => {
    const generated = z
      .object({
        protocolVersion: z.literal(8),
        inventory: z.object({
          routes: z.number().int(),
          procedures: z.number().int(),
          webSocketClientMessages: z.number().int(),
          webSocketServerMessages: z.number().int(),
          replayableEventTypes: z.number().int(),
          runtimeEventTypes: z.number().int(),
        }),
      })
      .parse(readJson("protocol/remote/v3/generated/inventory.json"));
    expect(generated.inventory).toEqual({
      routes: EXPECTED_COUNTS.httpRoutes,
      procedures: EXPECTED_COUNTS.procedures,
      webSocketClientMessages: EXPECTED_COUNTS.webSocketClientMessages,
      webSocketServerMessages: EXPECTED_COUNTS.webSocketServerMessages,
      replayableEventTypes: EXPECTED_COUNTS.replayableEventTypes,
      runtimeEventTypes: EXPECTED_COUNTS.runtimeEventTypes,
    });
  });

  it("cross-checks native E2E transport coverage for every route and procedure", () => {
    const operationMap = z
      .object({
        protocolVersion: z.literal(8),
        counts: z.object({ route: z.number().int(), procedure: z.number().int() }).passthrough(),
        operations: z.record(z.string(), z.object({ kind: z.string(), id: z.string() })),
      })
      .parse(readJson("tests/native-e2e/harness/operation-map.json"));
    const expected = [
      ...authority.httpRoutes.map((id) => `route:${id}`),
      ...authority.procedures.map((id) => `procedure:${id}`),
    ];
    const covered = Object.keys(operationMap.operations).filter(
      (key) => key.startsWith("route:") || key.startsWith("procedure:"),
    );
    expect(operationMap.counts.route).toBe(EXPECTED_COUNTS.httpRoutes);
    expect(operationMap.counts.procedure).toBe(EXPECTED_COUNTS.procedures);
    expect(sorted(covered)).toEqual(sorted(expected));
    for (const key of expected) {
      const separator = key.indexOf(":");
      expect(operationMap.operations[key]).toEqual({
        kind: key.slice(0, separator),
        id: key.slice(separator + 1),
      });
    }
  });
});
