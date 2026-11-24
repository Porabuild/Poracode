// v84 refreshes Cursor observations after sub-provider grouping switched from
// a third-party denylist to the Cursor-family allowlist, so cached rows that
// filed unknown vendors such as DeepSeek under Cursor Models are re-probed.
export const cursorStatusCachePolicy = { kind: "cursor", minimumVersion: 84 };
