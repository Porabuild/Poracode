import { createProviderIcon } from "../common/createProviderIcon";

// The z.ai brand "Z": the angled top/bottom bars plus the parallelogram diagonal,
// lifted verbatim from the official mark (z-cdn.chatglm.cn/z-ai/static/logo.svg,
// viewBox 0 0 30 30) and merged into one compound path — dropping the rounded
// container and gradients so the glyph tints with the provider status tone like
// every other provider icon.
const ZAI_PATH =
  "M15.47,7.1l-1.3,1.85c-0.2,0.29-0.54,0.47-0.9,0.47h-7.1V7.09C6.16,7.1,15.47,7.1,15.47,7.1z" +
  "M24.3,7.1L13.14,22.91L5.7,22.91L16.86,7.1z" +
  "M14.53,22.91l1.31-1.86c0.2-0.29,0.54-0.47,0.9-0.47h7.09v2.33H14.53z";

export const ZaiIcon = createProviderIcon({
  cssPrefix: "lightcode-zai-icon",
  path: ZAI_PATH,
  viewBox: "0 0 30 30",
});
