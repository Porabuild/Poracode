import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { prepareClaudeMergedSettingsFile } from "./mergedSettings";

describe("prepareClaudeMergedSettingsFile (native)", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "poracode-merged-settings-test-"));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const posixLocation: ProjectLocation = { kind: "posix", path: "/tmp/proj" };

  it("merges the given flags into the plugin settings file content", async () => {
    const pluginSettings = join(workDir, "settings.json");
    const original = {
      hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
      preferredNotifChannel: "iterm2",
    };
    await fs.writeFile(pluginSettings, JSON.stringify(original), "utf8");

    const outPath = await prepareClaudeMergedSettingsFile(pluginSettings, posixLocation, {
      ultracode: true,
      fastMode: true,
    });
    expect(outPath).toBe(join(workDir, "settings-poracode.json"));
    const written = JSON.parse(await fs.readFile(outPath!, "utf8"));
    expect(written.ultracode).toBe(true);
    expect(written.fastMode).toBe(true);
    expect(written.hooks).toEqual(original.hooks);
    expect(written.preferredNotifChannel).toBe("iterm2");
  });

  it("returns undefined when the source file is missing", async () => {
    const missing = join(workDir, "does-not-exist.json");
    const outPath = await prepareClaudeMergedSettingsFile(missing, posixLocation, {
      ultracode: true,
    });
    expect(outPath).toBeUndefined();
  });

  it("treats unparseable source as empty and still writes the merged flags", async () => {
    const pluginSettings = join(workDir, "broken.json");
    await fs.writeFile(pluginSettings, "not json {", "utf8");
    const outPath = await prepareClaudeMergedSettingsFile(pluginSettings, posixLocation, {
      ultracode: true,
    });
    expect(outPath).toBe(join(workDir, "settings-poracode.json"));
    const written = JSON.parse(await fs.readFile(outPath!, "utf8"));
    expect(written).toEqual({ ultracode: true });
  });

  it("returns undefined when the path is empty", async () => {
    const outPath = await prepareClaudeMergedSettingsFile("", posixLocation, { ultracode: true });
    expect(outPath).toBeUndefined();
  });
});
