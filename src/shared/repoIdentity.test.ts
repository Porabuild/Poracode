import { describe, expect, it } from "vitest";
import type { GitRemoteInfo } from "./contracts";
import { repoIdentityKey } from "./repoIdentity";

const remote = (url: string, owner = "me", repo = "app"): GitRemoteInfo => ({
  url,
  platform: "github",
  owner,
  repo,
});

describe("repoIdentityKey", () => {
  it("is null until a usable origin is known", () => {
    expect(repoIdentityKey(null)).toBeNull();
    expect(repoIdentityKey(undefined)).toBeNull();
    expect(repoIdentityKey(remote("https://github.com/me/app.git", " "))).toBeNull();
    expect(repoIdentityKey(remote("https://github.com/me/app.git", "me", ""))).toBeNull();
  });

  it("treats ssh and https forms of one repository alike, case-insensitively", () => {
    expect(repoIdentityKey(remote("git@github.com:Me/App.git"))).toBe(
      repoIdentityKey(remote("https://github.com/me/app")),
    );
  });

  it("keeps the same path on another host distinct", () => {
    expect(repoIdentityKey(remote("https://git.example.com/me/app.git"))).not.toBe(
      repoIdentityKey(remote("https://github.com/me/app.git")),
    );
  });
});
