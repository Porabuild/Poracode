import { expect, it } from "vitest";
import { validStructuredValue } from "./structuredForm";

it("leaves untrusted regex validation to the provider without evaluating it locally", () => {
  expect(
    validStructuredValue({ type: "string", pattern: "^(a+)+$" }, "a".repeat(100) + "!", true),
  ).toBe(true);
});
