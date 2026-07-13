#!/usr/bin/env node
// Seeds the Poracode app DB with a believable multi-agent transcript so the
// REAL renderer (real ChatPane components) can be screenshot for marketing.
// Run AFTER one normal app boot has created + migrated the schema, then boot
// again to render. Usage:
//   node --no-warnings branding/mocks/seed-poracode-marketing.mjs --baseDir <dir> --projectPath <dir>
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
function openDatabase(filename) {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(filename);
    return { exec: (s) => db.exec(s), prepare: (s) => db.prepare(s), close: () => db.close() };
  } catch (error) {
    if (error.code !== "ERR_UNKNOWN_BUILTIN_MODULE") throw error;
    const Database = require("better-sqlite3");
    const db = new Database(filename);
    return { exec: (s) => db.exec(s), prepare: (s) => db.prepare(s), close: () => db.close() };
  }
}

const args = process.argv.slice(2);
const readArg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const baseDir = readArg("baseDir") ?? process.env.PORACODE_BASE_DIR;
const projectPath = readArg("projectPath") ?? "/Users/dev/work/acme-web";
if (!baseDir) throw new Error("--baseDir required");
const dbPath = path.join(path.resolve(baseDir), "state.sqlite");
const now = "2026-06-28T10:00:00.000Z";
const later = "2026-06-28T10:06:00.000Z";

const PROJECT = { id: "p-acme", name: "acme-web" };

// A git worktree shared by two threads → renders a worktree group in the sidebar.
const WT_PATH = "/Users/dev/work/acme-web/.poracode/worktrees/feat-billing";
const WT_BRANCH = "feat/billing-portal";

// presentation_mode MUST be "gui" — terminal panes need a live PTY.
// NOTE: `sessionRef` is OFF by default. A sessionRef on a VISIBLE gui thread makes
// the app attempt a GUI reconnect on boot → "requires a valid session ID" toast →
// it falls back to the home draft and overwrites app_state.view. Only enable it
// (add `sessionRef: { providerSessionId: "sess_x", discoveredAt: now }` to a
// NON-visible thread) when capturing "Continue in another provider", then dismiss
// the toast / element-shot the dialog.
const THREADS = [
  {
    id: "t-claude",
    title: "feat/auth-refactor",
    agent: "claude",
    model: "claude-opus-4-8",
    status: "idle",
    attention: "none",
    sort: 0,
  },
  {
    id: "t-codex",
    title: "fix/race-condition",
    agent: "codex",
    model: "gpt-5",
    status: "idle",
    attention: "none",
    sort: 1,
  },
  {
    id: "t-gemini",
    title: "perf/query-batching",
    agent: "gemini",
    model: "gemini-2.5-pro",
    status: "idle",
    attention: "none",
    sort: 2,
  },
  {
    id: "t-claude2",
    title: "docs/api-reference",
    agent: "claude",
    model: "claude-opus-4-8",
    status: "finished",
    attention: "none",
    done: 1,
    sort: 3,
  },
  {
    id: "t-codex2",
    title: "chore/bump-deps",
    agent: "codex",
    model: "gpt-5",
    status: "idle",
    attention: "none",
    sort: 4,
  },
  // Two threads in the same git worktree → a worktree group in the sidebar.
  {
    id: "t-wt1",
    title: "feat: billing portal",
    agent: "claude",
    model: "claude-opus-4-8",
    status: "idle",
    attention: "none",
    sort: 5,
    worktreePath: WT_PATH,
    worktreeBranch: WT_BRANCH,
    prNumber: 482,
  },
  {
    id: "t-wt2",
    title: "feat: stripe webhooks",
    agent: "codex",
    model: "gpt-5",
    status: "idle",
    attention: "none",
    sort: 6,
    worktreePath: WT_PATH,
    worktreeBranch: WT_BRANCH,
  },
];

const msg = (text) => JSON.stringify({ content: [{ kind: "text", text }] });
const tool = (p) => JSON.stringify(p);

