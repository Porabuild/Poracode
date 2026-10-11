import { expect, it } from "vitest";
import { joinRuntimeShutdown } from "./joinRuntimeShutdown";

it("stops every participant and retains the barrier after one stop throws", async () => {
  const second = Promise.withResolvers<void>();
  const calls: string[] = [];
  const error = new Error("fixture stop failure");
  const joining = joinRuntimeShutdown([
    () => {
      calls.push("first");
      throw error;
    },
    () => {
      calls.push("second");
      return second.promise;
    },
    () => {
      calls.push("third");
    },
  ]);
  let settled = false;
  void joining.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  expect(calls).toEqual(["first", "second", "third"]);
  await Promise.resolve();
  expect(settled).toBe(false);
  second.resolve();
  await expect(joining).rejects.toMatchObject({ errors: [error] });
});
