/** Downgrade-refusal planning for the published N-1 qualification gate. */

/**
 * The candidate refuses a downgrade only through the schema registry: an
 * install whose recorded schema advanced past the N-1 artifact's registry
 * must refuse the N-1 bytes. When the candidate did not advance the schema
 * there is nothing to refuse by design, so the assertion is recorded as
 * planned-out instead of being silently dropped.
 */
export function classifyDowngradeRefusalPlan({ candidateLatestSchema, n1LatestSchema }) {
  if (!Number.isSafeInteger(candidateLatestSchema) || !Number.isSafeInteger(n1LatestSchema)) {
    return {
      assertRefusal: false,
      reason: `schema registries unreadable (candidate=${candidateLatestSchema}, n1=${n1LatestSchema})`,
    };
  }
  if (candidateLatestSchema > n1LatestSchema) {
    return {
      assertRefusal: true,
      reason: `candidate schema ${candidateLatestSchema} is above the N-1 registry ${n1LatestSchema}`,
    };
  }
  return {
    assertRefusal: false,
    reason:
      `candidate schema ${candidateLatestSchema} did not advance past the N-1 registry ` +
      `${n1LatestSchema}; the schema downgrade guard has nothing to refuse by design`,
  };
}
