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

/**
 * The checked-in screen registry ids. A `screen:` evidence token counts as
 * independent ui evidence only when the registry owns that id (the full
 * registry schema and its owner-class checks are enforced further below).
 */
const screenRegistryIds: ReadonlySet<string> = new Set(
  z
    .object({ screens: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1) })
    .parse(readJson("protocol/remote/v3/screen-registry.json"))
    .screens.map((screen) => screen.id),
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
 * The ui column adds `partial`: the native story is not fully evidenced —
 * either a functional gap or no independent device evidence — and the precise
 * reason is mandatory in `note`. `implemented` additionally requires
 * independent device evidence (see `uiClaimHasIndependentEvidence`).
 */
const UI_DISPOSITIONS = [
  "implemented",
  "partial",
  "planned",
  "desktop-only",
  "unsupported-by-wire",
] as const;

const EXPECTED_COUNTS = {
  httpRoutes: 68,
  procedures: 139,
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
    if (relativePath.startsWith("screen:")) continue;
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
      if (relativePath.startsWith("screen:")) continue;
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
 * precise gap, a fully-implemented ui claim must be independently evidenced
 * by a device journey (never by a note), and the desktop-only /
 * unsupported-by-wire claims mirror the wire disposition because there is
 * nothing to surface natively.
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
  if (wire.disposition === "implemented" && ui.disposition === "implemented") {
    assertLedger(
      uiClaimHasIndependentEvidence(ui, platform, entry.id),
      `${platform} ${entry.id} ui implemented without independent device evidence (screen-registry entry or checked-in device test)`,
    );
  }
}

/**
 * E.1: a `note` is commentary and grants nothing. A ui claim that asserts a
 * full native story ("implemented") is independently evidenced only by a
 * checked-in device journey: a `screen:` id the checked-in screen registry
 * owns AND that names this very entry (`<platform>.<id>` — an entry may not
 * borrow another entry's screen), or a device-test source file that exists in
 * this repository.
 */
const DEVICE_TEST_EVIDENCE_ROOTS = [
  "ios/App/NativeE2ETests/",
  "android/app/src/androidTest/",
] as const;

function uiClaimHasIndependentEvidence(ui: UiClaim, platform: Platform, id: string): boolean {
  const ownScreenId = `screen:${platform}.${id}`;
  return ui.evidence.some((path) => {
    if (path.startsWith("screen:")) {
      return path === ownScreenId && screenRegistryIds.has(path.slice("screen:".length));
    }
    return (
      DEVICE_TEST_EVIDENCE_ROOTS.some((root) => path.startsWith(root)) &&
      existsSync(join(repositoryRoot, path))
    );
  });
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

  it("rejects a ui claim that merely mirrors wire without independent evidence", () => {
    const entry = {
      id: "mirror-fixture",
      scopes: [] as string[],
      batch: "foundation" as const,
      ios: {
        wire: {
          disposition: "implemented" as const,
          evidence: ["ios/App/App/Transport/Foo.swift"],
        },
        ui: {
          disposition: "implemented" as const,
          evidence: ["ios/App/App/Transport/Foo.swift"],
        },
      },
      android: {
        wire: {
          disposition: "planned" as const,
          evidence: [] as string[],
        },
        ui: {
          disposition: "planned" as const,
          evidence: [] as string[],
        },
      },
    };
    expect(() => validateUiClaim(entry, "ios", entry.ios.ui)).toThrow(
      /ui implemented without independent device evidence/,
    );
  });

  it("rejects a ui claim that tries to pass on a note alone (E.1)", () => {
    // The E.1 escape hatch: any non-empty `ui.note` used to satisfy the
    // independence check. A note is commentary; it evidences nothing.
    const entry = {
      id: "note-only-fixture",
      scopes: [] as string[],
      batch: "foundation" as const,
      ios: {
        wire: {
          disposition: "implemented" as const,
          evidence: ["ios/App/App/Transport/Foo.swift"],
        },
        ui: {
          disposition: "implemented" as const,
          evidence: ["ios/App/App/Transport/Foo.swift"],
          note: "Reached through shared plumbing cited here.",
        },
      },
      android: {
        wire: {
          disposition: "planned" as const,
          evidence: [] as string[],
        },
        ui: {
          disposition: "planned" as const,
          evidence: [] as string[],
        },
      },
    };
    expect(() => validateUiClaim(entry, "ios", entry.ios.ui)).toThrow(
      /ui implemented without independent device evidence/,
    );
  });

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

  it("resolves every screen: evidence token against the checked-in screen registry", () => {
    const registry = z
      .object({
        contract: z.literal("poracode.remote.screen-registry"),
        formatVersion: z.literal(1),
        screens: z
          .array(
            z
              .object({
                id: z.string().regex(/^(ios|android)\.[A-Za-z0-9][A-Za-z0-9._-]*$/),
                /** The native device-test class that owns (exercises) the screen. */
                testClass: z.string().min(1),
                /** Repository-relative path of the checked-in test source. */
                file: evidencePathSchema,
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .parse(readJson("protocol/remote/v3/screen-registry.json"));
    const ids = registry.screens.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());

    // Each registry entry must reference a REAL test class: the file must live
    // in the platform's checked-in native test directory, declare that class,
    // and actually exercise the operation the screen id names. This is what
    // keeps a screen: token from being free text.
    const testDirectory: Record<Platform, string> = {
      ios: "ios/App/NativeE2ETests/",
      android: "android/app/src/androidTest/",
    };
    for (const screen of registry.screens) {
      const platform = (screen.id.split(".", 1)[0] ?? "") as Platform;
      assertLedger(
        platform === "ios" || platform === "android",
        `screen registry id must be platform-prefixed: ${screen.id}`,
      );
      expect(
        screen.file.startsWith(testDirectory[platform]),
        `screen ${screen.id} owner file must live under ${testDirectory[platform]}: ${screen.file}`,
      ).toBe(true);
      const source = readFileSync(join(repositoryRoot, screen.file), "utf8");
      expect(
        source.includes(`class ${screen.testClass}`),
        `screen ${screen.id} owner class ${screen.testClass} is not declared in ${screen.file}`,
      ).toBe(true);
      const operation = screen.id.slice(platform.length + 1);
      expect(
        source.includes(operation),
        `screen ${screen.id} owner ${screen.testClass} never exercises "${operation}" in ${screen.file}`,
      ).toBe(true);
    }

    const cited = new Set<string>();
    for (const entries of Object.values(ledger.entries)) {
      for (const entry of entries) {
        for (const platform of ["ios", "android"] as Platform[]) {
          for (const column of ["wire", "ui"] as const) {
            for (const path of entry[platform][column].evidence) {
              if (!path.startsWith("screen:")) continue;
              const id = path.slice("screen:".length);
              expect(
                id.startsWith(`${platform}.`),
                `${platform} ${entry.id} ${column} ${path}`,
              ).toBe(true);
              cited.add(id);
            }
          }
        }
      }
    }
    expect([...cited].sort()).toEqual(ids);
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

  it("records at least one honest ui/wire divergence (terminal-write remains partial)", () => {
    const divergences: string[] = [];
    for (const category of Object.keys(ledger.entries) as Category[]) {
      for (const entry of ledger.entries[category]) {
        for (const platform of ["ios", "android"] as Platform[]) {
          if (entry[platform].ui.disposition !== entry[platform].wire.disposition) {
            divergences.push(`${platform}:${entry.id}`);
          }
        }
      }
    }
    expect(divergences.some((row) => row.endsWith(":terminal-write"))).toBe(true);
    expect(divergences.length).toBeGreaterThan(0);
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
