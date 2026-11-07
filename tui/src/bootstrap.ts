import { parseTuiBootstrap } from "@/shared/tuiBootstrap";

export {
  TUI_BOOTSTRAP_VERSION,
  UnsupportedTuiBootstrapVersionError,
  type TuiBootstrap,
} from "@/shared/tuiBootstrap";

export function readTuiBootstrap() {
  const input = process.env.PORACODE_TUI_BOOTSTRAP;
  delete process.env.PORACODE_TUI_BOOTSTRAP;
  if (!input) throw new Error("PORACODE_TUI_BOOTSTRAP is required");
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("PORACODE_TUI_BOOTSTRAP must be valid JSON");
  }
  return parseTuiBootstrap(value);
}
