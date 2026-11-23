// v79 refreshes the permission posture as well as v78's thinking controls.
// `update.latestVersionUrls` needs no bump: the probe reads the live adapter,
// and a cached `update` without it still resolves to the installer.
export const kimiStatusCachePolicy = { kind: "kimi", minimumVersion: 79 };
