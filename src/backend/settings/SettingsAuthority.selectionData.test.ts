import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsSubjectId } from "@/shared/settingsTransactions";
import { SettingsAuthority } from "./SettingsAuthority";
import { SETTINGS_DOCUMENT_VERSION, SETTINGS_DOCUMENT_VERSION_KEY } from "./settingsDocument";

const subject = { kind: "field", field: "themeMode" } as const;
const futureSelection = {
  model: "opaque-member",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "default",
  selectionBinding: { version: 200, unknown: "retain" },
};
let root: string;
let path: string;
const authorities: SettingsAuthority[] = [];
beforeEach(async () => {
  await mkdir("tmp", { recursive: true });
  root = await mkdtemp(join("tmp", "settings-selection-"));
  path = join(root, "settings.json");
});
afterEach(async () => {
  await Promise.all(authorities.splice(0).map((authority) => authority.close()));
  await rm(root, { recursive: true, force: true });
});

async function open(assertPreparedDatabaseForWrite = () => {}) {
  const onCommitted = vi.fn<() => void>();
  const authority = await SettingsAuthority.open({
    lease: { paths: { dataRoot: root }, generation: randomUUID(), assertActive: () => {} },
    // These file/CAS tests intentionally mock DB admission; real Core coverage
    // lives in BackendHostCore.settingsAdmission.test.ts.
    assertPreparedDatabaseForWrite,
    onCommitted,
  });
  authorities.push(authority);
  return { authority, onCommitted };
}

function edit(authority: SettingsAuthority) {
  const snapshot = authority.snapshot([subject]);
  return {
    version: 1,
    authorityId: snapshot.authorityId,
    edits: [
      {
        subject,
        expectedRevision: snapshot.revisions[settingsSubjectId(subject)]!,
        operation: "set",
        value: "light",
      },
    ],
  };
}

describe("authoritative persisted settings selection refusal", () => {
  it("reads a legacy version-1 document without backfill and upgrades only on an admitted commit", async () => {
    const { selectionBinding: _ignored, ...selection } = futureSelection;
    const contents = JSON.stringify({
      [SETTINGS_DOCUMENT_VERSION_KEY]: 1,
      themeMode: "dark",
      titleGenSelection: selection,
    });
    await writeFile(path, contents);
    const { authority } = await open();
    expect(authority.readSettings().titleGenSelection).toEqual(selection);
    expect(await readFile(path, "utf8")).toBe(contents);
    await expect(authority.mutate(edit(authority), () => true)).resolves.toMatchObject({
      status: "committed",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      [SETTINGS_DOCUMENT_VERSION_KEY]: SETTINGS_DOCUMENT_VERSION,
      titleGenSelection: selection,
    });
  });

  it.each(["providerConfigs", "titleGenSelection"])(
    "refuses unrelated edits without touching exact %s bytes",
    async (field) => {
      const value = field === "providerConfigs" ? { fixture: futureSelection } : futureSelection;
      const contents = ` { "${field}" : ${JSON.stringify(value)}, "themeMode" : "dark" }\n`;
      await writeFile(path, contents);
      const { authority, onCommitted } = await open();
      const snapshot = authority.snapshot();
      expect(snapshot.settings.themeMode).toBe("dark");
      await expect(authority.mutate(edit(authority), () => true)).rejects.toThrow(
        "unsupported selection data",
      );
      expect(await readFile(path, "utf8")).toBe(contents);
      expect(await readdir(root)).toEqual(["settings.json"]);
      expect(authority.snapshot()).toEqual(snapshot);
      expect(onCommitted).not.toHaveBeenCalled();
    },
  );

  it("does not authorize replacement that omits an unsupported binding", async () => {
    const contents = JSON.stringify({ titleGenSelection: futureSelection });
    await writeFile(path, contents);
    const { authority } = await open();
    const target = { kind: "field", field: "titleGenSelection" } as const;
    const snapshot = authority.snapshot([target]);
    const { selectionBinding: _ignored, ...replacement } = futureSelection;
    await expect(
      authority.mutate(
        {
          version: 1,
          authorityId: snapshot.authorityId,
          edits: [
            {
              subject: target,
              expectedRevision: snapshot.revisions[settingsSubjectId(target)]!,
              operation: "set",
              value: replacement,
            },
          ],
        },
        () => true,
      ),
    ).rejects.toThrow("unsupported selection data");
    expect(await readFile(path, "utf8")).toBe(contents);
    expect(authority.snapshot().sequence).toBe(0);
  });

  it("rechecks fresh raw disk metadata instead of trusting the cached projection", async () => {
    await writeFile(path, '{"themeMode":"dark"}');
    const { authority, onCommitted } = await open();
    const request = edit(authority);
    const contents = ` {"themeMode":"dark","commitGenSelection":${JSON.stringify(futureSelection)}}\n`;
    await writeFile(path, contents);
    await expect(authority.mutate(request, () => true)).rejects.toThrow(
      "unsupported selection data",
    );
    expect(await readFile(path, "utf8")).toBe(contents);
    expect(authority.snapshot().sequence).toBe(0);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it.each([2, 3, 4, 5, 6])(
    "refuses new unsupported disk data at persistence checkpoint %i",
    async (failAt) => {
      await writeFile(path, '{"themeMode":"dark"}');
      let calls = 0;
      let protectedContents = "";
      const { authority, onCommitted } = await open(() => {
        if (++calls === failAt) {
          protectedContents = ` {"themeMode":"dark","commitGenSelection":${JSON.stringify(futureSelection)}}\n`;
          writeFileSync(path, protectedContents);
        }
      });
      await expect(authority.mutate(edit(authority), () => true)).rejects.toThrow(
        "unsupported selection data",
      );
      expect(calls).toBe(failAt);
      expect(readFileSync(path, "utf8")).toBe(protectedContents);
      expect(await readdir(root)).toEqual(["settings.json"]);
      expect(authority.snapshot().sequence).toBe(0);
      expect(onCommitted).not.toHaveBeenCalled();
    },
  );

  it("refuses a newer settings marker introduced after open", async () => {
    await writeFile(path, '{"themeMode":"dark"}');
    const { authority } = await open();
    const contents = JSON.stringify({ [SETTINGS_DOCUMENT_VERSION_KEY]: 200, themeMode: "dark" });
    await writeFile(path, contents);
    await expect(authority.mutate(edit(authority), () => true)).rejects.toThrow(
      "unsupported document version",
    );
    expect(await readFile(path, "utf8")).toBe(contents);
  });

  it("refuses changed known values outside the authority instead of overwriting them", async () => {
    await writeFile(path, '{"themeMode":"dark"}');
    const { authority } = await open();
    const contents = '{"themeMode":"dark","guiChatFontSize":18}';
    await writeFile(path, contents);
    await expect(authority.mutate(edit(authority), () => true)).rejects.toThrow(
      "data is not ready",
    );
    expect(await readFile(path, "utf8")).toBe(contents);
    expect(authority.snapshot().sequence).toBe(0);
  });
});
