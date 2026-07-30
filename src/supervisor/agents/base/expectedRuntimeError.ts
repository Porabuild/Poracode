/**
 * Base identity for structured-runtime failures that are actionable to the
 * user but are not Poracode product defects. Provider adapters should use a
 * more specific subclass so shared runtime can apply the expected treatment
 * without learning provider-specific error details.
 */
export class ExpectedStructuredRuntimeError extends Error {}
