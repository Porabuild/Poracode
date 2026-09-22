import { expect, it } from "vitest";
import { isSafeAttachmentDirName } from "./attachmentDirPolicy";

it.each(["", ".", "..", "...", " . ", "folder/../", "folder\\..", "a\0b"])(
  "refuses directory names that can address a root or escape a single component: %j",
  (name) => {
    expect(isSafeAttachmentDirName(name)).toBe(false);
  },
);

it.each(["thread-1", "café", "file.", "file "])(
  "keeps non-root legacy names addressable: %j",
  (name) => {
    expect(isSafeAttachmentDirName(name)).toBe(true);
  },
);
