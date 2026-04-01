import { describe, expect, it, beforeEach } from "vitest";
import { serializeComposerContent } from "./serializeMentions";

describe("serializeComposerContent", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("serializes plain text", () => {
    container.textContent = "hello world";
    expect(serializeComposerContent(container)).toBe("hello world");
  });

  it("trims whitespace", () => {
    container.textContent = "  hello  ";
    expect(serializeComposerContent(container)).toBe("hello");
  });

  it("serializes mention chips as @path", () => {
    container.appendChild(document.createTextNode("check "));
    const chip = document.createElement("span");
    chip.dataset.mentionPath = "src/main.ts";
    chip.textContent = "main.ts"; // visible label, should be ignored
    container.appendChild(chip);
    container.appendChild(document.createTextNode(" please"));

    expect(serializeComposerContent(container)).toBe("check @src/main.ts please");
  });

  it("serializes BR as newline", () => {
    container.appendChild(document.createTextNode("line one"));
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createTextNode("line two"));

    expect(serializeComposerContent(container)).toBe("line one\nline two");
  });

  it("serializes nested DIVs (contentEditable newlines) as newlines", () => {
    const div1 = document.createElement("div");
    div1.textContent = "line one";
    const div2 = document.createElement("div");
    div2.textContent = "line two";
    container.appendChild(div1);
    container.appendChild(div2);

    expect(serializeComposerContent(container)).toBe("line one\nline two");
  });

  it("handles multiple chips interspersed with text", () => {
    container.appendChild(document.createTextNode("fix "));
    const chip1 = document.createElement("span");
    chip1.dataset.mentionPath = "src/a.ts";
    container.appendChild(chip1);
    container.appendChild(document.createTextNode(" and "));
    const chip2 = document.createElement("span");
    chip2.dataset.mentionPath = "src/b.ts";
    container.appendChild(chip2);

    expect(serializeComposerContent(container)).toBe("fix @src/a.ts and @src/b.ts");
  });

  it("handles empty container", () => {
    expect(serializeComposerContent(container)).toBe("");
  });

  it("handles chip-only content", () => {
    const chip = document.createElement("span");
    chip.dataset.mentionPath = "README.md";
    container.appendChild(chip);

    expect(serializeComposerContent(container)).toBe("@README.md");
  });
});
