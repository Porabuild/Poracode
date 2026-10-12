import { describe, expect, it } from "vitest";
import { SyntaxHighlightCache } from "./syntaxHighlightCache";

describe("syntax highlight string retention", () => {
  it("evicts by total source and markup size before the entry limit", () => {
    const cache = new SyntaxHighlightCache(200, 20);
    cache.set("aa", "bbb");
    cache.set("cc", "ddd");
    cache.set("ee", "fff");
    expect(cache.get("aa")).toBeUndefined();
    expect(cache.get("cc")).toBe("ddd");
    expect(cache.get("ee")).toBe("fff");
  });

  it("counts UTF-16 surrogate pairs and preserves recent reads", () => {
    const cache = new SyntaxHighlightCache(2, 16);
    cache.set("a", "😀");
    cache.set("b", "😀");
    expect(cache.get("a")).toBe("😀");
    cache.set("c", "😀");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("😀");
    expect(cache.get("c")).toBe("😀");
  });

  it("declines oversized entries without evicting other useful results", () => {
    const cache = new SyntaxHighlightCache(200, 20);
    cache.set("a", "cached");
    cache.set("giant", "x".repeat(11));
    expect(cache.get("giant")).toBeUndefined();
    expect(cache.get("a")).toBe("cached");
  });

  it("releases the old charge on replacement and oversized replacement", () => {
    const cache = new SyntaxHighlightCache(200, 20);
    cache.set("a", "123456789");
    cache.set("a", "1");
    cache.set("b", "1234567");
    expect(cache.get("a")).toBe("1");
    expect(cache.get("b")).toBe("1234567");
    cache.set("b", "x".repeat(20));
    cache.set("c", "1234567");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("1");
    expect(cache.get("c")).toBe("1234567");
  });
});
