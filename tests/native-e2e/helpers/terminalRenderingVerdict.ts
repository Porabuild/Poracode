/** Report the observed outputs, independently of PTY delivery and generation. */
export function terminalRenderingVerdict(input: {
  readonly firstOutputFound: boolean;
  readonly secondOutputFound: boolean;
  readonly productionDefectRecorded: boolean;
}): "rendered-pass" | "rendered-output-missing" | "production-defect-reported" {
  if (input.productionDefectRecorded) return "production-defect-reported";
  return input.firstOutputFound && input.secondOutputFound
    ? "rendered-pass"
    : "rendered-output-missing";
}
