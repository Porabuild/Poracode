import { describe, expect, it } from "vitest";
import type { GitRemoteInfo } from "./contracts";
import { isUnconfirmedSshOrigin, repoIdentityKey } from "./repoIdentity";

const remote = (url: string, owner = "me", repo = "app"): GitRemoteInfo => ({
  url,
  platform: "github",
  owner,
  repo,
});

describe("isUnconfirmedSshOrigin", () => {
  it.each([
    "git@github.com:me/app.git",
    "git@github.com-SDSLeon:me/app.git",
    "github.com-work:me/app.git",
    "gh-personal:me/app.git",
    "ssh://git@github.com/me/app.git",
    "SSH://git@gh-personal/me/app.git",
  ])("treats %s as a raw SSH/SCP origin", (url) => {
    expect(isUnconfirmedSshOrigin(url)).toBe(true);
  });

  it.each([
    "https://github.com/me/app.git",
    "http://git.example.com/me/app.git",
    "HTTPS://github.com-SDSLeon/me/app.git",
  ])("treats %s as a transferred HTTP(S) origin", (url) => {
    expect(isUnconfirmedSshOrigin(url)).toBe(false);
  });
});

describe("repoIdentityKey", () => {
  it("is null until a usable origin is known", () => {
    expect(repoIdentityKey(null)).toBeNull();
    expect(repoIdentityKey(undefined)).toBeNull();
    expect(repoIdentityKey(remote("https://github.com/me/app.git", " "))).toBeNull();
    expect(repoIdentityKey(remote("https://github.com/me/app.git", "me", ""))).toBeNull();
  });

  it.each([
    ["public GitHub SCP", "git@github.com:me/app.git"],
    ["account alias", "git@github.com-SDSLeon:me/app.git"],
    ["arbitrary account alias", "git@github.com-work:me/app.git"],
    ["personal alias", "git@gh-personal:me/app.git"],
    ["forge-named alias", "git@gitlab-work:me/app.git"],
    ["dotted enterprise alias", "git@github.com-SDSLeon.example:me/app.git"],
    ["raw enterprise SSH", "git@git.example.com:me/app.git"],
    ["raw canonical SSH URL", "ssh://git@github.com/me/app.git"],
    ["case-insensitive SSH scheme", "SSH://git@gh-personal/me/app.git"],
    ["raw Azure SSH", "git@ssh.dev.azure.com:v3/org/project/repo"],
  ])("keeps a raw SSH/SCP origin unconfirmed (%s)", (_label, url) => {
    expect(repoIdentityKey(remote(url))).toBeNull();
  });

  it("matches HTTP(S) canonical forms regardless of case and trailing .git", () => {
    expect(repoIdentityKey(remote("https://github.com/Me/App.git"))).toBe(
      repoIdentityKey(remote("https://github.com/me/app")),
    );
  });

  it("keeps an HTTPS host that looks like an alias distinct and known", () => {
    const alias = repoIdentityKey(remote("https://github.com-SDSLeon/me/app.git"));
    expect(alias).not.toBeNull();
    expect(alias).not.toBe(repoIdentityKey(remote("https://github.com/me/app.git")));
  });

  it("keeps the same path on another confirmed host distinct", () => {
    expect(repoIdentityKey(remote("https://git.example.com/me/app.git"))).not.toBe(
      repoIdentityKey(remote("https://github.com/me/app.git")),
    );
  });

  it.each([
    ["https://gitlab.com/group/one/app.git", "https://gitlab.com/group/two/app.git"],
    [
      "https://dev.azure.com/first/project/_git/app",
      "https://dev.azure.com/second/project/_git/app",
    ],
    ["https://git.example/gitlab/team/app.git", "https://git.example/other/team/app.git"],
  ])("preserves the full repository and deployment identity for %s", (first, second) => {
    expect(repoIdentityKey(remote(first))).not.toBe(repoIdentityKey(remote(second)));
  });
});
