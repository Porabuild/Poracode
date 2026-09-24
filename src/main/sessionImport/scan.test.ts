import { mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { scanImportableSessions } from "./scan";
import type { ImportHome } from "./homes";

function codexHome(sessions: Array<{ id: string; cwd: string; prompt: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-scan-codex-"));
  const sessionsDir = join(dir, "sessions", "2026", "09", "20");
  mkdirSync(sessionsDir, { recursive: true });
  for (const session of sessions) {
    writeFileSync(
      join(sessionsDir, `rollout-2026-09-20T04-43-18-${session.id}.jsonl`),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: session.id,
            cwd: session.cwd,
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: session.prompt }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
  }
  return dir;
}

function claudeHome(
  sessions: Array<{ id: string; cwd: string; prompt: string; owner?: string }>,
): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-scan-claude-"));
  for (const session of sessions) {
    const projectDir = join(dir, "projects", session.cwd.replace(/[:\\/]/gu, "-"));
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      ...(session.owner
        ? [
            JSON.stringify({
              type: "bridge-session",
              sessionId: session.id,
              ownerAccountUuid: session.owner,
            }),
          ]
        : []),
      JSON.stringify({
        type: "user",
        sessionId: session.id,
        cwd: session.cwd,
        timestamp: "2026-09-20T05:00:00.000Z",
        message: { role: "user", content: session.prompt },
      }),
    ];
    writeFileSync(join(projectDir, `${session.id}.jsonl`), lines.join("\n"), "utf8");
  }
  return dir;
}

/** A rollout whose `session_meta` carries exactly the fields a test needs. */
function writeRollout(
  sessionsDir: string,
  id: string,
  meta: Record<string, unknown>,
  userText: string,
): void {
  writeFileSync(
    join(sessionsDir, `rollout-${id}.jsonl`),
    [
      JSON.stringify({
        type: "session_meta",
        payload: { session_id: id, cwd: "F:\\repo", ...meta },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: userText }],
        },
      }),
    ].join("\n"),
    "utf8",
  );
}

