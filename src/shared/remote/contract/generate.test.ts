import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRemoteV3GeneratedFiles, buildRemoteV3IrDocument } from "./generate";
import { checkRemoteV3Generated, writeRemoteV3Generated } from "./writeGenerated";
import { REMOTE_CONTRACT_INVENTORY } from "./registry";
import { gitStatusResultSchema, prStateSchema } from "../../contracts";
import { compareUnicodeCodePoints } from "./unicodeOrder";

const sampleGitStatus = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: {
    url: "git@github.com:acme/app.git",
    platform: "github" as const,
    owner: "acme",
    repo: "app",
  },
  ahead: 0,
  behind: 1,
  staged: [],
  unstaged: [{ path: "src/a.ts", status: "modified", staged: false, insertions: 2, deletions: 1 }],
  totalInsertions: 2,
  totalDeletions: 1,
};

describe("remote v3 generator", () => {
  it("emits stable sorted artifacts with version, hash, and inventory counts", () => {
    const first = buildRemoteV3GeneratedFiles();
    const second = buildRemoteV3GeneratedFiles();
    const third = buildRemoteV3GeneratedFiles();
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    const ir = JSON.parse(first["ir.json"]) as {
      doNotEdit: string;
      protocolVersion: number;
      bindingFormatVersion: number;
      generatorVersion: number;
      sourceHash: string;
      manifestHash: string;
      inventory: typeof REMOTE_CONTRACT_INVENTORY;
      routes: Array<{ id: string }>;
      procedures: Array<{ name: string }>;
    };
    expect(ir.doNotEdit).toMatch(/Do not edit/i);
    expect(ir.protocolVersion).toBe(3);
    expect(ir.bindingFormatVersion).toBe(2);
    expect(ir.generatorVersion).toBe(3);
    expect(ir.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ir.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ir.inventory.routes).toBe(56);
    expect(ir.inventory.procedures).toBe(100);
    expect(ir.inventory.voidProcedureResults).toBe(36);
    expect(ir.inventory.jsonProcedureResults).toBe(64);
    expect(ir.routes.map((route) => route.id)).toEqual(
      [...ir.routes.map((route) => route.id)].sort(compareUnicodeCodePoints),
    );
    expect(ir.procedures.map((procedure) => procedure.name)).toEqual(
      [...ir.procedures.map((procedure) => procedure.name)].sort(compareUnicodeCodePoints),
    );
    expect(buildRemoteV3IrDocument().sourceHash).toBe(ir.sourceHash);
  });

  it("--check is side-effect free and fails on stale, missing, and extra files", () => {
    const root = mkdtempSync(join(tmpdir(), "remote-v3-"));
    try {
      writeRemoteV3Generated(root);
      expect(checkRemoteV3Generated(root)).toEqual([]);

      const generated = join(root, "protocol/remote/v3/generated");
      writeFileSync(join(generated, "extra.json"), "{}\n");
      expect(checkRemoteV3Generated(root).some((error) => error.includes("extra"))).toBe(true);
      rmSync(join(generated, "extra.json"));

      rmSync(join(generated, "inventory.json"));
      expect(checkRemoteV3Generated(root).some((error) => error.includes("missing"))).toBe(true);

      writeRemoteV3Generated(root);
      writeFileSync(join(generated, "ir.json"), "{}\n");
      expect(checkRemoteV3Generated(root).some((error) => error.includes("stale"))).toBe(true);
      expect(readFileSync(join(generated, "inventory.json"), "utf8").length).toBeGreaterThan(10);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("result schemas validate representative fixtures and reject mutations", () => {
    expect(gitStatusResultSchema.parse(sampleGitStatus).ahead).toBe(0);
    expect(
      gitStatusResultSchema.safeParse({ ...sampleGitStatus, remoteInfo: undefined }).success,
    ).toBe(false);
    expect(gitStatusResultSchema.safeParse({ ...sampleGitStatus, ahead: null }).success).toBe(
      false,
    );
    expect(prStateSchema.safeParse("merged").success).toBe(true);
    expect(prStateSchema.safeParse("unknown").success).toBe(false);
  });
});
