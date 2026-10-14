/** Owned one-shot fixture: hold through SIGTERM so real SIGKILL/close is late. */
import { appendFileSync } from "node:fs";
const trace = (event, fields = {}) =>
  appendFileSync(
    process.env.ORCHESTRATION_TRACE,
    JSON.stringify({ event, pid: process.pid, sessionId: `oneshot-${process.pid}`, ...fields }) +
      "\n",
  );
trace("started");
process.on("exit", () => trace("exit"));
process.on("SIGTERM", () => trace("cancel"));
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > 65536) process.exit(2);
});
process.stdin.on("end", () => {
  const line = input.split("\n").find((value) => value.startsWith("ORCHESTRATION_PLAN="));
  const plan = JSON.parse(line?.slice("ORCHESTRATION_PLAN=".length) ?? "{}");
  trace("prompt", { label: plan.label });
  if (plan.holdMs) {
    setInterval(() => {}, 1000);
    process.stdout.write("owned one-shot ready\n");
  } else {
    process.stdout.write("one-shot completed\n", () => process.exit(0));
  }
});