// Project notes — the editor is TipTap/StarterKit, so `doc` is ProseMirror JSON
// (stored as a JSON string in project_notes.doc; dbGetProjectNotes parses it).
const NOTES_DOC = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "acme-web — working notes" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Refresh-token rotation is landing behind " },
        { type: "text", marks: [{ type: "code" }], text: "auth.refreshRotation" },
        {
          type: "text",
          text: " (default off). Flip it on staging once the suite is green for a full day.",
        },
      ],
    },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Conventions" }] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Every provider is a self-contained plugin — no provider if/else in shared code.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Worktrees live under .poracode/worktrees — one branch per worktree.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Run pnpm test auth before any auth-flow review." }],
            },
          ],
        },
      ],
    },
  ],
};
const NOTES_TODOS = [
  { id: "n1", text: "Gate refresh rotation on staging", done: true, createdAt: now },
  {
    id: "n2",
    text: "Add 1000-drain regression test for the worker pool",
    done: true,
    createdAt: now,
  },
  {
    id: "n3",
    text: "Batch the dashboard N+1 queries on the endpoint",
    done: false,
    createdAt: now,
  },
  { id: "n4", text: "Document the ACP registry onboarding flow", done: false, createdAt: now },
];

// item: [type, payloadJSON]
const ITEMS = {
  "t-claude": [
    [
      "user_message",
      msg("Refactor the auth flow to use refresh tokens and rotate them on each exchange."),
    ],
    [
      "reasoning",
      tool({
        summary:
          "Rotating on every use limits the blast radius if a token leaks. I'll add a refresh-token store, swap the middleware over, then cover it with tests.",
        durationMs: 4200,
      }),
    ],
    [
      "assistant_message",
      msg(
        "Good call — rotating on every use limits the blast radius if a token leaks. Let me read the current session module, then add a refresh-token store.",
      ),
    ],
    [
      "tool_call",
      tool({
        name: "Read",
        title: "src/auth/session.ts",
        kind: "read",
        status: "success",
        args: { path: "src/auth/session.ts" },
      }),
    ],
    [
      "plan",
      tool({
        steps: [
          { step: "Read the existing session module", status: "completed" },
          { step: "Add a refresh-token store with rotation", status: "completed" },
          { step: "Swap the middleware over", status: "in_progress" },
          { step: "Add regression tests", status: "pending" },
        ],
      }),
    ],
    [
      "file_change",
      tool({
        path: "src/auth/refresh.ts",
        changeKind: "create",
        diffSummary: { added: 96, removed: 0 },
        status: "success",
      }),
    ],
    [
      "file_change",
      tool({
        path: "src/auth/session.ts",
        changeKind: "edit",
        diffSummary: { added: 48, removed: 12 },
        status: "success",
      }),
    ],
    [
      "tool_call",
      tool({
        name: "Edit",
        title: "src/auth/middleware.ts",
        kind: "edit",
        status: "success",
        args: { path: "src/auth/middleware.ts" },
      }),
    ],
    [
      "command_execution",
      tool({ command: "pnpm test auth", exitCode: 0, durationMs: 5400, status: "success" }),
    ],
    [
      "assistant_message",
      msg(
        "Tests pass. Each exchange now mints a new refresh token and revokes the prior one, so a leaked token is single-use.",
      ),
    ],
    [
      "question_answer",
      tool({
        questions: [
          {
            header: "Rollout",
            question: "Put the middleware swap behind a feature flag?",
            selected: [
              { label: "Yes — gate it", description: "Safer staged rollout on staging first" },
            ],
          },
        ],
      }),
    ],
    [
      "assistant_message",
      msg(
        "Gating the swap behind `auth.refreshRotation` (default off) and wiring the flag check into the middleware.",
      ),
    ],
    [
      "file_change",
      tool({
        path: "src/config/flags.ts",
        changeKind: "edit",
        diffSummary: { added: 6, removed: 0 },
        status: "success",
      }),
    ],
    [
      "command_execution",
      tool({
        command: "git commit -m 'auth: rotate refresh tokens on each exchange'",
        exitCode: 0,
        durationMs: 900,
        status: "success",
      }),
    ],
    [
      "assistant_message",
      msg(
        "Done — committed as `a1b2c3d`. 142 auth tests green and the change is flag-gated, so it's safe to ship. Ready for review.",
      ),
    ],
  ],
  "t-codex": [
    [
      "user_message",
      msg("There's an intermittent race in the worker pool under load. Track it down and fix it."),
    ],
    [
      "assistant_message",
      msg(
        "I'll reproduce it under concurrency first, then inspect the scheduler. Reading the pool implementation.",
      ),
    ],
    [
      "tool_call",
      tool({
        name: "Read",
        title: "src/workers/pool.ts",
        kind: "read",
        status: "success",
        args: { path: "src/workers/pool.ts" },
      }),
    ],
    [
      "tool_call",
      tool({
        name: "Grep",
        title: '"await queue" in src/workers',
        kind: "search",
        status: "success",
        result: "3 matches",
      }),
    ],
    [
      "command_execution",
      tool({
        command: "node stress/pool.mjs --runs 500",
        exitCode: 1,
        durationMs: 8200,
        status: "error",
      }),
    ],
    [
      "assistant_message",
      msg(
        "Reproduced — 3/500 runs fail. The drain doesn't await `flush()`, so a second task can start before the queue settles.",
      ),
    ],
    [
      "file_change",
      tool({
        path: "src/workers/pool.ts",
        changeKind: "edit",
        diffSummary: { added: 8, removed: 3 },
        status: "success",
      }),
    ],
    [
      "command_execution",
      tool({
        command: "node stress/pool.mjs --runs 500",
        exitCode: 0,
        durationMs: 7600,
        status: "success",
      }),
    ],
    [
      "assistant_message",
      msg("Fixed. Patched the drain to await `flush()` and added a guard; 0/500 failures now."),
    ],
    ["user_message", msg("Add a regression test so it can't come back.")],
    [
      "file_change",
      tool({
        path: "stress/pool.race.test.ts",
        changeKind: "create",
        diffSummary: { added: 34, removed: 0 },
        status: "success",
      }),
    ],
    [
      "command_execution",
      tool({ command: "pnpm test pool", exitCode: 0, durationMs: 6100, status: "success" }),
    ],
    [
      "assistant_message",
      msg(
        "Added `pool.race.test.ts` — 1000 concurrent drains asserting no overlap. Green, 1000/1000. The race is gone.",
      ),
    ],
  ],
  "t-gemini": [
    ["user_message", msg("Batch the N+1 queries on the dashboard endpoint.")],
    [
      "assistant_message",
      msg(
        "Profiling the endpoint — the per-row lookups can collapse into a single windowed query. Drafting the change now.",
      ),
    ],
    [
      "tool_call",
      tool({
        name: "Read",
        title: "src/api/dashboard.ts",
        kind: "read",
        status: "success",
        args: { path: "src/api/dashboard.ts" },
      }),
    ],
    [
      "file_change",
      tool({
        path: "src/api/dashboard.ts",
        changeKind: "edit",
        diffSummary: { added: 22, removed: 31 },
        status: "success",
      }),
    ],
    [
      "assistant_message",
      msg(
        "Collapsed 14 per-row queries into one windowed query. p95 on the endpoint drops from 240ms to 38ms locally.",
      ),
    ],
  ],
  "t-wt1": [
    [
      "user_message",
      msg("Scaffold the billing portal page and wire it to the Stripe customer session."),
    ],
    [
      "assistant_message",
      msg(
        "Working in the `feat/billing-portal` worktree. Adding the portal route and a server action that opens a Stripe billing session.",
      ),
    ],
    [
      "file_change",
      tool({
        path: "src/app/billing/page.tsx",
        changeKind: "create",
        diffSummary: { added: 64, removed: 0 },
        status: "success",
      }),
    ],
    [
      "command_execution",
      tool({ command: "pnpm test billing", exitCode: 0, durationMs: 4300, status: "success" }),
    ],
    [
      "assistant_message",
      msg(
        "Portal renders and the session round-trips. Pushed to `feat/billing-portal` — opened PR #482 for review.",
      ),
    ],
  ],
  "t-wt2": [
    ["user_message", msg("Verify the Stripe webhooks against the new billing session.")],
    [
      "assistant_message",
      msg("Same worktree, separate thread. Replaying the webhook fixtures now."),
    ],
    [
      "command_execution",
      tool({
        command: "node scripts/replay-webhooks.mjs",
        exitCode: 0,
        durationMs: 2600,
        status: "success",
      }),
    ],
    [
      "assistant_message",
      msg(
        "All 9 webhook events reconcile against the billing session. Ready to fold into PR #482.",
      ),
    ],
  ],
};

