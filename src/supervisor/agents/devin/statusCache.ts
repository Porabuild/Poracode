// v69 adds the goal thread-title command, including configured profiles.
// v74 stops effort-less catalog families (Adaptive, Claude Opus/Sonnet 4.6,
// Kimi K2.6/K2.7, SWE-1.6) from inheriting the negotiated global thought
// ladder in the GUI override: a v73 row still advertises "medium" for them,
// a level the live session has no select for, so it must be re-probed.
export const devinStatusCachePolicy = { kind: "devin", minimumVersion: 74 };
