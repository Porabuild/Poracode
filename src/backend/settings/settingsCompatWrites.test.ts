import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSharedSettings,
  type SharedSettings,
  type SharedSettingsInput,
} from "@/shared/settings";
import { settingsSubjectId, type SettingsSubject } from "@/shared/settingsTransactions";
import { SettingsAuthority } from "./SettingsAuthority";
import { SettingsCompatWriter } from "./settingsCompatWrites";

describe("settings compat and trusted writes", () => {
  let root: string;
  let settingsPath: string;
  let active: boolean;
  let generation: string;
  const authorities: SettingsAuthority[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "settings-compat-"));
    settingsPath = join(root, "settings.json");
    active = true;
    generation = randomUUID();
  });
  afterEach(async () => {
    await Promise.all(authorities.splice(0).map((authority) => authority.close()));
    await rm(root, { recursive: true, force: true });
  });

  async function open(initial?: Partial<SharedSettings>) {
    if (initial)
      await writeFile(settingsPath, JSON.stringify({ ...defaultSharedSettings, ...initial }));
    const authority = await SettingsAuthority.open({
      lease: {
        paths: { dataRoot: root },
        generation,
        assertActive: (expected) => {
          if (!active || expected !== generation) throw new Error("Fixture lease is inactive");
        },
      },
    });
    authorities.push(authority);
    return { authority, writes: new SettingsCompatWriter(authority) };
  }

  const usage: SettingsSubject = { kind: "field", field: "crossagentSelectionUsage" };

  async function commitField(
    authority: SettingsAuthority,
    subject: SettingsSubject,
    value: unknown,
  ): Promise<void> {
    const snapshot = authority.snapshot([subject]);
    const result = await authority.mutate(
      {
        version: 1,
        authorityId: snapshot.authorityId,
        edits: [
          {
            subject,
            expectedRevision: snapshot.revisions[settingsSubjectId(subject)]!,
            ...(value === undefined
              ? { operation: "delete" as const }
              : { operation: "set" as const, value: value as never }),
          },
        ],
      },
      () => true,
    );
    expect(result.status).toBe("committed");
  }

  it("keeps a concurrent field change when committing a stale whole snapshot", async () => {
    const { authority, writes } = await open({ themeMode: "dark" });
    const stale = structuredClone(authority.readSettings());
    // Another writer commits while the renderer prepared its snapshot.
    await commitField(authority, usage, [
      {
        agentKind: "fixture-agent",
        modelId: "small",
        fast: false,
        count: 2,
        lastUsedAt: 1,
        tags: ["review"],
      },
    ]);
    await expect(
      writes.commitCompatSnapshot({ ...stale, themeMode: "light" }),
    ).resolves.toMatchObject({
      themeMode: "light",
      crossagentSelectionUsage: [{ count: 2, tags: ["review"] }],
    });
    expect(JSON.parse(await readFile(settingsPath, "utf8")).$poracodeSettingsVersion).toBe(1);
  });

  it("applies only patch keys and never reverts concurrent edits to other fields", async () => {
    const { authority, writes } = await open({ themeMode: "dark" });
    await commitField(authority, usage, [
      {
        agentKind: "fixture-agent",
        modelId: "small",
        fast: false,
        count: 1,
        lastUsedAt: 1,
      },
    ]);
    await expect(
      writes.commitCompatPatch({ themeMode: "light", guiChatFontSize: 14 }),
    ).resolves.toMatchObject({
      themeMode: "light",
      guiChatFontSize: 14,
      crossagentSelectionUsage: [{ count: 1 }],
    });
    // A patch built over the stale snapshot would have reverted the usage entry
    // had the write not been scoped to the patch keys.
  });

  it("rebases a trusted owner-managed field edit after a revision race", async () => {
    const { authority, writes } = await open();
    // The first attempt reads a revision that a concurrent writer has already
    // replaced; the authority refuses it and the bounded rebase re-derives.
    const realSnapshot = authority.snapshot.bind(authority);
    const staleRevision = `s1:${"ab".repeat(32)}`;
    let attempts = 0;
    vi.spyOn(authority, "snapshot").mockImplementation((subjects) => {
      const snapshot = realSnapshot(subjects);
      if (attempts++ === 0)
        return {
          ...snapshot,
          revisions: { ...snapshot.revisions, [settingsSubjectId(usage)]: staleRevision },
        };
      return snapshot;
    });
    const result = await writes.editSettingsField("crossagentSelectionUsage", (current) => [
      ...current.crossagentSelectionUsage,
      {
        agentKind: "fixture-agent",
        modelId: "small",
        fast: false,
        count: 1,
        lastUsedAt: 1,
      },
    ]);
    expect(result.status).toBe("committed");
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(authority.readSettings()).toMatchObject({
      crossagentSelectionUsage: [{ count: 1 }],
    });
  });

  it("reports a persistent conflict instead of overwriting the concurrent writer", async () => {
    const { authority, writes } = await open();
    // Every attempt reads a stale revision, so the bounded rebase must give up
    // with the explicit conflict rather than clobber the subject.
    const realSnapshot = authority.snapshot.bind(authority);
    const staleRevision = `s1:${"cd".repeat(32)}`;
    vi.spyOn(authority, "snapshot").mockImplementation((subjects) => {
      const snapshot = realSnapshot(subjects);
      return {
        ...snapshot,
        revisions: { ...snapshot.revisions, [settingsSubjectId(usage)]: staleRevision },
      };
    });
    await expect(
      writes.editSettingsField("crossagentSelectionUsage", () => []),
    ).resolves.toMatchObject({ status: "conflict", reason: "revision-changed" });
    expect(authority.snapshot().sequence).toBe(0);
  });

  it("returns a committed no-op for an equal snapshot without touching the document", async () => {
    const { authority, writes } = await open({ themeMode: "dark" });
    const before = await readFile(settingsPath, "utf8");
    const snapshot = authority.snapshot();
    await expect(writes.commitCompatSnapshot(authority.readSettings())).resolves.toMatchObject({
      themeMode: "dark",
    });
    expect(authority.snapshot().sequence).toBe(snapshot.sequence);
    expect(await readFile(settingsPath, "utf8")).toBe(before);
  });

  it("preserves a committed admission policy when an older whole snapshot omits the field", async () => {
    const admission = {
      maxActiveAgentSessions: 3,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    };
    const { authority, writes } = await open({ hostResourceAdmission: admission });
    const sequence = authority.snapshot().sequence;
    const stale = { ...authority.readSettings() } as Record<string, unknown>;
    delete stale.hostResourceAdmission;

    await writes.commitCompatSnapshot(stale as unknown as SharedSettingsInput);

    expect(authority.readSettings().hostResourceAdmission).toEqual(admission);
    expect(authority.snapshot().sequence).toBe(sequence);
  });

  it("lets a present stale admission value win field-wise as documented", async () => {
    const { authority, writes } = await open({
      hostResourceAdmission: {
        maxActiveAgentSessions: 3,
        maxActiveTerminalShells: 0,
        maxActiveGenerationHelpers: 0,
      },
    });
    const stale = structuredClone(authority.readSettings());
    stale.hostResourceAdmission = {
      maxActiveAgentSessions: 0,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    };

    await writes.commitCompatSnapshot(stale);

    // Present values win field-wise; only omission is a no-op. Current writers
    // always send the committed value, so this is not a live clobber path.
    expect(authority.readSettings().hostResourceAdmission).toEqual({
      maxActiveAgentSessions: 0,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
  });

  it("throws the typed refusal kinds a transport maps to 409/429", async () => {
    const { authority, writes } = await open({ themeMode: "dark" });
    const themeMode: SettingsSubject = { kind: "field", field: "themeMode" };
    const realSnapshot = authority.snapshot.bind(authority);
    const staleRevision = `s1:${"ef".repeat(32)}`;
    // A conflict that survives every rebase attempt rejects as `conflict`...
    vi.spyOn(authority, "snapshot").mockImplementation((subjects) => {
      const snapshot = realSnapshot(subjects);
      return {
        ...snapshot,
        revisions: { ...snapshot.revisions, [settingsSubjectId(themeMode)]: staleRevision },
      };
    });
    await expect(writes.commitCompatPatch({ themeMode: "light" })).rejects.toMatchObject({
      name: "SettingsWriteRefusedError",
      kind: "conflict",
    });
    // ...and an admission overload rejects as `overloaded`.
    const { authority: authority2, writes: writes2 } = await open({ themeMode: "dark" });
    vi.spyOn(authority2, "mutate").mockResolvedValue({
      status: "overloaded",
      authorityId: authority2.authorityId,
      sequence: 0,
      reason: "queue-full",
    });
    await expect(writes2.commitCompatPatch({ themeMode: "light" })).rejects.toMatchObject({
      name: "SettingsWriteRefusedError",
      kind: "overloaded",
    });
  });
});
