import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

/**
 * The ui column adds `partial`: the operation is reachable from a native
 * surface in part only, and the precise gap is mandatory in `note`.
 */
const UI_DISPOSITIONS = [
  "implemented",
  "partial",
  "planned",
  "desktop-only",
  "unsupported-by-wire",
] as const;

const EXPECTED_COUNTS = {
  httpRoutes: 67,
  procedures: 108,
  webSocketClientMessages: 9,
  // 10 shared + the desktop-internal `desktop-event` frame (V5 plan 2.5).
  webSocketServerMessages: 11,
  replayableEventTypes: 16,
  runtimeEventTypes: 16,
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

const claimSchema = z
  .object({
    disposition: z.enum(DISPOSITIONS),
    evidence: z.array(evidencePathSchema),
  })
  .strict();

const uiClaimSchema = z
  .object({
    disposition: z.enum(UI_DISPOSITIONS),
    evidence: z.array(evidencePathSchema),
    /** Mandatory for `partial`: the precise reason the UI story is incomplete. */
    note: z.string().min(1).optional(),
  })
  .strict();

/**
 * V5 plan 5.4: every platform claim carries two independent columns — `wire`
 * (the protocol is implemented) and `ui` (a user-visible native surface
 * reaches it). The columns are maintained separately: flipping one must not
 * silently flip the other.
 */
const platformSchema = z
  .object({
    wire: claimSchema,
    ui: uiClaimSchema,
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

/**
 * HTTP-route ledger entries additionally carry the route's registry scopes, so
 * a scope change on a route has to be re-affirmed in the parity ledger the same
 * way the route itself does.
 */
const routeEntrySchema = entrySchema.extend({
  scopes: z.array(z.string().min(1)),
});

const ledgerSchema = z
  .object({
    formatVersion: z.literal(2),
    contract: z.literal("poracode.remote.native-parity"),
    protocolVersion: z.literal(12),
    /** Recorded migration provenance beside the version (versioning doc rule). */
    migrationNote: z.string().min(1).optional(),
    entries: z
      .object({
        httpRoutes: z.array(routeEntrySchema),
        procedures: z.array(entrySchema),
        webSocketClientMessages: z.array(entrySchema),
        webSocketServerMessages: z.array(entrySchema),
        replayableEventTypes: z.array(entrySchema),
        runtimeEventTypes: z.array(entrySchema),
      })
      .strict(),
  })
  .strict();

/**
 * Format-1 shape (the previous released ledger): one flat claim per platform.
 * Kept as a schema + migration so the format bump is regression-covered from
 * the previous released shape, per the versioning doc.
 */
const legacyEntrySchema = z
  .object({
    id: z.string().min(1),
    batch: z.enum(BATCHES),
    ios: claimSchema,
    android: claimSchema,
    note: z.string().min(1).optional(),
  })
  .strict();

const legacyLedgerSchema = z
  .object({
    formatVersion: z.literal(1),
    contract: z.literal("poracode.remote.native-parity"),
    protocolVersion: z.literal(12),
    entries: z
      .object({
        httpRoutes: z.array(legacyEntrySchema.extend({ scopes: z.array(z.string().min(1)) })),
        procedures: z.array(legacyEntrySchema),
        webSocketClientMessages: z.array(legacyEntrySchema),
        webSocketServerMessages: z.array(legacyEntrySchema),
        replayableEventTypes: z.array(legacyEntrySchema),
        runtimeEventTypes: z.array(legacyEntrySchema),
      })
      .strict(),
  })
  .strict();

/**
 * Migrates a format-1 ledger to format 2: the audited claim becomes the wire
 * claim unchanged, and the ui column is seeded by mirroring it — with the
 * UI-surface subset of the evidence as ui evidence, falling back to the full
 * list for protocol-plumbing entries that have no distinct UI file. The same
 * rule produced the committed format-2 migration (see `migrationNote`).
 */
export function migrateLedgerV1ToV2(raw: unknown): unknown {
  const legacy = legacyLedgerSchema.parse(raw);
  const isUiSurface = (path: string): boolean =>
    path.includes("/ui/") ||
    /(View|Views|Surface|Screen|Pane|Sheet|Page|Panel|Overlay|Bar|Card|Row|Item|Field|Composer|Accessory|Button|Menu|Dialog|List|Pill|Banner|Tile|Picker|Section|Chip|Tab|Form|Entry|Image|Avatar|Badge|Grid|Rail|Strip|Modal|Popup|Toast|Hero|Header|Footer)\.(swift|kt)$/.test(
      path,
    );
  const migratePlatform = (claim: z.infer<typeof claimSchema>) => {
    const uiEvidence =
      claim.disposition === "planned"
        ? []
        : claim.evidence.filter(isUiSurface).length > 0
          ? claim.evidence.filter(isUiSurface)
          : [...claim.evidence];
    return {
      wire: claim,
      ui: { disposition: claim.disposition, evidence: uiEvidence },
    };
  };
  return {
    formatVersion: 2,
    contract: legacy.contract,
    protocolVersion: legacy.protocolVersion,
    entries: Object.fromEntries(
      Object.entries(legacy.entries).map(([category, entries]) => [
        category,
        entries.map((entry) => {
          const { ios, android, ...rest } = entry;
          return {
            ...rest,
            ios: migratePlatform(ios),
            android: migratePlatform(android),
          };
        }),
      ]),
    ),
  };
}

/** Accepts the current format and migrates the previous released format. */
function parseLedgerDocument(raw: unknown): z.infer<typeof ledgerSchema> {
  const format = z.object({ formatVersion: z.number() }).passthrough().parse(raw).formatVersion;
  if (format === 2) return ledgerSchema.parse(raw);
  if (format === 1) return ledgerSchema.parse(migrateLedgerV1ToV2(raw));
  throw new Error(`unsupported native-parity ledger formatVersion: ${format}`);
}

const manifestSchema = z.object({
  contract: z.literal("poracode.remote"),
  protocolVersion: z.literal(12),
  httpRoutes: z.array(z.object({ id: z.string().min(1), scopes: z.array(z.string().min(1)) })),
  procedures: z.array(z.object({ name: z.string().min(1) })),
  webSocket: z.object({
    clientMessages: z.array(z.string().min(1)),
    serverMessages: z.array(z.string().min(1)),
    replayableEventTypes: z.array(z.string().min(1)),
    runtimeEventTypes: z.array(z.string().min(1)),
  }),
});

type Ledger = z.infer<typeof ledgerSchema>;

/**
 * WS8 negative assertion: "planned" must mean "not yet implemented". Every
 * planned platform claim declares wire tokens that must be ABSENT from that
 * platform's implementation tree; if a token appears, this test fails and the
 * disposition must be flipped (with production evidence) instead.
 */
const PLANNED_ABSENCE_TOKENS: Record<
  string,
  ReadonlyArray<{ platform: Platform; token: string }>
> = {
  // Gate 4 hazard #3 bounded thread-list pages: contracted for web clients,
  // not yet implemented natively. The tokens are the generated binding type
  // names, so a native implementation trips the absence check until the
  // disposition is flipped with production evidence.
  "thread-list": [
    { platform: "ios", token: "RemoteThreadListPage" },
    { platform: "android", token: "RemoteThreadListPage" },
  ],
  // B5b one-time image tickets: contracted for the web client's <img> flow,
  // not yet implemented natively (natives still use the legacy query-token
  // GET, which remains on the wire). The tokens are the generated binding
  // type names for the ticket route.
  "local-image-ticket": [
    { platform: "ios", token: "LocalImageTicket" },
    { platform: "android", token: "LocalImageTicket" },
  ],
};
type LedgerEntry = z.infer<typeof entrySchema>;
type Platform = "ios" | "android";
type Category = keyof Ledger["entries"];
type WireClaim = z.infer<typeof claimSchema>;
type UiClaim = z.infer<typeof uiClaimSchema>;

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

function expectEvidence(
  entry: LedgerEntry,
  platform: Platform,
  column: "wire" | "ui",
  claim: WireClaim | UiClaim,
): void {
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
        `${platform} ${column} evidence must be native source`,
      );
      assertLedger(
        !/(?:^|\/)(?:generated|[^/]*(?:test|tests))\//i.test(relativePath),
        `${platform} ${column} evidence cannot be generated or test-only`,
      );
      if (platform === "ios" && relativePath.endsWith(".swift")) {
        assertLedger(
          iosProject.includes(`${basename(relativePath)} in Sources`),
          `ios ${entry.id} ${column} evidence is not compiled by an Xcode source phase: ${relativePath}`,
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
    entry.ios.wire.disposition === "desktop-only" ||
    entry.android.wire.disposition === "desktop-only";
  if (desktopOnly) {
    assertLedger(
      entry.ios.wire.disposition === "desktop-only",
      `${entry.id} desktop-only must be symmetric`,
    );
    assertLedger(
      entry.android.wire.disposition === "desktop-only",
      `${entry.id} desktop-only must be symmetric`,
    );
    assertLedger(entry.batch === "explicitly-desktop-only", `${entry.id} desktop-only batch`);
  }
  if (entry.batch === "explicitly-desktop-only") {
    assertLedger(
      entry.ios.wire.disposition === "desktop-only",
      `${entry.id} iOS desktop-only claim`,
    );
    assertLedger(
      entry.android.wire.disposition === "desktop-only",
      `${entry.id} Android desktop-only claim`,
    );
  }
  const unsupported =
    entry.ios.wire.disposition === "unsupported-by-wire" ||
    entry.android.wire.disposition === "unsupported-by-wire";
  if (unsupported) {
    assertLedger(entry.note !== undefined, `${entry.id} unsupported-by-wire requires a rationale`);
  }
}

/**
 * The ui column is an independent claim, not a projection of wire: a UI
 * surface cannot exist without its wire, a partial UI claim must name the
 * precise gap, and the desktop-only / unsupported-by-wire claims mirror the
 * wire disposition because there is nothing to surface natively.
 */
function validateUiClaim(entry: LedgerEntry, platform: Platform, ui: UiClaim): void {
  const wire = entry[platform].wire;
  if (wire.disposition === "desktop-only" || wire.disposition === "unsupported-by-wire") {
    assertLedger(
      ui.disposition === wire.disposition,
      `${platform} ${entry.id} ui must mirror the wire ${wire.disposition} claim`,
    );
    return;
  }
  if (ui.disposition === "desktop-only" || ui.disposition === "unsupported-by-wire") {
    assertLedger(
      false,
      `${platform} ${entry.id} ui ${ui.disposition} without the matching wire claim`,
    );
  }
  if (wire.disposition !== "implemented") {
    assertLedger(
      ui.disposition !== "implemented",
      `${platform} ${entry.id} ui implemented while wire is ${wire.disposition}`,
    );
  }
  if (ui.disposition === "partial") {
    assertLedger(
      ui.note !== undefined,
      `${platform} ${entry.id} ui partial requires a note naming the precise gap`,
    );
  }
}

describe("remote v3 native parity planning ledger", () => {
  const ledger = parseLedgerDocument(readJson("protocol/remote/v3/native-parity.json"));
  const manifest = manifestSchema.parse(readJson("protocol/remote/v3/generated/manifest.json"));
  const authority: Record<Category, string[]> = {
    httpRoutes: manifest.httpRoutes.map((route) => route.id),
    procedures: manifest.procedures.map((procedure) => procedure.name),
    webSocketClientMessages: manifest.webSocket.clientMessages,
    webSocketServerMessages: manifest.webSocket.serverMessages,
    replayableEventTypes: manifest.webSocket.replayableEventTypes,
    runtimeEventTypes: manifest.webSocket.runtimeEventTypes,
  };

  it("keeps planned entries free of native implementations", () => {
    // Every planned claim must declare the tokens proving its absence.
    const plannedClaims: { id: string; platform: Platform }[] = [];
    for (const category of Object.keys(ledger.entries) as Category[]) {
      for (const entry of ledger.entries[category]) {
        for (const platform of ["ios", "android"] as Platform[]) {
          if (entry[platform].wire.disposition === "planned") {
            plannedClaims.push({ id: entry.id, platform });
          }
        }
      }
    }
    for (const claim of plannedClaims) {
      assertLedger(
        PLANNED_ABSENCE_TOKENS[claim.id]?.some((rule) => rule.platform === claim.platform) === true,
        `planned entry ${claim.id} (${claim.platform}) needs absence tokens in PLANNED_ABSENCE_TOKENS`,
      );
    }

    // And each declared token must really be absent from the native tree.
    const walk = (root: string): string[] => {
      const files: string[] = [];
      const stack = [root];
      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const path = join(current, entry.name);
          if (entry.isDirectory()) stack.push(path);
          else if (entry.isFile()) files.push(path);
        }
      }
      return files;
    };
    const trees: Record<Platform, string[]> = {
      ios: walk(join(repositoryRoot, "ios/App/App")),
      android: walk(join(repositoryRoot, "android/app/src/main/kotlin")),
    };
    for (const rules of Object.values(PLANNED_ABSENCE_TOKENS)) {
      for (const rule of rules) {
        for (const path of trees[rule.platform]) {
          const contents = readFileSync(path, "utf8");
          expect(
            contents.includes(rule.token),
            `${rule.platform} implements ${rule.token} in ${path} while the ledger entry is still planned — flip the disposition with evidence`,
          ).toBe(false);
        }
      }
    }
  });

  it("exhaustively and uniquely covers the frozen manifest inventories", () => {
    expect(ledger.protocolVersion).toBe(manifest.protocolVersion);
    for (const category of Object.keys(EXPECTED_COUNTS) as Category[]) {
      expectExactInventory(category, ledger.entries[category], authority[category]);
    }
  });

  it("carries the registry scope of every HTTP route", () => {
    // Item 3.2: scopes live in the contract registry per route and flow to the
    // native clients through generation (RemoteRouteDescriptor.scopes in the
    // generated Swift/Kotlin bundles). The parity ledger must restate exactly
    // the generated per-route scope list — never a hand-divergent copy.
    const scopesById = new Map(manifest.httpRoutes.map((route) => [route.id, route.scopes]));
    expect(ledger.entries.httpRoutes).toHaveLength(scopesById.size);
    for (const entry of ledger.entries.httpRoutes) {
      expect(entry.scopes, `route ${entry.id} scopes`).toEqual(scopesById.get(entry.id));
    }
  });

  it("uses valid evidence and symmetric desktop-only claims", () => {
    expect.hasAssertions();
    const entries = Object.values(ledger.entries).flat();
    for (const entry of entries) {
      expectEvidence(entry, "ios", "wire", entry.ios.wire);
      expectEvidence(entry, "android", "wire", entry.android.wire);
      validateSymmetricClaims(entry);
    }
  });

  it("keeps the ui column an independent, valid claim per platform", () => {
    expect.hasAssertions();
    const entries = Object.values(ledger.entries).flat();
    for (const entry of entries) {
      expectEvidence(entry, "ios", "ui", entry.ios.ui);
      expectEvidence(entry, "android", "ui", entry.android.ui);
      validateUiClaim(entry, "ios", entry.ios.ui);
      validateUiClaim(entry, "android", entry.android.ui);
    }
  });

  it("states the interactive-terminal story honestly for both platforms", () => {
    // V5 plan 5.1/5.4: the audit (P1) found the ledger calling terminal
    // presentation "implemented" while the native terminal was a read-only
    // transcript plus a line-buffered command field. The ui claims for the
    // terminal write/resize entries must therefore carry the interactive
    // raw-key evidence and the note that names the remaining touch-input
    // compromise — never silently.
    expect.hasAssertions();
    const interactive = new Set(["terminal-write", "terminal-resize"]);
    const rawEvidence = {
      ios: "ios/App/App/Features/Terminal/TerminalRawKeyInput.swift",
      android: "android/app/src/main/kotlin/com/poracode/app/ui/terminal/TerminalKeyAccessory.kt",
    } as const;
    const seen = new Set<string>();
    for (const category of Object.keys(ledger.entries) as Category[]) {
      for (const entry of ledger.entries[category]) {
        if (!interactive.has(entry.id)) continue;
        seen.add(entry.id);
        for (const platform of ["ios", "android"] as Platform[]) {
          const ui = entry[platform].ui;
          expect(
            ui.disposition === "implemented" || ui.disposition === "partial",
            `${platform} ${entry.id} ui must be implemented or partial`,
          ).toBe(true);
          expect(ui.note !== undefined, `${platform} ${entry.id} ui must note the story`).toBe(
            true,
          );
          expect(
            ui.evidence.includes(rawEvidence[platform]),
            `${platform} ${entry.id} ui evidence must cite the raw-key implementation`,
          ).toBe(true);
        }
      }
    }
    expect([...seen].sort()).toEqual([...interactive].sort());
  });

  it("migrates the previous released format-1 shape into valid format-2 claims", () => {
    // Versioning doc rule 7: the bump is regression-tested from the previous
    // released shape, not just from a clean v2 file.
    const legacy = {
      formatVersion: 1,
      contract: "poracode.remote.native-parity",
      protocolVersion: 12,
      entries: {
        httpRoutes: [
          {
            id: "terminal-write",
            scopes: ["terminal:operate"],
            batch: "terminal",
            ios: {
              disposition: "implemented",
              evidence: ["ios/App/App/Features/Terminal/RichTerminalView.swift"],
            },
            android: {
              disposition: "implemented",
              evidence: [
                "android/app/src/main/kotlin/com/poracode/app/ui/terminal/RichTerminalPane.kt",
              ],
            },
          },
          {
            id: "thread-list",
            scopes: [],
            batch: "thread-lifecycle",
            ios: { disposition: "planned", evidence: [] },
            android: { disposition: "planned", evidence: [] },
          },
          {
            id: "push-config",
            scopes: [],
            batch: "push-system",
            ios: { disposition: "unsupported-by-wire", evidence: [] },
            android: { disposition: "unsupported-by-wire", evidence: [] },
          },
        ],
        procedures: [],
        webSocketClientMessages: [],
        webSocketServerMessages: [],
        replayableEventTypes: [],
        runtimeEventTypes: [],
      },
    };
    const migrated = ledgerSchema.parse(migrateLedgerV1ToV2(legacy));
    const terminalWrite = migrated.entries.httpRoutes.find((e) => e.id === "terminal-write");
    assertLedger(terminalWrite !== undefined);
    // The audited claim survives as the wire claim, unchanged.
    expect(terminalWrite.ios.wire).toEqual({
      disposition: "implemented",
      evidence: ["ios/App/App/Features/Terminal/RichTerminalView.swift"],
    });
    // The seeded ui claim mirrors the disposition and keeps UI-surface evidence.
    expect(terminalWrite.ios.ui.disposition).toBe("implemented");
    expect(terminalWrite.ios.ui.evidence).toEqual([
      "ios/App/App/Features/Terminal/RichTerminalView.swift",
    ]);
    // Planned wire claims seed a planned ui claim with no evidence invented.
    const threadList = migrated.entries.httpRoutes.find((e) => e.id === "thread-list");
    assertLedger(threadList !== undefined);
    expect(threadList.android.ui).toEqual({ disposition: "planned", evidence: [] });
    expect(
      migrated.entries.httpRoutes.find((e) => e.id === "push-config")?.ios.ui.disposition,
    ).toBe("unsupported-by-wire");
  });

  it("keeps generated cardinalities aligned without treating metadata as implementation", () => {
    const generated = z
      .object({
        protocolVersion: z.literal(12),
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
        protocolVersion: z.literal(12),
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
