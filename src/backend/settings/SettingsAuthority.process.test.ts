import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface FixtureMessage {
  type: string;
  stage?: string;
  cachedTheme?: string;
  theme?: string;
  result?: { status: string };
  message?: string;
  reported?: string[];
}

describe("settings commit process boundaries", () => {
  let root: string;
  const children: ChildProcess[] = [];
  const original = '{"themeMode":"dark","futureField":{"retain":true}}\n';
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "settings-process-"));
    await writeFile(join(root, "settings.json"), original);
  });
  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  function launch(mode: string) {
    const child = fork(
      resolve("src/backend/settings/SettingsAuthority.processFixture.ts"),
      [root, mode],
      {
        execArgv: [
          "--experimental-transform-types",
          "--disable-warning=ExperimentalWarning",
          "--import",
          resolve("scripts/remote-v3-ts-register.mjs"),
        ],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    children.push(child);
    const messages: FixtureMessage[] = [];
    let stderr = "";
    child.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("message", (message) => messages.push(message as FixtureMessage));
    const completion = once(child, "exit");
    function next(type: string): Promise<FixtureMessage> {
      const existing = messages.find((message) => message.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolveMessage, reject) => {
        const timer = setTimeout(
          () => finish(new Error(`Fixture ${type} timed out: ${stderr}`)),
          10_000,
        );
        const onMessage = (message: FixtureMessage) => {
          if (message.type === type) finish(undefined, message);
        };
        const onExit = () => finish(new Error(`Fixture exited before ${type}: ${stderr}`));
        function finish(error?: Error, message?: FixtureMessage): void {
          clearTimeout(timer);
          child.off("message", onMessage);
          child.off("exit", onExit);
          if (error) reject(error);
          else resolveMessage(message!);
        }
        child.on("message", onMessage);
        child.once("exit", onExit);
      });
    }
    return { child, next, completion };
  }

  it.each(["after-file-sync", "before-rename"])(
    "keeps the exact prior document after a crash at %s",
    async (mode) => {
      const fixture = launch(mode);
      await fixture.next("stage");
      fixture.child.kill("SIGKILL");
      await fixture.completion;
      expect(await readFile(join(root, "settings.json"), "utf8")).toBe(original);
      // An abandoned unique temp may exist; it is never mistaken for committed state.
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toHaveLength(1);
    },
  );

  it("can leave a committed new document after rename but before a reply", async () => {
    const fixture = launch("after-rename");
    expect(await fixture.next("stage")).toMatchObject({ stage: "renamed" });
    fixture.child.kill("SIGKILL");
    await fixture.completion;
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toMatchObject({
      themeMode: "light",
      $poracodeSettingsVersion: 1,
      futureField: { retain: true },
    });
    // This is an unknown client outcome, not proof of an exactly-once response or power-loss durability.
  });

  it.each(["file-sync-failure", "lease-loss"])(
    "refuses %s before rename and cleans the temporary file",
    async (mode) => {
      const fixture = launch(mode);
      await expect(fixture.next("failure")).resolves.toMatchObject({ type: "failure" });
      await fixture.completion;
      expect(await readFile(join(root, "settings.json"), "utf8")).toBe(original);
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    },
  );

  it("reports directory-sync failure while returning the coherent committed cache/result", async () => {
    const fixture = launch("directory-sync-failure");
    const result = await fixture.next("result");
    expect(result).toMatchObject({ result: { status: "committed" }, cachedTheme: "light" });
    expect(result.reported?.join("\n")).toContain("Fixture directory sync failed");
    await fixture.completion;
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toMatchObject({
      themeMode: "light",
    });
  });

  it("publishes the committed cache before waiting for directory durability", async () => {
    const fixture = launch("during-directory-sync");
    await fixture.next("stage");
    fixture.child.send("read");
    await expect(fixture.next("read")).resolves.toMatchObject({ theme: "light" });
    fixture.child.send("continue");
    await expect(fixture.next("result")).resolves.toMatchObject({
      result: { status: "committed" },
    });
    await fixture.completion;
  });
});
