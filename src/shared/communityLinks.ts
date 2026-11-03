/** Public Poracode community destinations shared by About and the news line. */
export const PORACODE_REPO_URL = "https://github.com/Porabuild/Poracode";
export const PORACODE_X_URL = "https://x.com/poracode";
export const CREATOR_X_URL = "https://x.com/serg_vecher";

/**
 * Community promotions. Each id is persisted in shared settings
 * (`dismissedPromotions`) once the user opens or closes it, which hides it on
 * every surface. Never reuse or rename an id: older hosts may still hold it.
 */
export const COMMUNITY_PROMOTION_IDS = ["github-star", "x-poracode", "x-creator"] as const;
export type CommunityPromotionId = (typeof COMMUNITY_PROMOTION_IDS)[number];

export const COMMUNITY_PROMOTION_URLS: Record<CommunityPromotionId, string> = {
  "github-star": PORACODE_REPO_URL,
  "x-poracode": PORACODE_X_URL,
  "x-creator": CREATOR_X_URL,
};
