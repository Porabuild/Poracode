import { expect, it, vi } from "vitest";
import { runRendererAction, useRendererActionStore } from "./rendererActionStore";

it("shows pending feedback synchronously and joins repeated destructive clicks", async () => {
  let accept!: () => void;
  const action = vi.fn<() => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  const first = runRendererAction("delete", action);
  expect(useRendererActionStore.getState().pending.delete).toBe(true);
  const second = runRendererAction("delete", action);
  expect(second).toBe(first);
  expect(action).toHaveBeenCalledOnce();
  accept();
  await first;
  expect(useRendererActionStore.getState().pending.delete).toBeUndefined();
});

it("queues navigation intents without dropping clicks or clearing feedback between them", async () => {
  let accept!: () => void;
  const first = runRendererAction(
    "navigate",
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  const next = vi.fn<() => Promise<void>>(async () => {});
  const second = runRendererAction("navigate", next, { queue: true });
  expect(next).not.toHaveBeenCalled();
  accept();
  await first;
  expect(useRendererActionStore.getState().pending.navigate).toBe(true);
  await second;
  expect(next).toHaveBeenCalledOnce();
  expect(useRendererActionStore.getState().pending.navigate).toBeUndefined();
});

it("releases feedback after failure and permits retry", async () => {
  const failure = new Error("refused");
  await expect(
    runRendererAction("refuse", () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(useRendererActionStore.getState().pending.refuse).toBeUndefined();
  await expect(runRendererAction("refuse", async () => "retried")).resolves.toBe("retried");
});
