import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceSession } from "@/shared/deviceWorkspace";
import type { DeviceHubHandle, DeviceHubRuntime } from "./DeviceHubRuntime";
import { DevicePreviewSessions } from "./DevicePreviewSessions";
import { DeviceWorkspaceError } from "./deviceProcess";

const managers: DevicePreviewSessions[] = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.dispose()));
});

function fixture(access: "view" | "control" = "control") {
  const lease = new AbortController();
  const session: DeviceSession = {
    version: 1,
    generation: randomUUID(),
    id: randomUUID(),
    threadId: "thread-a",
    device: {
      id: "android:Fixture",
      platform: "android",
      name: "Fixture",
      state: "running",
      input: true,
      accessibility: true,
    },
    access,
    agentAccess: "none",
    expiresAt: Date.now() + 60_000,
  };
  const handles: DeviceHubHandle[] = [];
  const runtime = {
    prepare: vi.fn<() => Promise<void>>(async () => undefined),
    platforms: vi.fn<() => string[]>(() => ["android"]),
    acquire: vi.fn<() => Promise<DeviceHubHandle>>(async () => {
      const controller = new AbortController();
      const handle: DeviceHubHandle = {
        origin: "http://127.0.0.1:43210",
        token: "fixture-private-helper-token",
        signal: controller.signal,
        release: vi.fn<() => Promise<void>>(async () => {
          controller.abort();
        }),
      };
      handles.push(handle);
      return handle;
    }),
    dispose: vi.fn<() => Promise<void>>(async () => undefined),
  };
  const authorize = vi.fn<
    (
      threadId: string,
      principal: string,
      sessionId: string,
      control: boolean,
    ) => { session: DeviceSession; signal: AbortSignal }
  >((threadId: string, principal: string, sessionId: string, control: boolean) => {
    if (
      threadId !== session.threadId ||
      principal !== "principal-a" ||
      sessionId !== session.id ||
      lease.signal.aborted
    )
      throw new DeviceWorkspaceError("device_session_expired", "Expired", 410);
    if (control && access !== "control")
      throw new DeviceWorkspaceError("device_control_denied", "Denied", 403);
    return { session, signal: lease.signal };
  });
  const target = { clientDeviceId: "emulator-5554", adbPath: "adb", bootId: randomUUID() };
  const resolveTarget = vi.fn<() => Promise<typeof target>>(async () => ({ ...target }));
  const manager = new DevicePreviewSessions(
    runtime as unknown as DeviceHubRuntime,
    authorize,
    resolveTarget,
  );
  managers.push(manager);
  const open = (signal = new AbortController().signal) =>
    manager.open(
      session.threadId,
      "principal-a",
      session.id,
      { version: 1, generation: session.generation },
      signal,
    );
  const get = (previewId?: string) =>
    manager.get(session.threadId, "principal-a", session.id, previewId);
  return { manager, runtime, session, lease, handles, authorize, target, resolveTarget, open, get };
}

