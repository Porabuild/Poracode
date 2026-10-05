import { afterEach, expect, it, vi } from "vitest";
import { clearActiveFindEditor, openEditorFind, setActiveFindEditor } from "./editorFindBridge";

afterEach(() => setActiveFindEditor(null));
it("cleanup releases only the editor that still owns Find", () => {
  const old = { focus: vi.fn<() => void>(), getAction: () => ({ run: vi.fn<() => void>() }) };
  const run = vi.fn<() => void>();
  const next = { focus: vi.fn<() => void>(), getAction: () => ({ run }) };
  setActiveFindEditor(old);
  setActiveFindEditor(next);
  clearActiveFindEditor(old);
  expect(openEditorFind()).toBe(true);
  expect(next.focus).toHaveBeenCalledOnce();
  expect(run).toHaveBeenCalledOnce();
  clearActiveFindEditor(next);
  expect(openEditorFind()).toBe(false);
});
