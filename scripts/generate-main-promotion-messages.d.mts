/**
 * Type surface for `generate-main-promotion-messages.mjs`, the generator that
 * materializes the committed main-side promotion message subset from the
 * renderer catalogs (`src/main/i18n/promotionMessages.generated.ts`).
 */
export declare const PROMOTION_MESSAGE_KEYS: readonly string[];

export interface BuildPromotionMessagesOptions {
  readonly sharedMessagesPath?: string;
  readonly localesDir?: string;
  readonly locales?: readonly string[];
}

export declare function buildPromotionMessages(
  options?: BuildPromotionMessagesOptions,
): Record<string, Record<string, string>>;
