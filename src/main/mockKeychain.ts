interface MockKeychainOptions {
  isDev: boolean;
  platform?: string;
  requested?: string;
}

export function shouldUseMockKeychain({
  isDev,
  platform = process.platform,
  requested = process.env.PORACODE_USE_MOCK_KEYCHAIN,
}: MockKeychainOptions): boolean {
  return isDev && platform === "darwin" && requested === "1";
}
