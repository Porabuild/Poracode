import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  assertCapableHistoryArtifact,
  capableHistoryJourneyError,
  checkCapableHistoryPostAppend,
  parseEnvironmentDescriptor,
  requireRuntimeHistoryNoticesV1,
} from "./helpers/androidCapableHistoryHost.ts";
import {
  CAPABLE_HISTORY_PREFIX,
  CAPABLE_HISTORY_PREFIX_MARKER,
  checkCapableHistoryVerifyResult,
  defaultCapableHistorySeedParams,
  type CapableHistoryVerifyResult,
} from "./helpers/androidCapableHistorySeed.ts";
import {
  CAPABLE_HISTORY_JOURNEY_APP_ID_ENV,
  CAPABLE_HISTORY_JOURNEY_AVD_ENV,
  CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV,
  CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV,
  CAPABLE_HISTORY_JOURNEY_SERIAL_ENV,
  DEFAULT_CAPABLE_HISTORY_APP_ID,
  journeyGateEnabled,
  runCapableHistoryJourney,
  resolveCapableHistoryJourneyInputs,
} from "./helpers/androidCapableHistoryJourney.ts";
import {
  adbShellLiteral,
  assertCapableHistoryDeviceOwnership,
  capableHistoryClearSucceeded,
  parseCapableHistoryInstrumentationList,
  readCanonicalAndroidAppId,
  runCapableHistorySeedFixture,
  runCapableHistoryVerifyFixture,
  runCommand,
  waitForChildClose,
  type CapableHistoryDeviceIdentity,
} from "./helpers/androidCapableHistoryProcess.ts";
import { findRepoRoot } from "./harness/paths.ts";

/**
 * Focused checks for the capable-history journey components that do NOT need
 * an emulator: the fail-closed artifact gate, the device-ownership gate, the
 * descriptor capability gate, the post-append invariant checker, the
 * durable-gap seed/verify fixture, and the gated end-to-end runner (which only
 * executes with an explicitly supplied current artifact and dedicated device).
 */

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "capable-history-checks-"));
  tempDirs.push(dir);
  return dir;
}

function artifactFixture(root: string): { entrypoint: string; supervisor: string } {
  const dir = join(root, "host-main");
  mkdirSync(dir, { recursive: true });
  const entrypoint = join(dir, "server.cjs");
  const supervisor = join(dir, "supervisor.cjs");
  writeFileSync(entrypoint, "// fixture server\n");
  writeFileSync(supervisor, "// fixture supervisor\n");
  return { entrypoint, supervisor };
}

/** A hash-pinned artifact plus the required explicit device ownership inputs. */
function ownedJourneyEnv(): Record<string, string> {
  const { entrypoint } = artifactFixture(tempDir());
  return {
    [CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV]: entrypoint,
    [CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV]: createHash("sha256")
      .update("// fixture server\n")
      .digest("hex"),
    [CAPABLE_HISTORY_JOURNEY_SERIAL_ENV]: "emulator-5554",
    [CAPABLE_HISTORY_JOURNEY_AVD_ENV]: "Poracode_Capable_API37",
  };
}

describe("capable-history artifact gate", () => {
  it("refuses the repo-root dist fallback even when it exists", () => {
    const repoRoot = findRepoRoot();
    const rootDist = join(repoRoot, "dist/main/server.cjs");
    expect(() =>
      assertCapableHistoryArtifact({
        entrypoint: rootDist,
        expectedEntrypointSha256: "a".repeat(64),
        repoRoot,
      }),
    ).toThrow(/entrypoint-root-dist-refused/);
  });

  it("requires an explicit sha256 and a matching artifact", () => {
    const repoRoot = findRepoRoot();
    const root = tempDir();
    const { entrypoint } = artifactFixture(root);
    expect(() =>
      assertCapableHistoryArtifact({ entrypoint, expectedEntrypointSha256: "", repoRoot }),
    ).toThrow(/entrypoint-sha256-required/);
    expect(() =>
      assertCapableHistoryArtifact({
        entrypoint,
        expectedEntrypointSha256: "b".repeat(64),
        repoRoot,
      }),
    ).toThrow(/entrypoint-hash-mismatch/);
  });

  it("accepts a hash-pinned artifact and requires the sibling supervisor", () => {
    const repoRoot = findRepoRoot();
    const root = tempDir();
    const { entrypoint, supervisor } = artifactFixture(root);
    const hash = createHash("sha256").update("// fixture server\n").digest("hex");
    const artifact = assertCapableHistoryArtifact({
      entrypoint,
      expectedEntrypointSha256: hash,
      repoRoot,
    });
    expect(artifact.entrypoint).toBe(entrypoint);
    expect(artifact.supervisorPath).toBe(supervisor);
    rmSync(supervisor);
    expect(() =>
      assertCapableHistoryArtifact({
        entrypoint,
        expectedEntrypointSha256: hash,
        repoRoot,
      }),
    ).toThrow(/supervisor-missing/);
  });
});

