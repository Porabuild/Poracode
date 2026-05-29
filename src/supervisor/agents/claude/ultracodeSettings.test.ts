import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { prepareClaudeUltracodeSettingsFile } from "./ultracodeSettings";

describe("prepareClaudeUltracodeSettingsFile (native)", () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "lightcode-ultracode-test-"));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const posixLocation: ProjectLocation = { kind: "posix", path: "/tmp/proj" };

  it("merges ultracode:true into the plugin settings file content", async () => {
    const pluginSettings = join(workDir, "settings.json");
    const original = {
      hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
      preferredNotifChannel: "iterm2",
    };
    await fs.writeFile(pluginSettings, JSON.stringify(original), "utf8");

    const outPath = await prepareClaudeUltracodeSettingsFile(pluginSettings, posixLocation);
    expect(outPath).toBe(join(workDir, "settings-ultracode.json"));
    const written = JSON.parse(await fs.readFile(outPath!, "utf8"));
    expect(written.ultracode).toBe(true);
    expect(written.hooks).toEqual(original.hooks);
    expect(written.preferredNotifChannel).toBe("iterm2");
  });

  it("returns undefined when the source file is missing", async () => {
    const missing = join(workDir, "does-not-exist.json");
    const outPath = await prepareClaudeUltracodeSettingsFile(missing, posixLocation);
    expect(outPath).toBeUndefined();
  });

  it("treats unparseable source as empty and still writes a file with ultracode:true", async () => {
    const pluginSettings = join(workDir, "broken.json");
    await fs.writeFile(pluginSettings, "not json {", "utf8");
    const outPath = await prepareClaudeUltracodeSettingsFile(pluginSettings, posixLocation);
    expect(outPath).toBe(join(workDir, "settings-ultracode.json"));
    const written = JSON.parse(await fs.readFile(outPath!, "utf8"));
    expect(written).toEqual({ ultracode: true });
  });

  it("returns undefined when the path is empty", async () => {
    const outPath = await prepareClaudeUltracodeSettingsFile("", posixLocation);
    expect(outPath).toBeUndefined();
  });
});
