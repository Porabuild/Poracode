import type { TaxonomyCase } from "./types";
import { toolCase } from "./builders";
import { IMAGE_ASSETS, SVG_ASSET, imageDataUrl } from "./media-assets";

const png = imageDataUrl("png");

// Every declared image result key, both directly and in every array carrier.
export const IMAGE_RESULT_KEYS = [
  "dataUrl",
  "data_url",
  "image",
  "b64_json",
  "base64",
  "png",
  "data",
  "src",
  "content",
  "text",
] as const;
export const IMAGE_ARRAY_KEYS = ["images", "data", "content", "output"] as const;
export const IMAGE_FORM_CASES: readonly TaxonomyCase[] = [
  ...IMAGE_RESULT_KEYS.map((key) =>
    toolCase(
      `image-key:${key}`,
      { name: "FixtureImage", status: "success", result: { [key]: png } },
      "other",
      { inlineImage: true, groupEligible: false },
    ),
  ),
  ...IMAGE_ARRAY_KEYS.flatMap((outer) => [
    toolCase(
      `image-array:${outer}:string`,
      { name: "FixtureImage", status: "success", result: { [outer]: [png] } },
      "other",
      { inlineImage: true, groupEligible: false },
    ),
    ...IMAGE_RESULT_KEYS.map((inner) =>
      toolCase(
        `image-array:${outer}:${inner}`,
        { name: "FixtureImage", status: "success", result: { [outer]: [{ [inner]: png }] } },
        "other",
        { inlineImage: true, groupEligible: false },
      ),
    ),
  ]),
  ...(["png", "jpeg", "gif", "webp"] as const).map((format) =>
    toolCase(
      `image-format:${format}`,
      { name: "FixtureImage", status: "success", result: imageDataUrl(format) },
      "other",
      { inlineImage: true, groupEligible: false },
    ),
  ),
  ...[
    SVG_ASSET,
    `data:image/svg+xml;utf8,${encodeURIComponent(SVG_ASSET)}`,
    `data:image/svg+xml;base64,${btoa(SVG_ASSET)}`,
  ].map((result, i) =>
    toolCase(`image-svg:${i}`, { name: "FixtureImage", status: "success", result }, "other", {
      inlineImage: true,
      groupEligible: false,
    }),
  ),
  toolCase(
    "image-base64url",
    {
      name: "FixtureImage",
      status: "success",
      result: `data:image/png;base64,${IMAGE_ASSETS.webp.base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
    },
    "other",
    { inlineImage: true, groupEligible: false },
  ),
  toolCase(
    "image-whitespace",
    {
      name: "FixtureImage",
      status: "success",
      result: `data:image/png;base64,${IMAGE_ASSETS.png.base64.match(/.{1,32}/g)!.join("\n")}`,
    },
    "other",
    { inlineImage: true, groupEligible: false },
  ),
  ...["", "data:image/png;base64,", "/tmp/fixture.png", "https://fixture.invalid/picture.jpg"].map(
    (result, i) =>
      toolCase(`image-inert:${i}`, { name: "FixtureImage", status: "success", result }, "other", {
        inlineImage: false,
      }),
  ),
  toolCase("image-error-bytes", { name: "FixtureImage", status: "error", images: [png] }, "other", {
    inlineImage: false,
  }),
  toolCase(
    "image-nested-inert",
    { name: "FixtureImage", status: "success", result: { screenshot: { url: png } } },
    "other",
    { inlineImage: false },
  ),
];
