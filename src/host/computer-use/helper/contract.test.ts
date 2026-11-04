import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  COMPUTER_USE_HELPER_PROTOCOL_VERSION,
  COMPUTER_USE_LOCKED_USE_BEGIN_OUTCOMES,
  COMPUTER_USE_LOCKED_USE_END_REASONS,
  computerUseLockedUseEndResultSchema,
  computerUseHelperHelloSchema,
  computerUseLockedUseBeginResultSchema,
  computerUseLockedUseStatusSchema,
} from "@/shared/contracts/computerUse";
import {
  isComputerUseBackendAvailable,
  resolveComputerUseHelperBinaryPath,
} from "../drivers/helperBinary";
import {
  COMPUTER_USE_ELEMENT_ACTIONS,
  COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS,
  COMPUTER_USE_REFUSAL_CODES,
} from "../mcp/types";

const crateRoot = join(process.cwd(), "native", "computer-use-helper");
const binaryName =
  process.platform === "win32" ? "poracode-computer-use.exe" : "poracode-computer-use";
const helperBinary = [
  resolveComputerUseHelperBinaryPath(join(process.cwd(), "resources", "computer-use-helper")),
  process.env.PORACODE_COMPUTER_USE_HELPER_PATH,
  join(crateRoot, "target", "debug", binaryName),
  join(crateRoot, "target", "release", binaryName),
].find((candidate): candidate is string => typeof candidate === "string" && existsSync(candidate));

