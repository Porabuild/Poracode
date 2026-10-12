import { expect, it, vi } from "vitest";
import { readCodexTurnSummaries } from "./threadTurnSummaries";
import { CodexRpcResponseError } from "./appServerRpc";
type Request = (
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
) => Promise<unknown>;

it("pages only the recent turn metadata needed for a revert without full history hydration", async () => {
  const request = vi
    .fn<Request>()
    .mockResolvedValueOnce({ data: [{ id: "t4" }, { id: "t3" }], nextCursor: "older" })
    .mockResolvedValueOnce({ data: [{ id: "t2" }], nextCursor: "still-older" });
  const turns = await readCodexTurnSummaries({ request: request as never }, "thread", { count: 3 });
  expect(turns.map(({ id }) => id)).toEqual(["t4", "t3", "t2"]);
  expect(request.mock.calls).toEqual([
    [
      "thread/turns/list",
      { threadId: "thread", cursor: null, limit: 3, sortDirection: "desc", itemsView: "notLoaded" },
      undefined,
    ],
    [
      "thread/turns/list",
      {
        threadId: "thread",
        cursor: "older",
        limit: 1,
        sortDirection: "desc",
        itemsView: "notLoaded",
      },
      undefined,
    ],
  ]);
});

it("preserves pre-pagination servers only when the pagination method is unavailable", async () => {
  const request = vi
    .fn<Request>()
    .mockRejectedValueOnce(new CodexRpcResponseError("Method not found", -32601))
    .mockResolvedValueOnce({ thread: { turns: [{ id: "old" }, { id: "latest" }] } });
  expect(
    (await readCodexTurnSummaries({ request: request as never }, "thread", { count: 1 })).map(
      ({ id }) => id,
    ),
  ).toEqual(["latest"]);
  expect(request).toHaveBeenLastCalledWith(
    "thread/read",
    { threadId: "thread", includeTurns: true },
    undefined,
  );
});

it("does not request full history for parameter errors on a paginated server", async () => {
  const error = new CodexRpcResponseError("Unknown field itemsView", -32602);
  const request = vi.fn<Request>().mockRejectedValue(error);
  await expect(readCodexTurnSummaries({ request: request as never }, "thread")).rejects.toBe(error);
  expect(request).toHaveBeenCalledOnce();
});

it("rejects repeated cursors instead of looping through history indefinitely", async () => {
  const request = vi
    .fn<Request>()
    .mockResolvedValue({ data: [{ id: "turn" }], nextCursor: "same" });
  await expect(readCodexTurnSummaries({ request: request as never }, "thread")).rejects.toThrow(
    "continuation cursor",
  );
  expect(request).toHaveBeenCalledTimes(2);
});

it("uses only one retirement page even when the server returns a short page with more history", async () => {
  const request = vi
    .fn<Request>()
    .mockResolvedValue({ data: [{ id: "active", status: "inProgress" }], nextCursor: "older" });
  const turns = await readCodexTurnSummaries({ request: request as never }, "thread", {
    count: 100,
    maxPages: 1,
  });
  expect(turns.map(({ id }) => id)).toEqual(["active"]);
  expect(request).toHaveBeenCalledOnce();
});

it("discards a late turn page after its session loses ownership", async () => {
  let current = true;
  const request = vi.fn<
    () => Promise<{ data: { id: string; status: string }[]; nextCursor: null }>
  >(async () => {
    current = false;
    return { data: [{ id: "replacement", status: "inProgress" }], nextCursor: null };
  });
  expect(
    await readCodexTurnSummaries({ request: request as never }, "thread", {
      isCurrent: () => current,
    }),
  ).toEqual([]);
});
