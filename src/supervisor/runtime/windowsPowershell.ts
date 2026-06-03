import { getWindowsSystemCommand } from "../agents/base/shellBasics";

/**
 * Absolute path to Windows PowerShell, resolved from `%SystemRoot%` rather than
 * relying on `powershell.exe` being on PATH — PATH can be hijacked or stripped.
 * Delegates to the shared system-command path builder so the SystemRoot/windir
 * resolution lives in one place. Windows-only; callers guard on `process.platform`.
 */
export function windowsPowershellPath(): string {
  return getWindowsSystemCommand("WindowsPowerShell\\v1.0\\powershell.exe");
}
