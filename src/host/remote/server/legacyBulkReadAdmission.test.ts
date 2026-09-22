import { describe, expect, it } from "vitest";
import {
  LEGACY_BULK_MAX_GLOBAL,
  LEGACY_BULK_MAX_PER_PRINCIPAL,
  LEGACY_READ_BUSY_CODE,
} from "@/shared/remote/legacyReadContract";
import { LegacyBulkReadAdmission } from "./legacyBulkReadAdmission";

describe("legacy bulk read admission", () => {
  it("admits 2 globally and 1 per principal, refusing the overflow typed", () => {
    const admission = new LegacyBulkReadAdmission(1_234);
    const alice = admission.tryAdmit("alice");
    const bob = admission.tryAdmit("bob");
    expect(admission.usage().active).toBe(LEGACY_BULK_MAX_GLOBAL);

    // Same principal is refused even though global capacity is the binding
    // limit here: per-principal cap is 1.
    expect(() => admission.tryAdmit("alice")).toThrowError(
      expect.objectContaining({
        code: LEGACY_READ_BUSY_CODE,
        status: 503,
        retryAfterMs: 1_234,
      }) as Error,
    );
    // A third principal is refused by the global cap.
    expect(() => admission.tryAdmit("carol")).toThrowError(
      expect.objectContaining({ code: LEGACY_READ_BUSY_CODE, status: 503 }) as Error,
    );
    expect(admission.usage()).toMatchObject({
      active: 2,
      admitted: 2,
      refused: 2,
      aborted: 0,
    });

    alice.release();
    expect(admission.usage().active).toBe(1);
    const aliceAgain = admission.tryAdmit("alice");
    expect(admission.usage().active).toBe(2);
    aliceAgain.release();
    bob.release();
    expect(admission.usage().active).toBe(0);
  });

  it("releases idempotently and counts abort once without freeing the slot", () => {
    const admission = new LegacyBulkReadAdmission();
    const lease = admission.tryAdmit(null);
    lease.abort();
    lease.abort();
    expect(lease.aborted).toBe(true);
    expect(admission.usage()).toMatchObject({ active: 1, aborted: 1 });
    // Anonymous callers share one principal bucket.
    expect(() => admission.tryAdmit(null)).toThrowError(
      expect.objectContaining({ code: LEGACY_READ_BUSY_CODE }) as Error,
    );
    lease.release();
    lease.release();
    expect(admission.usage().active).toBe(0);
  });

  it("keeps per-principal capacity independent of the global cap", () => {
    const admission = new LegacyBulkReadAdmission();
    const leases = ["alice", "bob"].map((principal) => admission.tryAdmit(principal));
    expect(LEGACY_BULK_MAX_PER_PRINCIPAL).toBe(1);
    expect(admission.usage().active).toBe(2);
    for (const lease of leases) lease.release();
    expect(admission.usage().active).toBe(0);
  });
});
