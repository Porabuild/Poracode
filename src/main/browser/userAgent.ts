const ELECTRON_PRODUCT_RE = /\sElectron\/[^\s]+/g;
const APP_PRODUCT_BEFORE_CHROME_RE =
  /(\(KHTML, like Gecko\)\s+)(?:(?!Chrome\/)\S+\/\S+\s+)+(Chrome\/)/;

export function buildChromeLikeUserAgent(defaultUserAgent: string): string {
  const withoutElectron = defaultUserAgent.replace(ELECTRON_PRODUCT_RE, "");
  const withoutAppProduct = withoutElectron.replace(APP_PRODUCT_BEFORE_CHROME_RE, "$1$2");
  return withoutAppProduct.replace(/\s{2,}/g, " ").trim();
}
