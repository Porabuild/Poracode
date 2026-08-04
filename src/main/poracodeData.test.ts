import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupOrphanedAttachments } from "./poracodeData";

describe("cleanupOrphanedAttachments", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("keeps attachment directories referenced by staged composer messages", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachment-cleanup-"));
    const attachmentsDir = join(tempDir, "attachments");
    const retained = ["draft-project", "remote-server", "handoff-thread"];
    for (const directory of [...retained, "orphan-thread"]) {
      mkdirSync(join(attachmentsDir, directory), { recursive: true });
      writeFileSync(join(attachmentsDir, directory, "image.png"), "image");
    }

    cleanupOrphanedAttachments(attachmentsDir, []);

    for (const directory of retained) {
      expect(existsSync(join(attachmentsDir, directory, "image.png"))).toBe(true);
    }
    expect(existsSync(join(attachmentsDir, "orphan-thread"))).toBe(false);
  });

  it("keeps durable thread directories and removes unknown directories", () => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-attachment-cleanup-"));
    const attachmentsDir = join(tempDir, "attachments");
    mkdirSync(join(attachmentsDir, "thread-12345"), { recursive: true });
    mkdirSync(join(attachmentsDir, "unknown"), { recursive: true });

    cleanupOrphanedAttachments(attachmentsDir, ["thread:12345-more"]);

    expect(existsSync(join(attachmentsDir, "thread-12345"))).toBe(true);
    expect(existsSync(join(attachmentsDir, "unknown"))).toBe(false);
  });
});
