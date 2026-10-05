import { describe, expect, it, vi } from "vitest";
import { StructuredDisposalCustody } from "./structuredDisposalCustody";

describe("shared structured disposal confirmation", () => {
  it.each([undefined, null, "", new Error("failed")])(
    "keeps rejection %s unconfirmed and retryable",
    async (error) => {
      let calls = 0;
      const onConfirmed = vi.fn<() => void>();
      const onFailure = vi.fn<(error: unknown) => void>();
      const custody = new StructuredDisposalCustody(
        () => {
          calls++;
          return calls === 1 ? Promise.reject(error) : Promise.resolve();
        },
        { onConfirmed, onFailure },
      );
      expect(await custody.settle()).toBe("failed");
      expect(custody.confirmed).toBe(false);
      expect(custody.error).toBe(error);
      expect(onConfirmed).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledExactlyOnceWith(error);
      expect(await custody.settle()).toBe("confirmed");
      expect(calls).toBe(2);
      expect(custody.confirmed).toBe(true);
      expect(onConfirmed).toHaveBeenCalledExactlyOnceWith();
      expect(await custody.settle()).toBe("confirmed");
      expect(calls).toBe(2);
    },
  );

  it("joins an adopted undefined rejection before retrying disposal", async () => {
    const cleanup = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const custody = new StructuredDisposalCustody(cleanup);
    custody.adopt(Promise.reject(undefined));
    await Promise.resolve();
    expect(custody.confirmed).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    expect(await custody.settle()).toBe("confirmed");
    expect(cleanup).toHaveBeenCalledExactlyOnceWith();
  });
});
