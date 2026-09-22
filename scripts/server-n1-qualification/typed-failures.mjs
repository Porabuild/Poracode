/**
 * Typed failures for the published N-1 server upgrade qualification gate.
 *
 * Every failure mode that means something different operationally gets its
 * own exit code so CI verdicts can never be mistaken for one another.
 */

export class NoPublishedServerN1Error extends Error {
  constructor(message, evidence) {
    super(message);
    this.name = "NoPublishedServerN1Error";
    this.code = "NO_PUBLISHED_SERVER_N1";
    this.evidence = evidence;
  }
}

export const TYPED_EXIT_CODES = {
  QUALIFICATION_FAILED: 1,
  NO_PUBLISHED_SERVER_N1: 3,
  RELEASE_LIST_UNAVAILABLE: 4,
  N1_ARTIFACT_INVALID: 5,
  CANDIDATE_INVALID: 6,
  SQLITE_UNAVAILABLE: 7,
};
