import { expect, it } from "vitest";
import {
  resetWindowsCredentialPresenceCacheForTests,
  windowsCredentialTargetExists,
} from "./windowsClaudeVault";

it("reports a Credential Manager target that is not stored as absent", async () => {
  resetWindowsCredentialPresenceCacheForTests();
  await expect(windowsCredentialTargetExists(`poracode-absent-target-${Date.now()}`)).resolves.toBe(
    false,
  );
});