describe("computer-use helper contract", () => {
  it("keeps the TypeScript and Rust protocol versions equal", () => {
    const source = readFileSync(
      join(process.cwd(), "native", "computer-use-helper", "src", "protocol", "version.rs"),
      "utf8",
    );
    const match = /pub const PROTOCOL_VERSION: u32 = (\d+);/u.exec(source);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(COMPUTER_USE_HELPER_PROTOCOL_VERSION);
  });

  it("accepts a protocol 3 hello without locked-use facts and a protocol 4 hello with them", () => {
    const v3Hello = {
      protocolVersion: 3,
      minClientProtocolVersion: 1,
      helperVersion: "0.9.0",
      platform: "darwin",
      arch: "arm64",
      displayServer: null,
      capabilities: {
        backgroundPointer: true,
        backgroundKeyboard: true,
        backgroundChords: true,
        accessibilityTree: true,
        elementActions: true,
        occludedCapture: true,
        foregroundInput: true,
        launchApp: true,
        stableWindowIds: true,
      },
      permissions: { accessibility: "granted", screenRecording: "granted" },
      screenLocked: false,
      notes: [],
    };
    expect(computerUseHelperHelloSchema.parse(v3Hello).lockedUse).toBeUndefined();
    expect(
      computerUseHelperHelloSchema.parse({
        ...v3Hello,
        protocolVersion: 4,
        lockedUse: { supported: true, signed: true, paused: false, active: false },
      }).lockedUse,
    ).toEqual({ supported: true, signed: true, paused: false, active: false });
  });

  it("parses locked-use results with stages a newer helper may add", () => {
    expect(
      computerUseLockedUseBeginResultSchema.parse({ outcome: "failed", stage: "future_stage" }),
    ).toEqual({ outcome: "failed", stage: "future_stage" });
    expect(() => computerUseLockedUseBeginResultSchema.parse({ outcome: "opened" })).toThrow(
      /outcome/,
    );
    expect(
      computerUseLockedUseStatusSchema.parse({
        supported: true,
        signed: false,
        paused: true,
        active: false,
        screenLocked: true,
      }),
    ).toMatchObject({ paused: true });
  });

  it("keeps TypeScript wire enums equal to the Rust fixture", () => {
    const fixture = JSON.parse(
      readFileSync(join(crateRoot, "fixtures", "protocol-v1.enums.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(COMPUTER_USE_ELEMENT_ACTIONS).toEqual(fixture.elementActions);
    expect(COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS).toEqual(fixture.invocableElementActions);
    expect(COMPUTER_USE_REFUSAL_CODES).toEqual(fixture.refusalCodes);
    expect(COMPUTER_USE_LOCKED_USE_BEGIN_OUTCOMES).toEqual(fixture.lockedUseOutcomes);
    expect(COMPUTER_USE_LOCKED_USE_END_REASONS).toEqual(fixture.lockedUseEndReasons);
    expect(computerUseLockedUseEndResultSchema.shape.outcome.options).toEqual(
      fixture.lockedUseEndOutcomes,
    );
    // Stages stay a free string on the TS side, but every helper stage must parse.
    for (const stage of fixture.lockedUseStages as string[]) {
      expect(computerUseLockedUseBeginResultSchema.parse({ outcome: "failed", stage }).stage).toBe(
        stage,
      );
    }
  });

  it("keeps helper targets aligned with the packaged platform matrix", () => {
    const helperRoot = mkdtempSync(join(tmpdir(), "poracode-computer-use-targets-"));
    const originalOverride = process.env.PORACODE_COMPUTER_USE_HELPER_PATH;
    delete process.env.PORACODE_COMPUTER_USE_HELPER_PATH;
    try {
      const targets = [
        { platform: "win32" as const, arch: "x64", id: "win32-x64", executable: true },
        { platform: "win32" as const, arch: "arm64", id: "win32-arm64", executable: true },
        {
          platform: "darwin" as const,
          arch: "x64",
          id: "darwin-universal",
          executable: false,
        },
        { platform: "linux" as const, arch: "x64", id: "linux-x64", executable: false },
      ];
      writeFileSync(
        join(helperRoot, "manifest.json"),
        JSON.stringify({ targets: targets.map((target) => target.id) }),
      );
      for (const target of targets) {
        const directory = join(helperRoot, target.id);
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          join(
            directory,
            target.executable ? "poracode-computer-use.exe" : "poracode-computer-use",
          ),
          "helper",
        );
        expect(resolveComputerUseHelperBinaryPath(helperRoot, target.platform, target.arch)).toBe(
          join(
            directory,
            target.executable ? "poracode-computer-use.exe" : "poracode-computer-use",
          ),
        );
      }
      expect(resolveComputerUseHelperBinaryPath(helperRoot, "linux", "arm64")).toBeNull();
      expect(isComputerUseBackendAvailable(helperRoot, "linux", "arm64")).toBe(false);
      expect(isComputerUseBackendAvailable(helperRoot, "linux", "x64")).toBe(true);
      expect(isComputerUseBackendAvailable(helperRoot, "darwin", "arm64")).toBe(true);
      expect(isComputerUseBackendAvailable(helperRoot, "win32", "arm64")).toBe(true);

      const prepareSource = readFileSync(
        join(process.cwd(), "scripts", "prepare-computer-use-helper.mjs"),
        "utf8",
      );
      const afterPackSource = readFileSync(join(process.cwd(), "build", "after-pack.cjs"), "utf8");
      const artifactSource = readFileSync(
        join(process.cwd(), "scripts", "build-desktop-artifact.mjs"),
        "utf8",
      );
      expect(prepareSource).toContain(
        'linux: [{ arch: "x64", id: "linux-x64", triple: "x86_64-unknown-linux-musl" }]',
      );
      expect(prepareSource).toContain(
        "Rust cargo/rustup is unavailable; computer use will be unavailable on Linux",
      );
      expect(prepareSource).toContain(
        "Rust cargo/rustup is unavailable; computer use will use the legacy foreground driver",
      );
      expect(afterPackSource).toContain('if (archName !== "x64")');
      expect(artifactSource).toContain('linux: ["x64"]');
    } finally {
      if (originalOverride === undefined) {
        delete process.env.PORACODE_COMPUTER_USE_HELPER_PATH;
      } else {
        process.env.PORACODE_COMPUTER_USE_HELPER_PATH = originalOverride;
      }
      rmSync(helperRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(helperBinary === undefined)("replays the Rust protocol fixture", () => {
    if (!helperBinary) throw new Error("helper binary is unavailable");
    const fixture = readFileSync(join(crateRoot, "fixtures", "protocol-v1.ndjson"));
    const expected = JSON.parse(
      readFileSync(join(crateRoot, "fixtures", "protocol-v1.expected.json"), "utf8"),
    ) as Array<Record<string, unknown>>;
    const result = spawnSync(helperBinary, { input: fixture, encoding: "utf8" });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const actual = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(actual).toHaveLength(expected.length);
    for (const expectedResponse of expected) {
      const response = actual.find((candidate) => candidate.id === expectedResponse.id);
      expect(response).toMatchObject(expectedResponse);
    }
  });
});
