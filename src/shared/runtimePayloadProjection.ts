/** Pure provider-supplied projection of a proved persisted normalized payload. */
export interface RuntimePayloadProjectionContext {
  readonly itemType: string;
  readonly storedJsonUnits: number;
  readonly streamsElided: boolean;
}

export interface RuntimePayloadProjectionSpec {
  readonly formatOwnerKey: string;
  readonly originFormatVersion: 1;
  readonly itemTypes: readonly string[];
  readonly maxStoredJsonUnits: number;
  /** Maximum increase to existing JSON serialization, never a lower bound. */
  readonly maxWireExpansionBytes: number;
  readonly maxDecodeExpansionBytes: number;
  normalizePersistedRuntimePayload(
    payload: unknown,
    context: RuntimePayloadProjectionContext,
  ): unknown;
}