describe("scanImportableSessions", () => {
  it("lists sessions from both providers with preview and attribution", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex:work",
        dir: codexHome([{ id: "cx-1", cwd: "F:\\repo", prompt: "fix the bug" }]),
      },
      {
        provider: "claude",
        agentKind: "claude",
        dir: claudeHome([{ id: "cl-1", cwd: "F:\\repo", prompt: "write a test" }]),
      },
    ];
    const { sessions } = scanImportableSessions({ homes });
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.provider === "codex")).toMatchObject({
      id: "codex:cx-1",
      agentKind: "codex:work",
      providerSessionId: "cx-1",
      cwd: "F:\\repo",
      preview: "fix the bug",
      // The fixture records a cwd that does not exist on this machine.
      cwdExists: false,
    });
    expect(sessions.find((s) => s.provider === "claude")).toMatchObject({
      id: "claude:cl-1",
      agentKind: "claude",
      preview: "write a test",
    });
  });

  it("filters by cwd case-insensitively and by provider", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-here", cwd: "F:\\repo", prompt: "here" },
          { id: "cx-elsewhere", cwd: "F:\\other", prompt: "elsewhere" },
        ]),
      },
      {
        provider: "claude",
        agentKind: "claude",
        dir: claudeHome([{ id: "cl-here", cwd: "F:\\repo", prompt: "claude here" }]),
      },
    ];
    // Case folding is Windows-only, so the platform is pinned rather than
    // inherited: on a Linux runner these Windows paths would not match.
    const { sessions: matching } = scanImportableSessions({
      homes,
      cwd: "f:\\REPO",
      platform: "win32",
    });
    expect(matching).toHaveLength(2);
    expect(matching.map((s) => s.providerSessionId).sort()).toEqual(["cl-here", "cx-here"]);
    expect(
      scanImportableSessions({ homes, provider: "codex" }).sessions.every(
        (s) => s.provider === "codex",
      ),
    ).toBe(true);
  });

  it("lists a Claude session under the profile whose login owns it", () => {
    const base = claudeHome([
      { id: "cl-work", cwd: "F:\\repo", prompt: "work chat", owner: "acct-work" },
      { id: "cl-mine", cwd: "F:\\repo", prompt: "my chat", owner: "acct-base" },
      { id: "cl-other", cwd: "F:\\repo", prompt: "unknown owner", owner: "acct-nobody" },
    ]);
    const { sessions } = scanImportableSessions({
      homes: [
        { provider: "claude", agentKind: "claude", dir: base, accountId: "acct-base" },
        {
          provider: "claude",
          agentKind: "claude:work",
          dir: claudeHome([]),
          accountId: "acct-work",
        },
        // A second profile on the base login must not steal the base home's own sessions.
        {
          provider: "claude",
          agentKind: "claude:mine",
          dir: claudeHome([]),
          accountId: "acct-base",
        },
      ],
    });
    const kinds = Object.fromEntries(sessions.map((s) => [s.providerSessionId, s.agentKind]));
    expect(kinds).toEqual({ "cl-work": "claude:work", "cl-mine": "claude", "cl-other": "claude" });
    // The file stays where it is; the import copies it into the profile's home.
    expect(sessions.find((s) => s.providerSessionId === "cl-work")?.path).toContain(base);
  });

  it("dedupes a session visible in two homes and skips missing directories", () => {
    const shared = codexHome([{ id: "cx-dup", cwd: "F:\\repo", prompt: "dup" }]);
    const homes: ImportHome[] = [
      { provider: "codex", agentKind: "codex", dir: shared },
      { provider: "codex", agentKind: "codex:work", dir: shared },
      { provider: "codex", agentKind: "codex:gone", dir: join(tmpdir(), "poracode-not-there") },
    ];
    expect(scanImportableSessions({ homes }).sessions).toHaveLength(1);
  });

  it("returns an empty list rather than throwing on an unreadable transcript", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-bad-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    // Content that isn't even JSON: no field regex can match anything in it,
    // so — unlike a session whose preview alone is out of reach (see the
    // "beyond the preview window" case above) — nothing was ever read out of
    // this file's head. The filename alone ("rollout-broken.jsonl") must not
    // be enough to manufacture a session out of that.
    writeFileSync(join(sessionsDir, "rollout-broken.jsonl"), "{ not json", "utf8");
    expect(
      scanImportableSessions({ homes: [{ provider: "codex", agentKind: "codex", dir }] }).sessions,
    ).toEqual([]);
  });

  it("returns an empty list for a file that is empty on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-empty-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    // Empty on disk (e.g. a crash mid-write): `readPrefix` returns "" and
    // `readHead` bails before any field regex even runs.
    writeFileSync(join(sessionsDir, "rollout-empty.jsonl"), "", "utf8");
    expect(
      scanImportableSessions({ homes: [{ provider: "codex", agentKind: "codex", dir }] }).sessions,
    ).toEqual([]);
  });

  it("hides sub-agent fan-outs and one-shot exec runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-machine-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeRollout(sessionsDir, "sub", { thread_source: "subagent" }, "spawned work");
    writeRollout(sessionsDir, "exec", { originator: "codex_exec", source: "exec" }, "title this");
    writeRollout(
      sessionsDir,
      "real",
      { originator: "Codex Desktop", source: "vscode", thread_source: "user" },
      "real words",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });
    expect(sessions.map((session) => session.providerSessionId)).toEqual(["real"]);
  });

  it("strips injected context out of the preview", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-injected-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeRollout(
      sessionsDir,
      "inj",
      {},
      "# AGENTS.md instructions\n\n<INSTRUCTIONS>rules</INSTRUCTIONS>\n\nship it",
    );

    const [session] = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    }).sessions;
    expect(session?.preview).toBe("ship it");
  });

  it("marks a session whose folder still exists", () => {
    const realFolder = mkdtempSync(join(tmpdir(), "poracode-scan-cwd-"));
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([{ id: "cx-real", cwd: realFolder, prompt: "real folder" }]),
      },
    ];
    expect(scanImportableSessions({ homes }).sessions[0]?.cwdExists).toBe(true);
  });

  it("reports every folder it saw, including folders past the page limit", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-1", cwd: "F:\\busy", prompt: "one" },
          { id: "cx-2", cwd: "F:\\busy", prompt: "two" },
          { id: "cx-3", cwd: "F:\\busy", prompt: "three" },
          { id: "cx-4", cwd: "F:\\quiet", prompt: "four" },
        ]),
      },
    ];

    const result = scanImportableSessions({ homes, limit: 2 });

    expect(result.sessions).toHaveLength(2);
    expect(result.facets.folders).toEqual(expect.arrayContaining(["F:\\busy", "F:\\quiet"]));
  });

  it("reports truncated when the page fills before the candidates run out", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-1", cwd: "F:\\repo", prompt: "one" },
          { id: "cx-2", cwd: "F:\\repo", prompt: "two" },
          { id: "cx-3", cwd: "F:\\repo", prompt: "three" },
          { id: "cx-4", cwd: "F:\\repo", prompt: "four" },
        ]),
      },
    ];

    expect(scanImportableSessions({ homes, limit: 2 }).truncated).toBe(true);
  });

  it("reports not truncated when every matching session fit on the page", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-1", cwd: "F:\\repo", prompt: "one" },
          { id: "cx-2", cwd: "F:\\repo", prompt: "two" },
        ]),
      },
    ];

    expect(scanImportableSessions({ homes, limit: 2 }).truncated).toBe(false);
  });

  it("matches the query against title and folder across every candidate, before the page is cut", () => {
    const dir = codexHome([
      { id: "cx-old", cwd: "F:\\repo", prompt: "first task" },
      { id: "cx-new", cwd: "F:\\repo", prompt: "second task" },
    ]);
    const sessionsDir = join(dir, "sessions", "2026", "09", "20");
    // The candidate pass sorts newest first; give "cx-new" the later mtime so
    // a limit of 1 would return it unless the query predicate ran first.
    utimesSync(
      join(sessionsDir, "rollout-2026-09-20T04-43-18-cx-old.jsonl"),
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-01T00:00:00.000Z"),
    );
    utimesSync(
      join(sessionsDir, "rollout-2026-09-20T04-43-18-cx-new.jsonl"),
      new Date("2026-09-20T00:00:00.000Z"),
      new Date("2026-09-20T00:00:00.000Z"),
    );
    // Only "cx-old" has a title containing "deploy"; "cx-new" does not match
    // the query on title or folder.
    const db = new Database(join(dir, "state_1.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT)");
    db.prepare("INSERT INTO threads (id, name, title) VALUES (?, ?, ?)").run(
      "cx-old",
      "Deploy the service",
      null,
    );
    db.close();

    const homes: ImportHome[] = [{ provider: "codex", agentKind: "codex", dir }];
    const result = scanImportableSessions({ homes, query: "deploy", limit: 1 });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.providerSessionId).toBe("cx-old");
  });

  it("matches the query against the folder, and keeps offering every folder while a query narrows the page", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-alpha", cwd: "F:\\alpha", prompt: "alpha task" },
          { id: "cx-beta", cwd: "F:\\beta", prompt: "beta task" },
        ]),
      },
    ];

    // Matches only via the folder path — neither session has an indexed
    // title, so this exercises the query predicate's folder branch.
    const result = scanImportableSessions({ homes, query: "alpha" });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.providerSessionId).toBe("cx-alpha");
    // The facets are computed under the *other* filters only: folding the
    // query into them would make "F:\beta" vanish from the dropdown the
    // moment the query excludes its only session, collapsing the list of
    // folders the user could pick to broaden the search.
    expect(result.facets.folders).toEqual(expect.arrayContaining(["F:\\alpha", "F:\\beta"]));
  });

  it("lists a session whose first user text is beyond the preview window", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-nopreview-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, "rollout-cx-quiet.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-quiet",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        // A turn of pure injected context: stripping leaves nothing.
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "<recommended_plugins>catalogue</recommended_plugins>" },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions.map((s) => s.providerSessionId)).toEqual(["cx-quiet"]);
    expect(sessions[0]?.preview).toBe("");
  });

  it("checks a folder once however many sessions share it", () => {
    const calls: string[] = [];
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-1", cwd: "F:\\repo", prompt: "one" },
          { id: "cx-2", cwd: "F:\\repo", prompt: "two" },
          { id: "cx-3", cwd: "F:\\other", prompt: "three" },
        ]),
      },
    ];

    scanImportableSessions({
      homes,
      exists: (path) => {
        calls.push(path);
        return true;
      },
    });

    expect(calls.toSorted()).toEqual(["F:\\other", "F:\\repo"]);
  });

  // Companion assertion, not the regression guard: this fixture passes even
  // without the Task 4 fix, because `JSON.stringify` escapes the quotes
  // inside `content[].text`, so a pasted `"cwd"` can never appear unescaped
  // in the file and a plain regex can't match it either way. It's kept as a
  // pinned, brief-specified case. The test below ("claude: a non-conversation
  // record's cwd must not win by appearing first") is the one that actually
  // fails before the fix and passes after — that's the real regression guard
  // for this task.
  it("ignores a cwd pasted inside a user message", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-paste-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, "rollout-cx-paste.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-paste",
            cwd: "F:\\real",
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: '{"cwd":"F:\\\\pasted"}' }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions[0]?.cwd).toBe("F:\\real");
  });

  // The Codex fixture above can only pass "by luck" of session_meta being
  // first in the file: any regex over the concatenated head text will hit
  // session_meta's own (unescaped, top-level) cwd before anything nested
  // inside a later message's escaped string content. Claude's format makes
  // the same bug directly reachable, because every record — not just the
  // conversational ones — carries cwd as a plain top-level field: a
  // `file-history-snapshot` (or any record type outside the allowed set)
  // that happens to come first must not be allowed to win over the real
  // `user` record's cwd purely because it appears earlier in the file.
  it("claude: a non-conversation record's cwd must not win by appearing first", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-claude-paste-"));
    const projectDir = join(dir, "projects", "F--real");
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      JSON.stringify({
        type: "file-history-snapshot",
        sessionId: "cl-paste",
        cwd: "F:\\pasted",
        timestamp: "2026-09-20T04:00:00.000Z",
      }),
      JSON.stringify({
        type: "user",
        sessionId: "cl-paste",
        cwd: "F:\\real",
        timestamp: "2026-09-20T05:00:00.000Z",
        message: { role: "user", content: "hello" },
      }),
    ];
    writeFileSync(join(projectDir, "cl-paste.jsonl"), lines.join("\n"), "utf8");

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "claude", agentKind: "claude", dir }],
    });

    expect(sessions[0]?.cwd).toBe("F:\\real");
  });

  it("picks up a Codex thread renamed between scans", () => {
    const dir = codexHome([{ id: "cx-named", cwd: "F:\\repo", prompt: "hello" }]);
    const homes: ImportHome[] = [{ provider: "codex", agentKind: "codex", dir }];
    const stateFile = join(dir, "state_1.sqlite");
    const db = new Database(stateFile);
    db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT)");
    db.prepare("INSERT INTO threads (id, name, title) VALUES (?, ?, ?)").run(
      "cx-named",
      "First name",
      null,
    );
    db.close();

    expect(scanImportableSessions({ homes }).sessions[0]?.title).toBe("First name");

    const renamer = new Database(stateFile);
    renamer.prepare("UPDATE threads SET name = ? WHERE id = ?").run("Renamed", "cx-named");
    renamer.close();

    // A Codex title lives in `state_<n>.sqlite`, which the transcript's own
    // mtime knows nothing about — memoising it under that mtime would pin
    // the old name for the life of the main process. It buys nothing either:
    // `readCodexTitles` is already one map per home per scan.
    expect(scanImportableSessions({ homes }).sessions[0]?.title).toBe("Renamed");
  });

  // Codex's `session_meta` never carries the model — it lives on `turn_context`
  // records, which the candidate pass's head read already holds. Reading it
  // from there (rather than `session_meta`) is what lets an imported thread
  // open on the model the conversation actually used.
  it("reads the model off a Codex session's turn_context record", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-codex-model-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, "rollout-cx-model.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-model",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        JSON.stringify({
          type: "turn_context",
          payload: { cwd: "F:\\repo", model: "gpt-6-astra" },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hello" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions[0]?.model).toBe("gpt-6-astra");
  });

  // Old code only ever scanned lines whose `type` (found by first-match
  // regex) was `turn_context` — `session_meta`'s own `model` field was never
  // looked at, even though a real rollout can carry it there too.
  it("reads the model off a Codex session's session_meta record", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-codex-metamodel-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, "rollout-cx-metamodel.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-metamodel",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
            model: "gpt-meta",
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hello" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions[0]?.model).toBe("gpt-meta");
  });

  // Real rollouts also carry the model on an `event_msg` whose
  // `payload.type` is `thread_settings_applied`, nested under
  // `payload.thread_settings.model` — a record type old code never looked at.
  it("reads the model off a Codex event_msg with payload.type thread_settings_applied", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-codex-settingsmodel-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, "rollout-cx-settingsmodel.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-settingsmodel",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "thread_settings_applied",
            thread_settings: { model: "gpt-settings" },
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hello" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions[0]?.model).toBe("gpt-settings");
  });

  // Claude has no meta line either — the model rides `message.model` on
  // `assistant` records only, the same record type the parser already trusts
  // for other fields (Task 4). A `user` record's own text can't fool this: it
  // is read from the same line, but only after that line's `type` is
  // confirmed to be `assistant`.
  it("reads the model off a Claude session's first assistant record", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-claude-model-"));
    const projectDir = join(dir, "projects", "F--repo");
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "cl-model",
        cwd: "F:\\repo",
        timestamp: "2026-09-20T05:00:00.000Z",
        message: { role: "user", content: "hello" },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "cl-model",
        cwd: "F:\\repo",
        timestamp: "2026-09-20T05:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-5",
          content: [{ type: "text", text: "hi" }],
        },
      }),
    ];
    writeFileSync(join(projectDir, "cl-model.jsonl"), lines.join("\n"), "utf8");

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "claude", agentKind: "claude", dir }],
    });

    expect(sessions[0]?.model).toBe("claude-opus-5");
  });

  // Regression guard: an assistant record's `content` can carry a tool call
  // whose arguments are real, unescaped JSON — here a completion tool called
  // with a `model` argument, which is ordinary traffic in this app (Claude
  // answering a question that involves an API config). A bare regex over the
  // whole line would match that argument instead of the record's own,
  // absent, `message.model` — the model must be read from the message
  // object's own keys, not wherever `"model"` happens to appear on the line.
  it("does not mistake a model-shaped tool call argument in content for the session's model", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-claude-toolcall-"));
    const projectDir = join(dir, "projects", "F--repo");
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "cl-toolcall",
        cwd: "F:\\repo",
        timestamp: "2026-09-20T05:00:00.000Z",
        message: { role: "user", content: "call the completion tool" },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "cl-toolcall",
        cwd: "F:\\repo",
        timestamp: "2026-09-20T05:00:01.000Z",
        message: {
          role: "assistant",
          // No `model` field on the message itself.
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "create_completion",
              input: { model: "gpt-4o", prompt: "hello" },
            },
          ],
        },
      }),
    ];
    writeFileSync(join(projectDir, "cl-toolcall.jsonl"), lines.join("\n"), "utf8");

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "claude", agentKind: "claude", dir }],
    });

    expect(sessions[0]).not.toHaveProperty("model");
  });

  // The regression guard for this task. Real Claude records order their keys
  // `parentUuid, isSidechain, message, …, type, uuid, timestamp, …` — the
  // `message` object comes *before* the record's own `type`, and `message`
  // itself carries a `"type":"message"` field. A regex hunting the line for
  // the first `"type"` anywhere finds `message.type` ("message") instead of
  // the record's own `type` ("assistant"), which isn't in
  // `CLAUDE_METADATA_RECORD_TYPES` — so the whole line, including
  // `message.model`, was silently skipped. Structural access reads the
  // record's own `type` key directly, so key order can't fool it.
  it("reads the model off a Claude assistant record ordered the way the real CLI orders it", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-claude-realorder-"));
    const projectDir = join(dir, "projects", "F--repo");
    mkdirSync(projectDir, { recursive: true });
    const lines = [
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        message: { role: "user", content: "hello" },
        type: "user",
        uuid: "u-0",
        timestamp: "2026-09-20T05:00:00.000Z",
        sessionId: "cl-realorder",
        cwd: "F:\\repo",
      }),
      JSON.stringify({
        parentUuid: "u-0",
        isSidechain: false,
        message: {
          id: "msg_01",
          type: "message",
          role: "assistant",
          model: "claude-opus-5",
          content: [{ type: "text", text: "hi" }],
        },
        type: "assistant",
        uuid: "u-1",
        timestamp: "2026-09-20T05:00:01.000Z",
        sessionId: "cl-realorder",
        cwd: "F:\\repo",
      }),
    ];
    writeFileSync(join(projectDir, "cl-realorder.jsonl"), lines.join("\n"), "utf8");

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "claude", agentKind: "claude", dir }],
    });

    expect(sessions[0]?.model).toBe("claude-opus-5");
  });

  it("leaves model absent, not an empty string, when the head carries none", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([{ id: "cx-nomodel", cwd: "F:\\repo", prompt: "hi" }]),
      },
    ];

    const { sessions } = scanImportableSessions({ homes });

    expect(sessions[0]).not.toHaveProperty("model");
  });

  it("reads a preview whose first user turn sits past the head chunk", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-deep-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    // A real `session_meta` carries the whole system prompt; 200 KB of it
    // pushes the first user turn past the 128 KB head chunk the candidate
    // pass reads, so the preview can only come from a deeper read.
    writeFileSync(
      join(sessionsDir, "rollout-cx-deep.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-deep",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
            instructions: "p".repeat(200 * 1024),
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "buried but real" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions.map((s) => s.providerSessionId)).toEqual(["cx-deep"]);
    expect(sessions[0]?.preview).toBe("buried but real");
  });

  it("rescans to the same result, and re-reads a transcript that changed", () => {
    const dir = codexHome([{ id: "cx-1", cwd: "F:\\repo", prompt: "first prompt" }]);
    const homes: ImportHome[] = [{ provider: "codex", agentKind: "codex", dir }];
    const file = join(
      dir,
      "sessions",
      "2026",
      "09",
      "20",
      "rollout-2026-09-20T04-43-18-cx-1.jsonl",
    );

    const first = scanImportableSessions({ homes });
    const second = scanImportableSessions({ homes });
    // Anything memoised between scans has to be invisible: same sessions,
    // same previews, same titles as the scan that paid to read them.
    expect(second).toEqual(first);
    expect(second.sessions[0]?.preview).toBe("first prompt");

    writeFileSync(
      file,
      [
        JSON.stringify({
          type: "session_meta",
          payload: { session_id: "cx-1", cwd: "F:\\repo", timestamp: "2026-09-20T04:43:18.000Z" },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "rewritten prompt" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    // A rewritten transcript is a new `mtimeMs`, so nothing cached under the
    // old one can serve it — a stale preview here would outlive the process.
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);

    expect(scanImportableSessions({ homes }).sessions[0]?.preview).toBe("rewritten prompt");
  });

  it("re-reads a transcript rewritten within the same mtime tick", () => {
    const dir = codexHome([{ id: "cx-tick", cwd: "F:\\repo", prompt: "first prompt" }]);
    const homes: ImportHome[] = [{ provider: "codex", agentKind: "codex", dir }];
    const file = join(
      dir,
      "sessions",
      "2026",
      "09",
      "20",
      "rollout-2026-09-20T04-43-18-cx-tick.jsonl",
    );

    // A whole-millisecond stamp, set before *and* after the rewrite, so both
    // scans genuinely read the same `mtimeMs`. (Restoring a `statSync` result
    // would not: `mtimeMs` can be fractional and a `Date` truncates it, which
    // silently changes the key and hides what this test is for.)
    const pinned = new Date("2026-09-20T04:43:18.000Z");
    utimesSync(file, pinned, pinned);
    expect(statSync(file).mtimeMs).toBe(pinned.getTime());

    expect(scanImportableSessions({ homes }).sessions[0]?.preview).toBe("first prompt");

    writeFileSync(
      file,
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-tick",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "a rather longer second prompt entirely" }],
          },
        }),
      ].join("\n"),
      "utf8",
    );
    // Back to the same tick: a filesystem with a coarse mtime can genuinely
    // report one for two writes this close together, and a key of path and
    // mtime alone would then go on serving the old bytes.
    utimesSync(file, pinned, pinned);
    expect(statSync(file).mtimeMs).toBe(pinned.getTime());

    expect(scanImportableSessions({ homes }).sessions[0]?.preview).toBe(
      "a rather longer second prompt entirely",
    );
  });

  it("compares folders case-insensitively on win32 and case-sensitively elsewhere", () => {
    const homes: ImportHome[] = [
      {
        provider: "codex",
        agentKind: "codex",
        dir: codexHome([
          { id: "cx-upper", cwd: "/home/u/Repo", prompt: "upper" },
          { id: "cx-lower", cwd: "/home/u/repo", prompt: "lower" },
        ]),
      },
    ];

    const onWindows = scanImportableSessions({ homes, cwd: "/home/u/repo", platform: "win32" });
    expect(onWindows.sessions.map((s) => s.providerSessionId).sort()).toEqual([
      "cx-lower",
      "cx-upper",
    ]);

    const onLinux = scanImportableSessions({ homes, cwd: "/home/u/repo", platform: "linux" });
    expect(onLinux.sessions.map((s) => s.providerSessionId)).toEqual(["cx-lower"]);
  });

  it("degrades to undefined, not a partial match, when a field is cut off mid-value", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-cut-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    // session_id is complete and unescaped before the cut; cwd's value never
    // reaches a closing quote — simulating a head chunk that sliced through
    // session_meta mid-field. rawField requires a closing quote, so cwd must
    // come back undefined rather than matching a prefix of the file path.
    writeFileSync(
      join(sessionsDir, "rollout-cx-cut.jsonl"),
      '{"type":"session_meta","payload":{"session_id":"cx-cut","cwd":"F:\\\\re',
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions.map((s) => s.providerSessionId)).toEqual(["cx-cut"]);
    expect(sessions[0]?.cwd).toBeUndefined();
  });

  it("keeps fields from complete head lines when only the last line is cut mid-value", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-scan-headcut-"));
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    // The first line is complete, valid JSON and yields a real cwd. The
    // second (final) line's own `type` is complete but its `model` value
    // never reaches a closing quote — as if the head chunk had sliced
    // through a `turn_context` record mid-field. The complete line's fields
    // must survive; the cut line must not contribute a partial model.
    writeFileSync(
      join(sessionsDir, "rollout-cx-headcut.jsonl"),
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            session_id: "cx-headcut",
            cwd: "F:\\repo",
            timestamp: "2026-09-20T04:43:18.000Z",
          },
        }),
        '{"type":"turn_context","payload":{"cwd":"F:\\\\repo","model":"gpt-cut',
      ].join("\n"),
      "utf8",
    );

    const { sessions } = scanImportableSessions({
      homes: [{ provider: "codex", agentKind: "codex", dir }],
    });

    expect(sessions.map((s) => s.providerSessionId)).toEqual(["cx-headcut"]);
    expect(sessions[0]?.cwd).toBe("F:\\repo");
    expect(sessions[0]).not.toHaveProperty("model");
  });
});
