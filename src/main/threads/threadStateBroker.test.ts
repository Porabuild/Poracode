import { expect, it, vi } from "vitest";
import { ThreadStateBroker } from "./threadStateBroker";

it("wakes a long wait during disposal without polling the database callback again", async () => {
  const broker = new ThreadStateBroker();
  const poll = vi.fn<() => undefined>(() => undefined);
  const waiting = broker.waitUntil(["fixture-thread"], 60_000, poll, 60_000);
  broker.dispose();
  await expect(waiting).rejects.toThrow("shutting down");
  expect(poll).toHaveBeenCalledOnce();
  await expect(broker.waitUntil(["fixture-thread"], 60_000, poll)).rejects.toThrow("shutting down");
  expect(poll).toHaveBeenCalledOnce();
});
