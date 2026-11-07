import { expect, test } from "bun:test";
import * as S from "./test-support";

test("background tasks surface as shells: seed, live replace, list/get/output/remove", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const tasks = [
    {
      taskId: "task-1",
      kind: "command",
      description: "npm run watch",
      startedAt: 1700000000000,
      progress: "line one\nline two\n",
    },
    {
      taskId: "task-2",
      kind: "other",
      description: "watcher",
      startedAt: 1700000000001,
      stopAction: { id: "task.stop", payload: { taskId: "task-2" } },
    },
  ];
  const client = S.promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      if (name === "readThreadBackgroundTasks") return { tasks };
      return null;
    },
  });
  const { value } = S.router(client);
  // Seed on session load.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  expect(calls).toContainEqual({
    name: "readThreadBackgroundTasks",
    payload: { threadId: "thread-1" },
  });

  const listed = await value.handle(new Request("http://poracode.invalid/api/shell"));
  expect(listed.status).toBe(200);
  const listBody = (await listed.json()) as {
    data: { id: string; status: string; command: string }[];
  };
  expect(listBody.data).toHaveLength(2);
  expect(listBody.data[0]).toMatchObject({
    id: "sh_bgt_thread-1__task-1",
    status: "running",
    command: "npm run watch",
  });

  const got = await value.handle(
    new Request("http://poracode.invalid/api/shell/sh_bgt_thread-1__task-1"),
  );
  expect(got.status).toBe(200);

  // Output pages byte-wise over the last progress snapshot.
  const page1 = await value.handle(
    new Request(
      "http://poracode.invalid/api/shell/sh_bgt_thread-1__task-1/output?cursor=0&limit=5",
    ),
  );
  const first = (await page1.json()) as {
    data: { output: string; cursor: number; truncated: boolean };
  };
  expect(first.data).toMatchObject({ output: "line ", cursor: 5, truncated: true });
  const page2 = await value.handle(
    new Request(
      `http://poracode.invalid/api/shell/sh_bgt_thread-1__task-1/output?cursor=${first.data.cursor}&limit=100`,
    ),
  );
  const second = (await page2.json()) as { data: { output: string; truncated: boolean } };
  expect(second.data).toMatchObject({ output: "one\nline two\n", truncated: false });

  // Live replace emits created for new ids and deleted for vanished ones.
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  await reader.read(); // server.connected
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "background_tasks.changed",
      threadId: "thread-1",
      tasks: [
        {
          taskId: "task-3",
          kind: "command",
          description: "new watcher",
          startedAt: 1700000000002,
        },
      ],
    },
  });
  const events: { type: string }[] = [];
  const decoder = new TextDecoder();
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline && events.length < 3) {
    const chunk = await reader.read();
    if (chunk.done) break;
    for (const line of decoder.decode(chunk.value).matchAll(/^data: (.+)$/gmu))
      events.push(JSON.parse(line[1]!));
  }
  const types = events.map((entry) => entry.type);
  expect(types).toContain("shell.created");
  expect(types).toContain("shell.deleted");

  // remove: stopAction → invokeThreadSessionAction; absent → 409.
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/shell/sh_bgt_thread-1__task-3", {
          method: "DELETE",
        }),
      )
    ).status,
  ).toBe(409);
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "background_tasks.changed",
      threadId: "thread-1",
      tasks,
    },
  });
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/shell/sh_bgt_thread-1__task-2", {
          method: "DELETE",
        }),
      )
    ).status,
  ).toBe(204);
  expect(calls).toContainEqual({
    name: "invokeThreadSessionAction",
    payload: { threadId: "thread-1", actionId: "task.stop", payload: { taskId: "task-2" } },
  });

  // create is unsupported.
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/shell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "ls" }),
        }),
      )
    ).status,
  ).toBe(501);
});

test("session.shell runs a host dev shell and stashes output for the next prompt", async () => {
  const shells: string[] = [];
  const writes: string[] = [];
  const watches = new Map<string, (data: string) => void>();
  let sent: { prompt: string; segments: unknown } | undefined;
  const client = S.promptClient({
    startShell: async (input: { shellId: string }) => {
      shells.push(input.shellId);
    },
    writeTerminal: async (input: { threadId: string; data: string }) => {
      writes.push(input.data);
    },
    closeShell: async () => {},
    sendThreadInput: async (input: { prompt: string; segments?: unknown }) => {
      sent = { prompt: input.prompt, segments: input.segments };
      return {};
    },
  });
  const { value } = S.router(client, S.bootstrap.home, () => undefined, S.bootstrap.directory, {
    watchTerminal: (id: string, onOutput: (data: string) => void) => {
      watches.set(id, onOutput);
    },
    unwatchTerminal: (id: string) => {
      watches.delete(id);
    },
  });
  const pending = value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "ls -la" }),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  const shellId = shells[0]!;
  expect(writes).toEqual(["ls -la\r", "exit\r"]);
  // Feed terminal-output frames for the shell, then its exit event.
  watches.get(shellId)?.("file1\nfile2\n");
  watches.get(shellId)?.("done\n");
  value.handleRemoteEvent({ type: "thread-exited", threadId: shellId });
  const response = await pending;
  expect(response.status).toBe(204);

  // The next real prompt carries the stashed output once.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "continue" }),
    }),
  );
  expect(sent!.prompt).toContain("Shell output the user ran before this message:");
  expect(sent!.prompt).toContain("$ ls -la");
  expect(sent!.prompt).toContain("done");
  sent = undefined;
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "again" }),
    }),
  );
  expect(sent!.prompt).not.toContain("Shell output");
});

test("session.shell refuses while launching and on virtual subsessions", async () => {
  const client = S.promptClient({ startShell: async () => {} });
  const { value } = S.router(client);
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "launching" });
  const busy = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "ls" }),
    }),
  );
  expect(busy.status).toBe(409);
  const missing = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "ls" }),
    }),
  );
  expect(missing.status).toBe(404);
});
