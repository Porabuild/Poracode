// Manual-gate ledger statuses for poracode-integration-smoke.mjs:
// - "required" — the gate has not run yet (mock) or is still owed (real);
// - "mocked" — the deterministic mock check passed;
// - "fail" — the gate's check failed or cannot run in this mode;
// - "acknowledged" — real gate exercised and recorded via --ack-manual.

/** Records one gate's actual outcome on the manual ledger. */
export function recordManualGate(report, gate, status, detail) {
  const row = report.manual.find((item) => item.gate === gate);
  if (!row) throw new Error(`manual gate is not part of the report: ${gate}`);
  row.status = status;
  row.detail = detail;
}

/**
 * Final stamping pass. Mock outcomes were already recorded per gate, so failed
 * and not-run gates are left as they ran. Real mode promotes only required
 * gates listed via --ack-manual.
 */
export function finalizeManualOutcomes(report, { mode, acknowledged = [] }) {
  const ack = acknowledged instanceof Set ? acknowledged : new Set(acknowledged);
  for (const item of report.manual) {
    if (mode !== "real") continue;
    if (item.status === "required" && ack.has(item.gate)) item.status = "acknowledged";
  }
}