describe("capable-history capability gate", () => {
  function descriptorWith(capabilities: unknown): Record<string, unknown> {
    return {
      protocolVersion: 12,
      hostMode: "desktop",
      desktopId: "fixture",
      label: "fixture",
      appVersion: "test",
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["bearer-access-token"],
        scopes: [],
      },
      endpoints: { httpBaseUrl: "http://127.0.0.1:1/", wsBaseUrl: "ws://127.0.0.1:1/" },
      capabilities,
    };
  }

  it("fails closed when the descriptor omits or under-declares the capability", () => {
    expect(() => parseEnvironmentDescriptor({})).toThrow(/protocolVersion|Invalid input/);
    expect(() =>
      requireRuntimeHistoryNoticesV1(parseEnvironmentDescriptor(descriptorWith(undefined))),
    ).toThrow(/capability-absent/);
    expect(() =>
      requireRuntimeHistoryNoticesV1(
        parseEnvironmentDescriptor(descriptorWith({ runtimeHistoryNotices: { versions: [2] } })),
      ),
    ).toThrow(/capability-absent/);
  });

  it("accepts the exact v1 declaration", () => {
    const descriptor = parseEnvironmentDescriptor(
      descriptorWith({ runtimeHistoryNotices: { versions: [1] } }),
    );
    expect(requireRuntimeHistoryNoticesV1(descriptor).versions).toEqual([1]);
  });
});

describe("capable-history post-append invariants", () => {
  const prefix = {
    userItemId: CAPABLE_HISTORY_PREFIX.userItemId,
    assistantItemId: CAPABLE_HISTORY_PREFIX.assistantItemId,
  };
  const notice = {
    kind: "history-incomplete" as const,
    source: "suspect" as const,
    reason: "unclean-epoch" as const,
    refusedEvents: 0,
    refusedBytes: 0,
    acknowledgedCount: 1,
    firstAcknowledgedAt: 1,
    lastAcknowledgedAt: 1,
  };

  function goodItems(): Record<string, unknown>[] {
    return [
      { id: prefix.userItemId, streams: { user_text: CAPABLE_HISTORY_PREFIX.userText } },
      {
        id: prefix.assistantItemId,
        streams: { assistant_text: CAPABLE_HISTORY_PREFIX.assistantText },
      },
      { id: "item-chj-live", streams: { assistant_text: "[chj-t1-done] appended" } },
    ];
  }

  function check(items: Record<string, unknown>[]) {
    return checkCapableHistoryPostAppend({
      items,
      notice,
      prefix,
      prefixMarkers: [CAPABLE_HISTORY_PREFIX_MARKER],
      liveMarker: "[chj-t1-done]",
    });
  }

  it("accepts a prefix-preserving append with the notice retained", () => {
    expect(check(goodItems()).problems).toEqual([]);
  });

  /**
   * The seed writes the user prefix as the canonical production
   * `payload.content` blocks (no user_text stream); the checker must read that
   * shape so the post-append invariant still proves the user marker survived.
   */
  it("accepts the canonical content-block payload the seed actually writes", () => {
    const canonical = [
      {
        id: prefix.userItemId,
        payload: { content: [{ kind: "text", text: CAPABLE_HISTORY_PREFIX.userText }] },
      },
      {
        id: prefix.assistantItemId,
        streams: { assistant_text: CAPABLE_HISTORY_PREFIX.assistantText },
      },
      { id: "item-chj-live", streams: { assistant_text: "[chj-t1-done] appended" } },
    ];
    expect(check(canonical).problems).toEqual([]);
  });

  it("flags a silent reset, duplicate ids, reordered append and a lost notice", () => {
    const reset = goodItems().filter((item) => item["id"] !== prefix.assistantItemId);
    expect(check(reset).problems.join("; ")).toMatch(/retained prefix .* is absent/);

    const duplicate = [...goodItems(), { id: prefix.assistantItemId, streams: {} }];
    expect(check(duplicate).problems.join("; ")).toMatch(/duplicate transcript item ids/);

    const reordered = [
      { id: "item-chj-live", streams: { assistant_text: "[chj-t1-done] appended" } },
      ...goodItems().slice(0, 2),
    ];
    expect(check(reordered).problems.join("; ")).toMatch(/did not follow the retained prefix/);

    const result = checkCapableHistoryPostAppend({
      items: goodItems(),
      notice: null,
      prefix,
      prefixMarkers: [CAPABLE_HISTORY_PREFIX_MARKER],
      liveMarker: "[chj-t1-done]",
    });
    expect(result.problems.join("; ")).toMatch(/durable history notice is absent/);
  });
});

