import { expect, it } from "vitest";
import { toolPresentationAdapter } from "./toolPresentation";

it("removes SDK namespace decoration while preserving ordinary server identifiers", () => {
  const normalize = toolPresentationAdapter.normalizeMcpServerIdentifier!;
  expect(normalize("claude_ai_My_Docs")).toBe("My_Docs");
  expect(normalize("plugin_vendor_issue_tracker")).toBe("issue_tracker");
  expect(normalize("claude_ai_plugin_vendor_my_docs")).toBe("my_docs");
  expect(normalize("plain_server")).toBeUndefined();
  expect(normalize("plugin_incomplete")).toBeUndefined();
});

it("decodes SDK workflow rejections behind the display hook", () => {
  const decode = toolPresentationAdapter.workflowResultErrorText!;
  expect(decode("<tool_use_error>  rejected  </tool_use_error>")).toBe("rejected");
  expect(decode("<TOOL_USE_ERROR></TOOL_USE_ERROR>")).toBe("");
  expect(decode("ordinary output")).toBeUndefined();
});
