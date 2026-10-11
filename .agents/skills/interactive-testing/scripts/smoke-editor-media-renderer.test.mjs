import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { cleanupRenderer } from "./smoke-editor-media-renderer.mjs";

const key = "__poracodeEditorMediaSmoke";

void test("serialized renderer cleanup continues after a listener or editor cleanup throws", async () => {
  const restored = [];
  const state = {
    ownerToken: "unit-owner",
    listeners: [
      () => {
        throw new Error("listener failed");
      },
      () => restored.push("listener"),
    ],
    players: [{ pause: () => restored.push("player") }],
    originalView: { kind: "draft" },
    originalPanel: { settingsOpen: false },
    originalEditor: { activePath: "previous.txt" },
    store: {
      getState: () => ({
        clearSession: () => {
          throw new Error("clear failed");
        },
      }),
      setState: () => restored.push("editor"),
    },
  };
  const context = vm.createContext({ document: { querySelector: () => null } });
  context.window = context;
  context[key] = state;
  context.__poracodeDev = {
    stores: {
      app: { setState: () => restored.push("view") },
      panel: { setState: () => restored.push("panel") },
    },
  };
  await assert.rejects(
    vm.runInContext(`(${cleanupRenderer})("unit-owner")`, context),
    /listener failed.*clear failed/u,
  );
  assert.deepEqual(restored, ["listener", "player", "view", "panel", "editor"]);
  assert.equal(context[key], undefined);
});