const db = openDatabase(dbPath);
try {
  db.exec("PRAGMA foreign_keys = ON");
  const insProject = db.prepare(
    `INSERT INTO projects (id,name,location_kind,location_path,disabled,sort_order,created_at)
     VALUES (@id,@name,'posix',@path,0,0,@now)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, location_path=excluded.location_path, disabled=0`,
  );
  const insThread = db.prepare(
    `INSERT INTO threads (id,project_id,title,agent_kind,config,status,attention,can_resume_with_config,session_ref,worktree_path,worktree_branch,pr_number,presentation_mode,archived,done,sort_order,created_at,updated_at)
     VALUES (@id,@pid,@title,@agent,@config,@status,@attention,@canResume,@sessionRef,@worktreePath,@worktreeBranch,@prNumber,'gui',0,@done,@sort,@now,@later)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, agent_kind=excluded.agent_kind, config=excluded.config,
       status=excluded.status, attention=excluded.attention, can_resume_with_config=excluded.can_resume_with_config,
       session_ref=excluded.session_ref, worktree_path=excluded.worktree_path, worktree_branch=excluded.worktree_branch,
       pr_number=excluded.pr_number, presentation_mode='gui', done=excluded.done, sort_order=excluded.sort_order`,
  );
  const insNotes = db.prepare(
    `INSERT INTO project_notes (project_id,doc,todos,updated_at) VALUES (@pid,@doc,@todos,@now)
     ON CONFLICT(project_id) DO UPDATE SET doc=excluded.doc, todos=excluded.todos, updated_at=excluded.updated_at`,
  );
  const insItem = db.prepare(
    `INSERT INTO thread_runtime_items (thread_id,item_id,position,type,state,payload,streams)
     VALUES (@tid,@iid,@pos,@type,'completed',@payload,'{}')
     ON CONFLICT(thread_id,item_id) DO UPDATE SET position=excluded.position, type=excluded.type, payload=excluded.payload`,
  );
  const setState = db.prepare(
    `INSERT INTO app_state (key,value) VALUES (@key,@value)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  );

  db.exec("BEGIN");
  // Clean slate: drop any stale threads (and their items, sessions) accumulated
  // by earlier boots, so the app never tries to resume a dead runtime.
  db.exec("DELETE FROM thread_runtime_items; DELETE FROM threads;");
  insProject.run({ id: PROJECT.id, name: PROJECT.name, path: projectPath, now });
  for (const t of THREADS) {
    insThread.run({
      id: t.id,
      pid: PROJECT.id,
      title: t.title,
      agent: t.agent,
      config: JSON.stringify({ model: t.model }),
      status: t.status,
      attention: t.attention,
      canResume: t.sessionRef ? 1 : 0,
      sessionRef: t.sessionRef ? JSON.stringify(t.sessionRef) : null,
      worktreePath: t.worktreePath ?? null,
      worktreeBranch: t.worktreeBranch ?? null,
      prNumber: t.prNumber ?? null,
      done: t.done ?? 0,
      sort: t.sort,
      now,
      later,
    });
    const items = ITEMS[t.id] ?? [];
    items.forEach(([type, payload], pos) => {
      insItem.run({ tid: t.id, iid: `${t.id}-i${pos}`, pos, type, payload });
    });
  }
  // Project notes (doc + todos) for the Notes panel.
  insNotes.run({
    pid: PROJECT.id,
    doc: JSON.stringify(NOTES_DOC),
    todos: JSON.stringify(NOTES_TODOS),
    now,
  });
  // Open Claude + Codex side by side.
  setState.run({
    key: "view",
    value: JSON.stringify({ kind: "thread", panes: ["t-claude", "t-codex"] }),
  });
  db.exec("COMMIT");
  console.log(JSON.stringify({ ok: true, dbPath, threads: THREADS.length }, null, 2));
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
