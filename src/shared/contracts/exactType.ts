/**
 * Bidirectional assignability. Used so schema-inferred types stay aligned with
 * producer interfaces without claiming `as z.ZodType<T>` is authority.
 */
export type MutuallyAssignable<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false;

export type AssertExact<Actual, Expected> =
  MutuallyAssignable<Actual, Expected> extends true ? true : { expected: Expected; actual: Actual };

/**
 * Zod models an optional property as both `?` and `| undefined`. Hand-written
 * producer interfaces in this codebase generally use only `?`, which is
 * intentionally narrower with `exactOptionalPropertyTypes`. Normalize that one
 * representational difference recursively before using a producer type as a
 * Zod output constraint; required keys and their values remain unchanged.
 */
export type NormalizeExactOptionalProperties<Value> = Value extends readonly (infer Item)[]
  ? NormalizeExactOptionalProperties<Item>[]
  : Value extends object
    ? {
        [Key in keyof Value]:
          | NormalizeExactOptionalProperties<Value[Key]>
          | ({} extends Pick<Value, Key> ? undefined : never);
      }
    : Value;

export function assertExactType<_Proof extends true>(): void {
  // Compile-time only.
}
