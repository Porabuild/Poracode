import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HostResourceAdmissionOwner,
  UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
} from "@/supervisor/runtime/hostResourceAdmission";
import { SubagentAttemptCustody } from "./SubagentAttemptCustody";

afterEach(() => {
  vi.useRealTimers();
});

describe("SubagentAttemptCustody failure proof", () => {
  it.each([undefined, null, "cleanup rejected"])(
    "retains capacity for rejection %s and releases only after a successful retry",
    async (failure) => {
      const owner = new HostResourceAdmissionOwner(() => UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
      const retired = vi.fn<() => void>();
      const custody = new SubagentAttemptCustody("parent", "child", 10, retired);
      custody.lease = owner.tryAcquire({ resourceClass: "agent-session", key: "child" });
      const exit = vi.spyOn(custody.lease, "confirmExit");
      const handle = {
        launchOptions: {},
        setListener: vi.fn<() => void>(),
        interruptTurn: vi.fn<() => Promise<void>>(async () => {}),
        dispose: vi
          .fn<() => Promise<void>>()
          .mockRejectedValueOnce(failure)
          .mockResolvedValue(undefined),
      };
      custody.setHandle(handle);
      await expect(custody.teardown()).rejects.toThrow(String(failure));
      expect(custody.hasLiveResources).toBe(true);
      expect(custody.handle).toBe(handle);
      expect(owner.usage().total).toBe(1);
      expect(exit).not.toHaveBeenCalled();
      expect(retired).not.toHaveBeenCalled();
      await custody.teardown();
      expect(owner.usage().total).toBe(0);
      expect(custody.hasLiveResources).toBe(false);
      expect(exit).toHaveBeenCalledOnce();
      expect(retired).toHaveBeenCalledOnce();
      expect(handle.interruptTurn).toHaveBeenCalledOnce();
      expect(handle.dispose).toHaveBeenCalledTimes(2);
    },
  );

  it("retains a disposal rejection arriving after the deadline and retries without another interrupt", async () => {
    vi.useFakeTimers();
    const owner = new HostResourceAdmissionOwner(() => UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
    const retired = vi.fn<() => void>();
    const custody = new SubagentAttemptCustody("parent", "child", 10, retired);
    custody.lease = owner.tryAcquire({ resourceClass: "agent-session", key: "child" });
    const disposal = Promise.withResolvers<void>();
    const handle = {
      launchOptions: {},
      setListener: vi.fn<() => void>(),
      interruptTurn: vi.fn<() => Promise<void>>(async () => {}),
      dispose: vi
        .fn<() => Promise<void>>()
        .mockReturnValueOnce(disposal.promise)
        .mockResolvedValue(undefined),
    };
    custody.setHandle(handle);
    const first = custody.teardown().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(String(await first)).toContain("did not confirm");
    expect(owner.usage().total).toBe(1);
    disposal.reject(new Error("late dispose rejection"));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(custody.hasLiveResources).toBe(true);
    expect(retired).not.toHaveBeenCalled();
    expect(handle.dispose).toHaveBeenCalledOnce();
    await custody.teardown();
    expect(handle.dispose).toHaveBeenCalledTimes(2);
    expect(handle.interruptTurn).toHaveBeenCalledOnce();
    expect(owner.usage().total).toBe(0);
    expect(retired).toHaveBeenCalledOnce();
  });

  it("does not treat a rejected one-shot closed promise as exit proof", async () => {
    const owner = new HostResourceAdmissionOwner(() => UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY);
    const retired = vi.fn<() => void>();
    const custody = new SubagentAttemptCustody("parent", "child", 10, retired);
    custody.lease = owner.tryAcquire({ resourceClass: "agent-session", key: "child" });
    const oneShot = {
      cancel: vi.fn<() => void>(),
      closed: Promise.reject(new Error("exit not observed")),
    };
    custody.setOneShot(oneShot);
    await expect(custody.teardown()).rejects.toThrow("exit not observed");
    await expect(custody.teardown()).rejects.toThrow("exit not observed");
    expect(custody.oneShot).toBe(oneShot);
    expect(custody.hasLiveResources).toBe(true);
    expect(owner.usage().total).toBe(1);
    expect(retired).not.toHaveBeenCalled();
    expect(oneShot.cancel).toHaveBeenCalledOnce();
  });
});
