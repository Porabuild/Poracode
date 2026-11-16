// v81 refreshes Gemini observations after preserving login-shell PATH and probe
// cwd in capabilitiesProbe, detecting macOS Keychain API-key auth, and
// enforcing GEMINI_FORCE_FILE_STORAGE isolation for gemini:<id> profiles.
export const geminiStatusCachePolicy = { kind: "gemini", minimumVersion: 81 };