describe("lease-owned preview retirement and replacement", () => {
  it.each(["open", "dispose"] as const)(
    "retries failed helper retirement through %s while retaining the old resource fence",
    async (operation) => {
      const f = fixture();
      const first = await f.open();
      const release = vi.mocked(f.handles[0]!.release);
      release.mockRejectedValueOnce(new Error("fixture helper join unconfirmed"));
      await expect(first.close()).rejects.toThrow("fixture helper join unconfirmed");
      const held = Promise.withResolvers<void>();
      release.mockImplementationOnce(() => held.promise);
      const retry = (operation === "open" ? f.open() : f.manager.dispose()).then(
        () => true,
        () => false,
      );
      try {
        await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(2));
        expect(f.runtime.acquire).toHaveBeenCalledTimes(1);
        expect(f.runtime.dispose).not.toHaveBeenCalled();
        held.resolve();
        expect(await retry).toBe(true);
        expect(f.runtime.acquire).toHaveBeenCalledTimes(operation === "open" ? 2 : 1);
        await first.close();
        expect(release).toHaveBeenCalledTimes(2);
      } finally {
        held.resolve();
      }
    },
  );

  it("joins all old channels after one stop fails and retries only behind the same session fence", async () => {
    const f = fixture();
    const first = await f.open();
    const video = Promise.withResolvers<void>();
    const input = Promise.withResolvers<void>();
    const stop = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("fixture input stop failed"))
      .mockImplementation(() => input.promise);
    first.ownResource("input", stop);
    first.ownResource("video", () => video.promise);
    let settled = false;
    const closing = first.close().catch((error: unknown) => {
      settled = true;
      return error;
    });
    try {
      await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
      expect(settled).toBe(false);
      expect(f.handles[0]!.release).not.toHaveBeenCalled();
      video.resolve();
      expect(await closing).toMatchObject({ message: "fixture input stop failed" });
      const replacement = f.open();
      const observed = replacement.then(
        () => true,
        () => false,
      );
      await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(2));
      expect(f.runtime.acquire).toHaveBeenCalledTimes(1);
      expect(f.handles[0]!.release).not.toHaveBeenCalled();
      input.resolve();
      expect(await observed).toBe(true);
      expect(f.runtime.acquire).toHaveBeenCalledTimes(2);
    } finally {
      video.resolve();
      input.resolve();
    }
  });

  it("joins captured channels before helper release or replacement and ignores a delayed old close", async () => {
    const f = fixture();
    const first = await f.open();
    const stopped = Promise.withResolvers<void>();
    const stop = vi.fn<() => Promise<void>>(() => stopped.promise);
    first.ownResource("video", stop);
    const retiring = first.close();
    const replacement = f.open();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(f.runtime.acquire).toHaveBeenCalledTimes(1);
    expect(f.handles[0]!.release).not.toHaveBeenCalled();
    stopped.resolve();
    await retiring;
    const next = await replacement;
    expect(f.handles[0]!.release).toHaveBeenCalledTimes(1);
    expect(next.descriptor.id).not.toBe(first.descriptor.id);
    await first.close();
    expect(next.signal.aborted).toBe(false);
    expect(f.handles[1]!.release).not.toHaveBeenCalled();
    await expect(f.get(first.descriptor.id)).rejects.toMatchObject({ status: 410 });
    expect((await f.get(next.descriptor.id)).descriptor.id).toBe(next.descriptor.id);
    expect(f.lease.signal.aborted).toBe(false);
    expect(f.session.access).toBe("control");
    expect(f.session.agentAccess).toBe("none");
  });

  it("cancels a waiter without closing another request's completed preview", async () => {
    const f = fixture();
    const setup = Promise.withResolvers<void>();
    f.runtime.prepare.mockImplementation(() => setup.promise);
    const first = f.open();
    const caller = new AbortController();
    const waiter = f.open(caller.signal);
    const rejected = waiter.catch((error: unknown) => error);
    caller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    setup.resolve();
    const preview = await first;
    expect(preview.signal.aborted).toBe(false);
    expect(f.runtime.acquire).toHaveBeenCalledTimes(1);
  });

  it("does not retain a cancelled initial setup or close its replacement", async () => {
    const f = fixture();
    const setup = Promise.withResolvers<void>();
    f.runtime.prepare.mockImplementationOnce(() => setup.promise);
    const caller = new AbortController();
    const opening = f.open(caller.signal);
    const rejected = opening.catch((error: unknown) => error);
    caller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    setup.resolve();
    const next = await f.open();
    expect(f.runtime.acquire).toHaveBeenCalledTimes(1);
    expect(next.signal.aborted).toBe(false);
  });

  it("does not let a cancelled replacement waiter bypass old channel retirement", async () => {
    const f = fixture();
    const first = await f.open();
    const held = Promise.withResolvers<void>();
    first.ownResource("input", () => held.promise);
    const retiring = first.close();
    const caller = new AbortController();
    const pending = f.open(caller.signal);
    const rejected = pending.catch((error: unknown) => error);
    caller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    expect(f.runtime.acquire).toHaveBeenCalledTimes(1);
    held.resolve();
    await retiring;
    expect((await f.open()).signal.aborted).toBe(false);
  });

  it("rechecks thread, principal, generation, consent and revocation without retaining a bearer", async () => {
    const f = fixture("view");
    const preview = await f.open();
    await expect(
      f.manager.get("thread-b", "principal-a", f.session.id, preview.descriptor.id),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      f.manager.get("thread-a", "principal-b", f.session.id, preview.descriptor.id),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      f.manager.open(
        "thread-a",
        "principal-a",
        f.session.id,
        { version: 1, generation: randomUUID() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "stale_device_generation" });
    expect(() => preview.assert(true)).toThrowError(expect.objectContaining({ status: 403 }));
    f.session.expiresAt += 20_000;
    expect(preview.current().expiresAt).toBe(f.session.expiresAt);
    f.lease.abort();
    expect(() => preview.assert()).toThrow("This operation was aborted");
    await f.manager.release(f.session.id);
    expect(f.handles[0]!.release).toHaveBeenCalledTimes(1);
  });

  it("refuses changed Android boot identity even when the serial and AVD name are reused", async () => {
    const f = fixture();
    const preview = await f.open();
    f.target.bootId = randomUUID();
    await expect(preview.verifyIdentity(new AbortController().signal)).rejects.toMatchObject({
      status: 410,
    });
    await f.manager.release(f.session.id);
    expect(preview.signal.aborted).toBe(true);
    expect(f.handles[0]!.release).toHaveBeenCalledTimes(1);
    expect(f.lease.signal.aborted).toBe(false);
  });

  it("does not deadlock identity rejection inside a channel whose cleanup joins its pump", async () => {
    const f = fixture();
    const preview = await f.open();
    const pump = Promise.withResolvers<void>();
    const stop = vi.fn<() => Promise<void>>(() => pump.promise);
    preview.ownResource("video", stop);
    f.target.bootId = randomUUID();
    await expect(preview.verifyIdentity(new AbortController().signal)).rejects.toMatchObject({
      status: 410,
    });
    expect(preview.signal.aborted).toBe(true);
    expect(f.handles[0]!.release).not.toHaveBeenCalled();
    pump.resolve();
    await f.manager.release(f.session.id);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(f.handles[0]!.release).toHaveBeenCalledTimes(1);
  });

  it("refuses an unqualified platform and captures helper death in the preview generation", async () => {
    const f = fixture();
    f.runtime.platforms.mockReturnValueOnce([]);
    await expect(f.open()).rejects.toMatchObject({ status: 501 });
    expect(f.runtime.acquire).not.toHaveBeenCalled();
    const preview = await f.open();
    await f.handles[0]!.release();
    expect(() => preview.assert()).toThrow("This operation was aborted");
  });
});
