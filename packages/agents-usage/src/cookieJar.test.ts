import { describe, expect, it } from "vitest";
import { applySetCookies, CookieJar, parseCookieHeader, parseSetCookie } from "./cookieJar";

describe("parseCookieHeader", () => {
  it("keeps insertion order and tolerates padding and empty segments", () => {
    expect([...parseCookieHeader(" a=1;; b = 2 ; c=3 ")]).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ]);
  });

  it("skips segments with no name", () => {
    expect([...parseCookieHeader("=orphan; a=1")]).toEqual([["a", "1"]]);
  });

  it("keeps a value containing '=' intact", () => {
    expect(parseCookieHeader("t=abc==").get("t")).toBe("abc==");
  });
});

describe("parseSetCookie", () => {
  it("reads the name/value pair and ignores attributes", () => {
    expect(parseSetCookie("login_aliyunid_ticket=fresh; Path=/; HttpOnly; Secure")).toEqual({
      name: "login_aliyunid_ticket",
      value: "fresh",
      deleted: false,
    });
  });

  it("treats an empty value or a non-positive Max-Age as a deletion", () => {
    expect(parseSetCookie("sid=; Path=/")?.deleted).toBe(true);
    expect(parseSetCookie("sid=x; Max-Age=0")?.deleted).toBe(true);
    expect(parseSetCookie("sid=x; max-age=-1")?.deleted).toBe(true);
    expect(parseSetCookie("sid=x; Max-Age=3600")?.deleted).toBe(false);
  });

  it("rejects malformed lines", () => {
    expect(parseSetCookie("novalue")).toBeUndefined();
    expect(parseSetCookie("=orphan")).toBeUndefined();
  });
});

describe("applySetCookies", () => {
  it("reports no change when the server repeats the value it was sent", () => {
    const cookies = parseCookieHeader("a=1");
    expect(applySetCookies(cookies, ["a=1; Path=/"])).toBe(false);
  });

  it("adds, replaces, and removes without disturbing untouched cookies", () => {
    const cookies = parseCookieHeader("a=1; b=2");
    expect(applySetCookies(cookies, ["b=3", "c=4", "a=; Max-Age=0"])).toBe(true);
    expect([...cookies]).toEqual([
      ["b", "3"],
      ["c", "4"],
    ]);
  });

  it("ignores a deletion for a cookie it never held", () => {
    const cookies = parseCookieHeader("a=1");
    expect(applySetCookies(cookies, ["gone=; Max-Age=0"])).toBe(false);
  });
});

describe("CookieJar", () => {
  it("starts unrotated and round-trips the captured header", () => {
    const jar = new CookieJar("login_aliyunid_ticket=old; cna=anon");
    expect(jar.rotated).toBe(false);
    expect(jar.header).toBe("login_aliyunid_ticket=old; cna=anon");
  });

  it("absorbs a rotated ticket and reports it, leaving other cookies in place", () => {
    const jar = new CookieJar("login_aliyunid_ticket=old; cna=anon");
    jar.absorb({ setCookies: ["login_aliyunid_ticket=new; Path=/; HttpOnly"] });
    expect(jar.rotated).toBe(true);
    expect(jar.header).toBe("login_aliyunid_ticket=new; cna=anon");
  });

  it("stays unrotated for missing, empty, or echoed Set-Cookie values", () => {
    const jar = new CookieJar("a=1");
    jar.absorb(undefined);
    jar.absorb({});
    jar.absorb({ setCookies: [] });
    jar.absorb({ setCookies: ["a=1"] });
    expect(jar.rotated).toBe(false);
    expect(jar.header).toBe("a=1");
  });

  it("stays rotated once a later response changes nothing", () => {
    const jar = new CookieJar("a=1");
    jar.absorb({ setCookies: ["a=2"] });
    jar.absorb({ setCookies: ["a=2"] });
    expect(jar.rotated).toBe(true);
    expect(jar.header).toBe("a=2");
  });
});
