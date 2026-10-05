import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";
import { IMAGE_ASSETS, REMOTE_REF, imageDataUrl } from "./media-assets";

const png = imageDataUrl("png");
const jpeg = imageDataUrl("jpeg");

export const MEDIA_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  itemCase(
    "image_png",
    "image_view",
    {
      name: "ImageView",
      args: { prompt: "synthetic PNG" },
      images: [png],
      result: "image result",
      status: "success",
    },
    "other",
    { inlineImage: true, groupEligible: false },
  ),
  toolCase(
    "image_jpeg_synthetic",
    {
      name: "Fixture raster",
      args: { caption: "synthetic JPEG; not a photograph" },
      images: [jpeg],
      status: "success",
    },
    "other",
    { inlineImage: true, groupEligible: false },
    ["image_jpeg_photo"],
  ),
  itemCase(
    "image_result_forms",
    "image_view",
    {
      name: "imageGeneration",
      args: { prompt: "synthetic image" },
      result: { b64_json: IMAGE_ASSETS.png.base64 },
      status: "success",
    },
    "other",
    { inlineImage: true, groupEligible: false },
  ),
  itemCase(
    "image_format_repair",
    "image_view",
    {
      name: "FixtureImage",
      result: `data:image/png;base64,${IMAGE_ASSETS.webp.base64}`,
      status: "success",
    },
    "other",
    { inlineImage: true, groupEligible: false },
  ),
  itemCase(
    "image_multiple_candidates",
    "mcp_tool_call",
    {
      name: "mcp__fixture__rasters",
      images: [png, jpeg],
      result: { image: imageDataUrl("gif") },
      status: "success",
    },
    "mcp",
    { inlineImage: true, groupEligible: false },
  ),
  itemCase(
    "image_fallback",
    "image_view",
    { name: "FixtureImage", result: "https://fixture.invalid/track.png", status: "success" },
    "other",
    { inlineImage: false },
  ),
  toolCase(
    "image_remote_ref",
    { name: "FixtureImage", result: { image: REMOTE_REF }, status: "success" },
    "other",
    { inlineImage: true, groupEligible: false },
  ),
  itemCase(
    "assistant_image_blocks",
    "assistant_message",
    {
      content: [
        { kind: "text", text: "Two synthetic rasters" },
        { kind: "image", mimeType: "image/png", dataUrl: png, name: "synthetic-one" },
        { kind: "image", mimeType: "image/jpeg", dataUrl: jpeg, name: "synthetic-two" },
      ],
    },
    "other",
    { groupEligible: false },
    {},
    ["assistant_photo_blocks"],
  ),
  itemCase(
    "user_image_attachments",
    "user_message",
    {
      content: [
        { kind: "text", text: "Inspect synthetic rasters" },
        {
          kind: "image",
          mimeType: "image/jpeg",
          dataUrl: jpeg,
          path: "media/fixture.jpg",
          name: "fixture.jpg",
          source: "attachment",
        },
        {
          kind: "file",
          path: "media/fixture.png",
          mimeType: "image/png",
          name: "fixture.png",
          source: "mention",
        },
      ],
    },
    "other",
    { groupEligible: false },
    {},
    ["user_photo_attachments"],
  ),
  itemCase(
    "markdown_image",
    "assistant_message",
    { content: [{ kind: "text", text: `Fixture image ![synthetic](${png})` }] },
    "other",
    { groupEligible: false },
  ),
];