describe("capable-history seed specification", () => {
  function goodVerify(): CapableHistoryVerifyResult {
    const params = defaultCapableHistorySeedParams();
    return {
      threadId: params.threadId,
      contaminationReason: "unclean-epoch",
      gapRowAbsent: true,
      noticeAbsent: true,
      descriptor: {
        token: "gap2:s1",
        source: "suspect",
        reason: "unclean-epoch",
        refusedEvents: 0,
        refusedBytes: 0,
      },
      descriptorError: null,
      liveThreadStatus: "inactive",
      items: [
        {
          itemId: params.userItemId,
          position: 0,
          type: "user_message",
          state: "completed",
          text: params.userText,
        },
        {
          itemId: params.assistantItemId,
          position: 1,
          type: "assistant_message",
          state: "completed",
          text: params.assistantText,
        },
      ],
    };
  }

  it("accepts crash evidence with a retained prefix and no premature notice", () => {
    expect(
      checkCapableHistoryVerifyResult(goodVerify(), defaultCapableHistorySeedParams()),
    ).toEqual([]);
  });

  it("rejects a clean thread, a committed lost event and an existing notice", () => {
    const params = defaultCapableHistorySeedParams();
    expect(
      checkCapableHistoryVerifyResult({ ...goodVerify(), contaminationReason: null }, params).join(
        "; ",
      ),
    ).toMatch(/contamination is null/);
    expect(
      checkCapableHistoryVerifyResult(
        {
          ...goodVerify(),
          items: [
            ...goodVerify().items,
            {
              itemId: params.lostItemId,
              position: 2,
              type: "assistant_message",
              state: "started",
              text: null,
            },
          ],
        },
        params,
      ).join("; "),
    ).toMatch(/accepted-but-lost event was committed/);
    expect(
      checkCapableHistoryVerifyResult({ ...goodVerify(), noticeAbsent: false }, params).join("; "),
    ).toMatch(/durable notice already exists/);
  });
});

describe.skipIf(!sqliteAvailable)("capable-history crash seed fixture", () => {
  it("forks the seeder, SIGKILLs it, and reopens to a suspect gap with the committed prefix", async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    const repoRoot = findRepoRoot();
    const dir = tempDir();
    const dbPath = join(dir, "state.sqlite");
    const fixturePath = join(repoRoot, "tests/native-e2e/fixtures/android-capable-history-seed.ts");
    const params = defaultCapableHistorySeedParams({ projectPath: dir });
    const seedOutput = await runCapableHistorySeedFixture({
      repoRoot,
      fixturePath,
      dbPath,
      params,
      timeoutMs: 25_000,
    });
    expect(seedOutput).toContain("CAPABLE_HISTORY_SEED_ARMED");
    const verified = await runCapableHistoryVerifyFixture({
      repoRoot,
      fixturePath,
      dbPath,
      params,
      timeoutMs: 25_000,
    });
    expect(checkCapableHistoryVerifyResult(verified, params)).toEqual([]);
    expect(verified.descriptor?.source).toBe("suspect");
    expect(verified.items.map((item) => item.itemId)).toEqual([
      params.userItemId,
      params.assistantItemId,
    ]);
  }, 90_000);
});

