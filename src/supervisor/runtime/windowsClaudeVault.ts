import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { windowsPowershellPath } from "./windowsPowershell";

const execFileAsync = promisify(execFile);

/**
 * Reads the Claude Code OAuth credential blob from the Windows Credential
 * Manager, for the native-Windows case where Claude Code stores its token there
 * instead of `~/.claude/.credentials.json` (Win-CodexBar issue #22).
 *
 * There is no built-in Windows CLI that returns a generic credential's secret,
 * and a native CredRead binding would worsen this repo's native-packaging
 * story — so we shell out to a one-shot PowerShell that P/Invokes
 * `CredEnumerate`/`CredFree`. It is naming-agnostic: it enumerates the user's
 * generic credentials and matches on blob content (`claudeAiOauth`) rather than
 * a guessed target name. Best-effort — any failure returns undefined and the
 * caller falls back to "not signed in". The secret is read into memory and
 * parsed by the caller; it is never logged.
 */

// No backticks or `${` in this script, so it is safe inside a template literal.
// The C# here-string `"@` terminator must stay at column 0.
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class LcCredMan {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredEnumerateW")]
  static extern bool CredEnumerate(string filter, int flag, out int count, out IntPtr pCredentials);
  [DllImport("advapi32")] static extern void CredFree(IntPtr cred);
  public static List<string> Find() {
    var results = new List<string>();
    int count; IntPtr pCreds;
    if (!CredEnumerate(null, 0x1, out count, out pCreds)) { return results; }
    try {
      for (int i = 0; i < count; i++) {
        IntPtr p = Marshal.ReadIntPtr(pCreds, i * IntPtr.Size);
        CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
        if (c.CredentialBlobSize == 0 || c.CredentialBlob == IntPtr.Zero) { continue; }
        string secret = Marshal.PtrToStringUni(c.CredentialBlob, (int)(c.CredentialBlobSize / 2));
        if (secret == null) { continue; }
        string target = c.TargetName == null ? "" : c.TargetName;
        bool looksClaude = secret.IndexOf("claudeAiOauth", StringComparison.OrdinalIgnoreCase) >= 0
          || (target.IndexOf("laude", StringComparison.OrdinalIgnoreCase) >= 0
              && secret.IndexOf("accessToken", StringComparison.OrdinalIgnoreCase) >= 0);
        if (looksClaude) { results.Add(secret); }
      }
    } finally { CredFree(pCreds); }
    return results;
  }
}
"@
$found = [LcCredMan]::Find()
if ($found.Count -gt 0) { [Console]::Out.Write($found[0]) }
`;

const PS_READ_TARGET_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$targetName = $env:LIGHTCODE_CRED_TARGET
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class LcCredReadTarget {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32", SetLastError=true, CharSet=CharSet.Unicode, EntryPoint="CredReadW")]
  static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);
  [DllImport("advapi32")] static extern void CredFree(IntPtr cred);
  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) { return null; }
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if (c.CredentialBlobSize == 0 || c.CredentialBlob == IntPtr.Zero) { return ""; }
      byte[] bytes = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, bytes, 0, bytes.Length);
      return System.Text.Encoding.UTF8.GetString(bytes);
    } finally { CredFree(p); }
  }
}
"@
$secret = [LcCredReadTarget]::Read($targetName)
if ($secret) { [Console]::Out.Write($secret) }
`;

export async function readClaudeCredentialsFromWindowsVault(): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined;
  const powershell = windowsPowershellPath();
  try {
    const encoded = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");
    const { stdout } = await execFileAsync(
      powershell,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { timeout: 6_000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const out = stdout.trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export async function readWindowsCredentialTarget(targetName: string): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined;
  const powershell = windowsPowershellPath();
  try {
    const encoded = Buffer.from(PS_READ_TARGET_SCRIPT, "utf16le").toString("base64");
    const { stdout } = await execFileAsync(
      powershell,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      {
        timeout: 6_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, LIGHTCODE_CRED_TARGET: targetName },
      },
    );
    const out = stdout.trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}
