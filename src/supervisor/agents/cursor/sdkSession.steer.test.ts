import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  baseConfig,
  createSession,
  deferred,
  FakeWorker,
  recordingListener,
  resultEvent,
} from "./sdkSession.testFixtures";
import type { CursorSdkWorkerStartResult, CursorSdkWorkerSteerResult } from "./sdkWorkerProtocol";

async function running(worker = new FakeWorker()) {
  const { session } = await createSession(worker);
  const recorded = recordingListener();
  session.setListener(recorded.listener);
  await session.activate();
  await session.openThread(baseConfig);
  const completion = session.startTurn("initial", baseConfig, undefined, {
    userMessageItemId: "initial-user",
  });
  await vi.waitFor(() => expect(worker.start).toHaveBeenCalledOnce());
  return { session, worker, recorded, completion };
}

describe("Cursor SDK native steering", () => {
  it.each(["stop", "force-complete"])(
    "acknowledges %s after run completion while a steer is still pending",
    async (action) => {
      const { session, worker, recorded, completion } = await running();
      const acknowledgement = deferred<CursorSdkWorkerSteerResult>();
      worker.steer.mockReturnValueOnce(acknowledgement.promise);
      const delivery = session.steerTurn("pending input", baseConfig);
      try {
        await vi.waitFor(() => expect(worker.steer).toHaveBeenCalledOnce());
        worker.emit(resultEvent());
        await completion;
        expect(recorded.updates.at(-1)?.status).toBe("working");

        if (action === "stop") await session.interruptTurn();
        else session.forceCompleteTurn();

        expect(recorded.updates.at(-1)?.status).toBe("idle");
        await delivery;
        acknowledgement.resolve("revert_to_followup");
        await Promise.resolve();
        expect(worker.start).toHaveBeenCalledOnce();
        expect(worker.cancel).not.toHaveBeenCalled();
        expect(worker.dispose).not.toHaveBeenCalled();
      } finally {
        acknowledgement.resolve("revert_to_followup");
        await session.dispose();
        await delivery;
      }
    },
  );

  it("releases pending steering on Stop without waiting for a provider acknowledgement", async () => {
    const { session, worker, completion } = await running();
    const acknowledgement = deferred<CursorSdkWorkerSteerResult>();
    worker.steer.mockReturnValueOnce(acknowledgement.promise);
    const delivery = session.steerTurn("pending input", baseConfig);
    await vi.waitFor(() => expect(worker.steer).toHaveBeenCalledOnce());
    await session.interruptTurn();
    worker.emit(resultEvent("cancelled"));
    await Promise.all([completion, delivery]);
    acknowledgement.reject(new Error("late cancelled acknowledgement"));
    await session.dispose();
  });

  it("delivers a fresh steer when another direct submit claims the cancelled boundary", async () => {
    const { session, worker, recorded, completion } = await running();
    await session.interruptTurn();
    let competing: Promise<void> | undefined;
    session.setListener({
      ...recorded.listener,
      onUpdate(update) {
        recorded.listener.onUpdate(update);
        if (update.status === "idle" && !competing) {
          competing = session.startTurn("another direct input", baseConfig, undefined, {
            userMessageItemId: "competing-user",
          });
        }
      },
    });
    const fresh = session.steerTurn("fresh steer after Stop", baseConfig);
    await vi.waitFor(() =>
      expect(
        recorded.events.some((e) => e.type === "item.started" && e.itemType === "user_message"),
      ).toBe(true),
    );
    worker.start.mockResolvedValueOnce({ runId: "run-2" });
    worker.emit(resultEvent("cancelled"));
    await Promise.all([completion, fresh]);
    expect(worker.start.mock.calls.map(([input]) => input.message)).toEqual([
      "initial",
      "another direct input",
    ]);
    expect(worker.steer).toHaveBeenCalledExactlyOnceWith("run-2", "fresh steer after Stop");
    worker.emit(resultEvent("finished", "run-2"));
    await competing;
    await session.dispose();
  });

  it("accepts a fresh steer after Stop and acknowledges cancellation before replacing the run", async () => {
    const { session, worker, recorded, completion } = await running();
    await session.interruptTurn();
    const count = recorded.updates.length;
    const delivery = session.steerTurn("fresh input after Stop", baseConfig);
    await vi.waitFor(() =>
      expect(
        recorded.events.some((e) => e.type === "item.started" && e.itemType === "user_message"),
      ).toBe(true),
    );
    expect(worker.steer).not.toHaveBeenCalled();
    worker.start.mockResolvedValueOnce({ runId: "run-2" });
    worker.emit(resultEvent("cancelled"));
    await Promise.all([completion, delivery]);
    expect(worker.start).toHaveBeenCalledTimes(2);
    expect(worker.start.mock.calls.at(-1)?.[0].message).toBe("fresh input after Stop");
    expect(recorded.updates.slice(count).map((u) => u.status)).toEqual(["idle", "working"]);
    worker.emit(resultEvent("finished", "run-2"));
    await session.dispose();
  });

  it("retains a prepared image once while the follow-up awaits the active run", async () => {
    mkdirSync("tmp", { recursive: true });
    const directory = mkdtempSync(join("tmp", "cursor-steer-image-"));
    const image = join(directory, "image.png");
    writeFileSync(image, "original-image-bytes");
    const { session, worker, recorded, completion } = await running();
    try {
      const delivery = session.steerTurn(
        "image",
        baseConfig,
        [{ kind: "attachment", path: image, mimeType: "image/png" }],
        { userMessageItemId: "image-user" },
      );
      await vi.waitFor(() =>
        expect(
          recorded.events.some((e) => e.type === "item.started" && e.itemId === "image-user"),
        ).toBe(true),
      );
      rmSync(image);
      worker.start.mockResolvedValueOnce({ runId: "run-2" });
      worker.emit(resultEvent());
      await Promise.all([completion, delivery]);
      expect(worker.steer).not.toHaveBeenCalled();
      expect(worker.start.mock.calls.at(-1)?.[0].message).toEqual({
        text: "",
        images: [
          { data: Buffer.from("original-image-bytes").toString("base64"), mimeType: "image/png" },
        ],
      });
      worker.emit(resultEvent("finished", "run-2"));
    } finally {
      await session.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("delivers a steer without cancelling the parent or starting a new run", async () => {
    const { session, worker, recorded, completion } = await running();
    await session.steerTurn("use the existing subagent", baseConfig, undefined, {
      userMessageItemId: "steer-user",
    });
    expect(worker.steer).toHaveBeenCalledWith("run-1", "use the existing subagent");
    expect(worker.cancel).not.toHaveBeenCalled();
    expect(worker.start).toHaveBeenCalledOnce();
    expect(recorded.updates.at(-1)?.status).toBe("working");
    expect(
      recorded.events.filter((e) => e.type === "item.started" && e.itemId === "steer-user"),
    ).toHaveLength(1);
    worker.emit(resultEvent());
    await completion;
    expect(recorded.updates.at(-1)?.status).toBe("idle");
    await session.dispose();
  });

  it("waits for run creation and serializes simultaneous steering inputs", async () => {
    const worker = new FakeWorker();
    const started = deferred<CursorSdkWorkerStartResult>();
    const accepted = deferred<CursorSdkWorkerSteerResult>();
    worker.start.mockReturnValueOnce(started.promise);
    worker.steer.mockReturnValueOnce(accepted.promise);
    const { session, completion } = await running(worker);
    const first = session.steerTurn("first", baseConfig);
    const second = session.steerTurn("second", baseConfig);
    await Promise.resolve();
    expect(worker.steer).not.toHaveBeenCalled();
    started.resolve({ runId: "run-1" });
    await vi.waitFor(() => expect(worker.steer).toHaveBeenCalledTimes(1));
    accepted.resolve("complete_delivered");
    await Promise.all([first, second]);
    expect(worker.steer.mock.calls).toEqual([
      ["run-1", "first"],
      ["run-1", "second"],
    ]);
    worker.emit(resultEvent());
    await completion;
    await session.dispose();
  });

  it("sends declined inputs as follow-up turns with no intermediate idle", async () => {
    const { session, worker, recorded, completion } = await running();
    worker.steer.mockResolvedValueOnce("revert_to_followup");
    worker.start.mockResolvedValueOnce({ runId: "run-2" });
    const updateCount = recorded.updates.length;
    const delivery = session.steerTurn("follow up", baseConfig, undefined, {
      userMessageItemId: "followup-user",
    });
    await vi.waitFor(() => expect(worker.steer).toHaveBeenCalledOnce());
    expect(worker.start).toHaveBeenCalledOnce();
    worker.emit(resultEvent());
    await completion;
    await delivery;
    expect(worker.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "follow up" }),
    );
    expect(recorded.updates.slice(updateCount).every((u) => u.status === "working")).toBe(true);
    expect(recorded.events.filter((e) => e.type === "turn.started")).toHaveLength(2);
    worker.emit(resultEvent("finished", "run-2"));
    expect(recorded.updates.at(-1)?.status).toBe("idle");
    await session.dispose();
  });

  it.each(["stop", "dispose", "error"])(
    "does not resurrect a queued follow-up after %s",
    async (action) => {
      const { session, worker, recorded, completion } = await running();
      worker.steer.mockResolvedValueOnce("revert_to_followup");
      const delivery = session.steerTurn("follow up", baseConfig);
      await vi.waitFor(() => expect(worker.steer).toHaveBeenCalledOnce());
      if (action === "stop") {
        await session.interruptTurn();
        worker.emit(resultEvent("cancelled"));
      } else if (action === "dispose") await session.dispose();
      else worker.emit(resultEvent("error"));
      await Promise.all([completion, delivery]);
      expect(worker.start).toHaveBeenCalledOnce();
      expect(recorded.updates.at(-1)?.status).toBe(action === "error" ? "error" : "idle");
      await session.dispose();
    },
  );

  it("retains changed model and safety controls for the next run", async () => {
    const { session, worker, completion } = await running();
    const delivery = session.steerTurn("new effort", { ...baseConfig, effort: "medium" });
    await Promise.resolve();
    expect(worker.steer).not.toHaveBeenCalled();
    worker.start.mockResolvedValueOnce({ runId: "run-2" });
    worker.emit(resultEvent());
    await Promise.all([completion, delivery]);
    expect(worker.start.mock.calls.at(-1)?.[0].options?.model?.params).toContainEqual({
      id: "effort",
      value: "medium",
    });
    worker.emit(resultEvent("finished", "run-2"));
    await session.dispose();
  });

  it("starts an ordinary turn when steering an idle session", async () => {
    const { session, worker } = await createSession();
    await session.activate();
    await session.openThread(baseConfig);
    await session.steerTurn("hello", baseConfig);
    expect(worker.start).toHaveBeenCalledOnce();
    expect(worker.steer).not.toHaveBeenCalled();
    worker.emit(resultEvent());
    await session.dispose();
  });
});
