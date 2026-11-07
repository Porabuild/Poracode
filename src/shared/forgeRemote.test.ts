import { describe, expect, it } from "vitest";
import { parseGitRemoteFetchLine } from "./forgeRemote";

describe("parseGitRemoteFetchLine", () => {
  const url = "git@github.com:Porabuild/Poracode.git";

  it("parses a normal clone's fetch line", () => {
    expect(parseGitRemoteFetchLine(`origin\t${url} (fetch)`)).toEqual({ name: "origin", url });
  });

  it.each([
    "[blob:none]",
    "[tree:0]",
    "[blob:limit=1m]",
    "[combine:blob:none+tree:0]",
    "[sparse:oid=master]",
  ])("accepts the partial-clone filter suffix %s", (filter) => {
    expect(parseGitRemoteFetchLine(`origin\t${url} (fetch) ${filter}`)).toEqual({
      name: "origin",
      url,
    });
  });

  it("tolerates a trailing carriage return", () => {
    expect(parseGitRemoteFetchLine(`origin\t${url} (fetch) [blob:none]\r`)).toEqual({
      name: "origin",
      url,
    });
  });

  it.each([`origin\t${url} (push)`, `origin\t${url} (push) [blob:none]`, "", `origin\t${url}`])(
    "rejects a line that is not a fetch line: %j",
    (line) => {
      expect(parseGitRemoteFetchLine(line)).toBeNull();
    },
  );

  it("rejects a fetch line with unrelated trailing text", () => {
    expect(parseGitRemoteFetchLine(`origin\t${url} (fetch) extra`)).toBeNull();
  });
});
