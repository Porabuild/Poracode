import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reserveQualificationSessionRoot } from "./qualificationSessionRoot.ts";

describe("qualification session ownership", () => {
  it("keeps separate evidence runs and preserves the earlier failed owner", () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-qualification-root-"));
    try {
      const first = join(root, "evidence", "first");
      const second = join(root, "evidence", "second");
      mkdirSync(first, { recursive: true });
      mkdirSync(second);
      const input = { parent: join(root, "managed"), armRoot: join(root, "arm"), cellId: "mixed" };
      const a = reserveQualificationSessionRoot({ ...input, evidenceDir: first });
      writeFileSync(join(a, "session.json"), '{"state":"failed","original":true}');
      const b = reserveQualificationSessionRoot({ ...input, evidenceDir: second });
      expect(a).not.toBe(b);
      expect(readFileSync(join(a, "session.json"), "utf8")).toBe(
        '{"state":"failed","original":true}',
      );
      expect(() => reserveQualificationSessionRoot({ ...input, evidenceDir: first })).toThrow(
        /EEXIST/,
      );
      expect(readFileSync(join(a, "session.json"), "utf8")).toContain('"original":true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses an invalid cell before creating a session", () => {
    expect(() =>
      reserveQualificationSessionRoot({
        parent: "/unused",
        armRoot: "/arm",
        cellId: "../escape",
        evidenceDir: "/unused",
      }),
    ).toThrow(/Invalid qualification cell id/);
  });
});
