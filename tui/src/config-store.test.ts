import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTuiConfigStore } from "./config-store";

const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
const tempHome = async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-tui-config-"));
  homes.push(home);
  return home;
};

test("a launch outside any project defaults the session scope to every project", async () => {
  const home = await tempHome();
  const store = createTuiConfigStore(home, { tabsScope: "global" });
  expect((await store.get()).tabs?.scope).toBe("global");
  // The default is never written: the user's own choice stays unset on disk.
  const updated = await store.update(() => undefined);
  expect(updated.tabs?.scope).toBe("global");
  const written = JSON.parse(await readFile(store.path, "utf8"));
  expect(written.tabs?.scope).toBeUndefined();
  expect((await createTuiConfigStore(home).get()).tabs?.scope).toBeUndefined();
});

test("the transcript defaults to compact without overriding or writing a choice", async () => {
  const home = await tempHome();
  const store = createTuiConfigStore(home);
  expect((await store.get()).session?.verbosity).toBe("low");
  const updated = await store.update((draft) => {
    draft.session = { ...draft.session, thinking: "show" };
  });
  expect(updated.session).toMatchObject({ verbosity: "low", thinking: "show" });
  const written = JSON.parse(await readFile(store.path, "utf8"));
  expect(written.session).toEqual({ thinking: "show" });

  await store.update((draft) => {
    draft.session = { ...draft.session, verbosity: "high" };
  });
  expect((await store.get()).session?.verbosity).toBe("high");
});

test("the right sidebar defaults to hidden without overriding or writing a choice", async () => {
  const home = await tempHome();
  const store = createTuiConfigStore(home);
  expect((await store.get()).session?.sidebar).toBe("hide");
  const updated = await store.update((draft) => {
    draft.session = { ...draft.session, thinking: "show" };
  });
  expect(updated.session).toMatchObject({ sidebar: "hide", thinking: "show" });
  const written = JSON.parse(await readFile(store.path, "utf8"));
  expect(written.session).toEqual({ thinking: "show" });

  await store.update((draft) => {
    draft.session = { ...draft.session, sidebar: "auto" };
  });
  expect((await store.get()).session?.sidebar).toBe("auto");
});

test("an explicit sidebar choice in the file wins over the default", async () => {
  const home = await tempHome();
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(
    join(home, "config", "poracode-tui.json"),
    JSON.stringify({ session: { sidebar: "auto" } }),
  );
  expect((await createTuiConfigStore(home).get()).session?.sidebar).toBe("auto");
});

test("an explicit scope wins over the launch default", async () => {
  const home = await tempHome();
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(
    join(home, "config", "poracode-tui.json"),
    JSON.stringify({ tabs: { scope: "cwd" } }),
  );
  expect((await createTuiConfigStore(home, { tabsScope: "global" }).get()).tabs?.scope).toBe("cwd");
});