describe("capable-history device ownership gate", () => {
  const expectedAppId = DEFAULT_CAPABLE_HISTORY_APP_ID;
  const expectedAvd = "Poracode_Capable_API37";
  const runnerComponent = `${expectedAppId}.test/androidx.test.runner.AndroidJUnitRunner`;

  function deviceIdentity(
    overrides: Partial<CapableHistoryDeviceIdentity> = {},
  ): CapableHistoryDeviceIdentity {
    return {
      serial: "emulator-5554",
      qemuKernel: "1",
      buildCharacteristics: "emulator,virtio",
      isEmulator: true,
      avdName: expectedAvd,
      model: "sdk_gphone64_arm64",
      apiLevel: "37",
      abi: "arm64-v8a",
      buildFingerprint: "google/sdk_gphone64_arm64/emulator:37/MAIN:userdebug/test-keys",
      appId: expectedAppId,
      testPackage: `${expectedAppId}.test`,
      appPath: "package:/data/app/~~x/base.apk",
      instrumentationPath: "package:/data/app/~~y/base.apk",
      instrumentation: [{ component: runnerComponent, targetPackage: expectedAppId }],
      ...overrides,
    };
  }

  function assertOwned(identity: CapableHistoryDeviceIdentity): void {
    assertCapableHistoryDeviceOwnership({
      identity,
      expectedAvd,
      expectedAppId,
      runnerComponent,
    });
  }

  it("accepts only the explicit dedicated emulator carrying the canonical app", () => {
    expect(() => assertOwned(deviceIdentity())).not.toThrow();
  });

  it("refuses a non-emulator serial, wrong AVD, missing app or missing instrumentation", () => {
    expect(() => assertOwned(deviceIdentity({ isEmulator: false, qemuKernel: "0" }))).toThrow(
      /device-not-owned:.*not an emulator/,
    );
    expect(() => assertOwned(deviceIdentity({ avdName: "Pixel_Personal" }))).toThrow(
      /AVD Pixel_Personal != expected dedicated AVD/,
    );
    expect(() => assertOwned(deviceIdentity({ avdName: null }))).toThrow(/no AVD identity/);
    expect(() => assertOwned(deviceIdentity({ appPath: "" }))).toThrow(/is not installed/);
    expect(() => assertOwned(deviceIdentity({ instrumentationPath: "" }))).toThrow(
      /instrumentation package .* is not installed/,
    );
  });

  it("refuses instrumentation that targets an unrelated package or runner", () => {
    expect(() =>
      assertOwned(
        deviceIdentity({
          instrumentation: [{ component: runnerComponent, targetPackage: "com.example.unrelated" }],
        }),
      ),
    ).toThrow(/targets com\.example\.unrelated/);
    expect(() =>
      assertOwned(
        deviceIdentity({
          instrumentation: [
            { component: "com.other.test/OtherRunner", targetPackage: expectedAppId },
          ],
        }),
      ),
    ).toThrow(/installed instrumentation .* is missing/);
  });

  it("parses only target-bearing instrumentation entries", () => {
    const parsed = parseCapableHistoryInstrumentationList(
      [
        `instrumentation:${runnerComponent} (target=${expectedAppId})`,
        "instrumentation:com.other.test/com.other.Runner (target=com.other)",
        "noise",
      ].join("\n"),
    );
    expect(parsed).toEqual([
      { component: runnerComponent, targetPackage: expectedAppId },
      { component: "com.other.test/com.other.Runner", targetPackage: "com.other" },
    ]);
  });

  it("accepts only a success-reporting pm clear", () => {
    expect(capableHistoryClearSucceeded({ code: 0, stdout: "Success\n", stderr: "" })).toBe(true);
    expect(capableHistoryClearSucceeded({ code: 0, stdout: "", stderr: "" })).toBe(false);
    expect(capableHistoryClearSucceeded({ code: 1, stdout: "Success", stderr: "boom" })).toBe(
      false,
    );
  });

  it("joins a child whose spawn failed instead of waiting on an unhandled error", async () => {
    const { spawn } = await import("node:child_process");
    const child = spawn("capable-history-no-such-binary-xyz", []);
    await expect(waitForChildClose(child)).resolves.toBeNull();
  });
});

describe("capable-history adb argument escaping", () => {
  /**
   * Every value the journey crosses through `adb shell` is quoted by one rule;
   * these are the exact values (markers, URL, class) plus hostile neighbors.
   */
  const instrumentValues = [
    "[chj-t1-done]",
    "[chj-prefix",
    "[chj-prefix-user]",
    "[chj-prefix-assistant]",
    "com.poracode.app.Android37CapableHistoryJourneyInstrumentedTest",
    "http://127.0.0.1:49195/pair?token=abc#one-time-secret",
    "plain-marker",
    "two words",
    "it's got 'quotes'",
    "semi;colon && pipe|redirect>file",
    'dollar$var `backtick` "double"',
    "glob[abc]*? and {brace}",
    "hash#comment",
    "newline\nsecond",
  ];

  it("quotes a value as one POSIX single-quoted literal word", () => {
    expect(adbShellLiteral("[chj-t1-done]")).toBe("'[chj-t1-done]'");
    expect(adbShellLiteral("[chj-prefix-user]")).toBe("'[chj-prefix-user]'");
    expect(adbShellLiteral("plain-marker")).toBe("'plain-marker'");
    expect(adbShellLiteral("it's")).toBe("'it'\\''s'");
    expect(adbShellLiteral("two words")).toBe("'two words'");
  });

  it("round-trips every fixture value unchanged through a real POSIX shell", async () => {
    for (const sample of instrumentValues) {
      const result = await runCommand("/bin/sh", ["-c", `printf '%s' ${adbShellLiteral(sample)}`]);
      expect(result.code, `shell exit for ${JSON.stringify(sample)}: ${result.stderr}`).toBe(0);
      expect(result.stdout, `round-trip for ${JSON.stringify(sample)}`).toBe(sample);
    }
  });
});

