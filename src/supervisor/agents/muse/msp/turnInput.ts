/**
 * MSP turn input: a single text part. Attachment paths arrive inside the
 * prompt as `@path` mentions — see `readsImageAttachmentsFromHost` in
 * `../detection.ts` for why image bytes are never inlined.
 */
export async function buildMuseTurnInput(
  prompt: string,
  inlineInstructions: string | undefined,
): Promise<Array<Record<string, unknown>>> {
  const text = inlineInstructions ? `${prompt}\n\n${inlineInstructions}` : prompt;
  return [{ type: "text", text }];
}
