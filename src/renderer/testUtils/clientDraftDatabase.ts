/** Real IndexedDB transactions for composer tests; reset only this feature's database. */
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach } from "vitest";
import {
  composerDraftStorage,
  resetComposerDraftStorageForTest,
} from "@/renderer/state/composerDraftStorage";
import { closeClientDraftDatabaseForTest } from "@/renderer/state/composerDrafts/clientDraftDatabase";

const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
beforeEach(async () => {
  await composerDraftStorage()
    ?.flushRequired()
    .catch(() => undefined);
  resetComposerDraftStorageForTest();
  await closeClientDraftDatabaseForTest();
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith("poracode-composer-draft-")) localStorage.removeItem(key);
  }
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: new IDBFactory(),
  });
});
afterEach(async () => {
  await composerDraftStorage()
    ?.flushRequired()
    .catch(() => undefined);
  resetComposerDraftStorageForTest();
  await closeClientDraftDatabaseForTest();
  if (originalIndexedDB) Object.defineProperty(globalThis, "indexedDB", originalIndexedDB);
  else Reflect.deleteProperty(globalThis, "indexedDB");
});