describe("capable-history journey ownership inputs", () => {
  it("requires an explicit serial and dedicated AVD before any device mutation", () => {
    const { entrypoint } = artifactFixture(tempDir());
    const artifactEnv = {
      [CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV]: entrypoint,
      [CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV]: createHash("sha256")
        .update("// fixture server\n")
        .digest("hex"),
    };
    expect(() => resolveCapableHistoryJourneyInputs(artifactEnv, findRepoRoot())).toThrow(
      /capable-history-journey:serial-required/,
    );
    expect(() =>
      resolveCapableHistoryJourneyInputs(
        { ...artifactEnv, [CAPABLE_HISTORY_JOURNEY_SERIAL_ENV]: "emulator-5554" },
        findRepoRoot(),
      ),
    ).toThrow(/capable-history-journey:avd-required/);

    const inputs = resolveCapableHistoryJourneyInputs(ownedJourneyEnv(), findRepoRoot());
    expect(inputs.serial).toBe("emulator-5554");
    expect(inputs.expectedAvd).toBe("Poracode_Capable_API37");
    expect(inputs.appId).toBe(DEFAULT_CAPABLE_HISTORY_APP_ID);
    expect(inputs.canonicalAppId).toBe(DEFAULT_CAPABLE_HISTORY_APP_ID);
    expect(inputs.runnerComponent).toBe(
      `${DEFAULT_CAPABLE_HISTORY_APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`,
    );
  });

  it("pins the canonical app under test from the Android build and refuses an override", () => {
    expect(readCanonicalAndroidAppId(findRepoRoot())).toBe(DEFAULT_CAPABLE_HISTORY_APP_ID);
    expect(() =>
      resolveCapableHistoryJourneyInputs(
        { ...ownedJourneyEnv(), [CAPABLE_HISTORY_JOURNEY_APP_ID_ENV]: "com.example.unrelated" },
        findRepoRoot(),
      ),
    ).toThrow(/capable-history-journey:app-id-not-canonical/);
  });
});

describe("capable-history journey runner gate", () => {
  it("exposes an explicit gate and refuses to resolve inputs without an artifact", () => {
    expect(journeyGateEnabled({})).toBe(false);
    expect(journeyGateEnabled({ ANDROID_CAPABLE_HISTORY_JOURNEY: "1" })).toBe(true);
    expect(() => resolveCapableHistoryJourneyInputs({}, findRepoRoot())).toThrow(
      /capable-history-journey:entrypoint-required/,
    );
    expect(() =>
      resolveCapableHistoryJourneyInputs(
        {
          ANDROID_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT: join(findRepoRoot(), "dist/main/server.cjs"),
          ANDROID_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA256: "c".repeat(64),
        },
        findRepoRoot(),
      ),
    ).toThrow(/entrypoint-root-dist-refused/);
  });

  it("keeps the journey error taxonomy stable", () => {
    expect(capableHistoryJourneyError("demo", "detail").message).toBe(
      "capable-history-journey:demo: detail",
    );
  });
});

/**
 * The end-to-end device journey. It only runs when
 * `ANDROID_CAPABLE_HISTORY_JOURNEY=1` and the explicit artifact env (+ paired
 * emulator) are supplied; see
 * `tmp/v2-production/android-capable-history-journey-preparation.md`.
 */
describe.skipIf(!journeyGateEnabled())("capable-host Android capable-history journey", () => {
  it("runs the prepared fixture and instrumented journey against the supplied artifact", async () => {
    const inputs = resolveCapableHistoryJourneyInputs();
    const result = await runCapableHistoryJourney(inputs, { instrumentationTimeoutMs: 900_000 });
    expect(result.provenancePath).toContain("provenance.json");
  }, 1_800_000);
});
