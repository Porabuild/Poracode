import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ComputerUseApp,
  ComputerUseDriver,
  ComputerUseDriverStatus,
  ComputerUseInteractiveResult,
  ComputerUseListAppsInput,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "../mcp/types";
import { legacyElementRefusal } from "./common";
import { PersistentJsonLineHost } from "./jsonLineHost";
import { validateWindowsLaunchAppInput } from "./launchAppValidation";

const WINDOWS_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
# Long-lived host: compile the native shim ONCE, then serve newline-delimited
# JSON requests over stdin/stdout. Force UTF-8 on stdout so response strings
# (titles, notes, emoji) survive; the Node side ASCII-escapes every request so
# the stdin code page is irrelevant. Warnings go to stderr to keep stdout pure
# NDJSON.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$WarningPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class PoracodeComputerUseNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public int type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(uint dwProcessId);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint MOUSEEVENTF_HWHEEL = 0x01000;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;

  public static List<IntPtr> Windows() {
    var windows = new List<IntPtr>();
    EnumWindows((hWnd, lParam) => {
      windows.Add(hWnd);
      return true;
    }, IntPtr.Zero);
    return windows;
  }

  private static INPUT UnicodeInput(char unit, bool up) {
    var input = new INPUT();
    input.type = 1;
    input.U.ki.wScan = unit;
    input.U.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
    return input;
  }

  public static void SendUnicodeText(string text) {
    if (String.IsNullOrEmpty(text)) return;
    var inputs = new List<INPUT>(text.Length * 2);
    var i = 0;
    while (i < text.Length) {
      var c = text[i];
      if (Char.IsHighSurrogate(c) && i + 1 < text.Length && Char.IsLowSurrogate(text[i + 1])) {
        // Keep a surrogate pair together: both code units down, then both up.
        var lo = text[i + 1];
        inputs.Add(UnicodeInput(c, false));
        inputs.Add(UnicodeInput(lo, false));
        inputs.Add(UnicodeInput(c, true));
        inputs.Add(UnicodeInput(lo, true));
        i += 2;
      } else {
        inputs.Add(UnicodeInput(c, false));
        inputs.Add(UnicodeInput(c, true));
        i += 1;
      }
    }
    var arr = inputs.ToArray();
    if (arr.Length > 0) SendInput((uint)arr.Length, arr, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void Key(ushort vk, bool up) {
    var input = new INPUT[1];
    input[0].type = 1;
    input[0].U.ki.wVk = vk;
    input[0].U.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
    SendInput(1, input, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@

# Make GetWindowRect / capture / SetCursorPos share physical pixels on scaled
# displays. PER_MONITOR_AWARE_V2 = -4. Guard for pre-1703 hosts that lack the API.
try { [void][PoracodeComputerUseNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch {}

$ASFW_ANY = [uint32]"0xFFFFFFFF"

# App-specific launch heuristics, consumed generically by the launch_app handler.
# names:        leaf tokens (lowercase) that select this alias
# tokenPattern: matched against the AUMID token of a shell:AppsFolder target to
#               derive a friendly leaf name
# leaf:         the friendly leaf name used when tokenPattern matches
# targets:      extra Start-Process targets tried when the primary target yields
#               no window (e.g. calc.exe redirects to the Store Calculator)
# hints:        extra title / process-name hints for detecting the redirected window
$launchAliases = @(
  @{
    names = @('calc', 'calculator')
    tokenPattern = 'Calculator'
    leaf = 'Calculator'
    targets = @('shell:AppsFolder\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', 'calculator:')
    hints = @('Calculator', 'CalculatorApp')
  },
  @{
    names = @('notepad')
    tokenPattern = 'Notepad'
    leaf = 'Notepad'
    targets = @()
    hints = @('Notepad')
  }
)

function Get-WindowObject([IntPtr]$hWnd, [switch]$AllowHidden, [hashtable]$ProcessMap) {
  if (-not [PoracodeComputerUseNative]::IsWindow($hWnd)) { return $null }
  if (-not $AllowHidden -and -not [PoracodeComputerUseNative]::IsWindowVisible($hWnd)) { return $null }
  $titleBuilder = [Text.StringBuilder]::new(512)
  [void][PoracodeComputerUseNative]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString()
  if ($title.Trim().Length -eq 0) { return $null }
  $procId = [uint32]0
  [void][PoracodeComputerUseNative]::GetWindowThreadProcessId($hWnd, [ref]$procId)
  if ($null -ne $ProcessMap) {
    $process = $ProcessMap[[int]$procId]
  } else {
    try { $process = Get-Process -Id ([int]$procId) -ErrorAction Stop } catch { $process = $null }
  }
  $rect = New-Object PoracodeComputerUseNative+RECT
  [void][PoracodeComputerUseNative]::GetWindowRect($hWnd, [ref]$rect)
  $width = [Math]::Max(0, $rect.Right - $rect.Left)
  $height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  $app = if ($process -and $process.Path) { $process.Path } elseif ($process) { $process.ProcessName } else { "unknown" }
  $displayName = if ($process) { $process.ProcessName } else { $app }
  [pscustomobject]@{
    app = $app
    displayName = $displayName
    id = [int64]$hWnd
    title = $title
    x = $rect.Left
    y = $rect.Top
    width = $width
    height = $height
  }
}

# Project a window record into the wire shape shared by every action response.
# Field names and order are the serialized JSON contract — keep them stable.
function Select-Window($w) {
  [pscustomobject]@{ app = $w.app; id = $w.id; title = $w.title; x = $w.x; y = $w.y; width = $w.width; height = $w.height }
}

function Get-WindowList {
  # Snapshot processes once per listing instead of one Get-Process -Id per window.
  $processMap = @{}
  foreach ($proc in (Get-Process)) { $processMap[[int]$proc.Id] = $proc }
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($hWnd in [PoracodeComputerUseNative]::Windows()) {
    $window = Get-WindowObject $hWnd -ProcessMap $processMap
    if ($null -ne $window -and $window.width -gt 0 -and $window.height -gt 0) {
      $items.Add($window)
    }
  }
  $items
}

function Window-MatchesApp($candidate, [string]$wantedApp) {
  if (-not $wantedApp) { return $true }
  if ([string]::Equals([string]$candidate.app, $wantedApp, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  $wantedLeaf = [IO.Path]::GetFileNameWithoutExtension($wantedApp)
  if (-not $wantedLeaf) { return $false }
  if ([string]::Equals($candidate.displayName, $wantedLeaf, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  if ($candidate.app -and [IO.Path]::GetFileNameWithoutExtension([string]$candidate.app) -ieq $wantedLeaf) { return $true }
  return $false
}

function Recover-Window($req) {
  $wantedApp = if ($req.app) { [string]$req.app } else { $null }
  $wantedTitle = if ($req.title) { [string]$req.title } else { $null }
  for ($recover = 0; $recover -lt 8; $recover++) {
    $matches = New-Object System.Collections.Generic.List[object]
    foreach ($candidate in (Get-WindowList)) {
      if (-not (Window-MatchesApp $candidate $wantedApp)) { continue }
      $matches.Add($candidate)
    }
    if ($matches.Count -gt 0) {
      # Prefer exact-title matches when possible, then choose foreground/largest
      # within that pool. WinUI apps can expose duplicate localized titles.
      $pool = $matches
      if ($wantedTitle) {
        $titleMatches = New-Object System.Collections.Generic.List[object]
        foreach ($candidate in $matches) {
          if ([string]::Equals([string]$candidate.title, $wantedTitle, [StringComparison]::OrdinalIgnoreCase)) {
            $titleMatches.Add($candidate)
          }
        }
        if ($titleMatches.Count -gt 0) { $pool = $titleMatches }
      }
      $fg = [PoracodeComputerUseNative]::GetForegroundWindow()
      foreach ($candidate in $pool) {
        if ([IntPtr]([int64]$candidate.id) -eq $fg) { return $candidate }
      }
      $best = $null
      $bestArea = -1
      foreach ($candidate in $pool) {
        $area = [int]$candidate.width * [int]$candidate.height
        if ($area -gt $bestArea) { $best = $candidate; $bestArea = $area }
      }
      return $best
    }
    Start-Sleep -Milliseconds 100
  }
  return $null
}

function Require-Window($req) {
  $hWnd = [IntPtr]([int64]$req.id)
  # Exact id: allow temporarily-hidden windows (WinUI tab shells often flip
  # visibility during activation) so we can still activate/recover them.
  $window = Get-WindowObject $hWnd -AllowHidden
  if ($null -ne $window) {
    if ($req.app -and -not (Window-MatchesApp $window ([string]$req.app))) {
      throw "Window app no longer matches the requested app."
    }
    return $window
  }
  $recovered = Recover-Window $req
  if ($null -ne $recovered) { return $recovered }
  throw "Window is no longer available. Call list_windows or get_window for a fresh id and retry."
}

function Try-SetForeground([IntPtr]$hWnd) {
  [void][PoracodeComputerUseNative]::AllowSetForegroundWindow($ASFW_ANY)
  $fg = [PoracodeComputerUseNative]::GetForegroundWindow()
  $fgPid = [uint32]0
  $fgThread = [PoracodeComputerUseNative]::GetWindowThreadProcessId($fg, [ref]$fgPid)
  $cur = [PoracodeComputerUseNative]::GetCurrentThreadId()
  $attached = $false
  if ($fgThread -ne $cur) { $attached = [PoracodeComputerUseNative]::AttachThreadInput($fgThread, $cur, $true) }
  try {
    [void][PoracodeComputerUseNative]::BringWindowToTop($hWnd)
    [void][PoracodeComputerUseNative]::SetForegroundWindow($hWnd)
  } finally {
    if ($attached) { [void][PoracodeComputerUseNative]::AttachThreadInput($fgThread, $cur, $false) }
  }
}

function Find-WindowByProcessId([uint32]$targetPid, [int64]$preferId) {
  $fallback = $null
  $fg = [PoracodeComputerUseNative]::GetForegroundWindow()
  foreach ($candidateHwnd in [PoracodeComputerUseNative]::Windows()) {
    $wPid = [uint32]0
    [void][PoracodeComputerUseNative]::GetWindowThreadProcessId($candidateHwnd, [ref]$wPid)
    if ($wPid -ne $targetPid) { continue }
    $candidate = Get-WindowObject $candidateHwnd -AllowHidden
    if ($null -eq $candidate -or $candidate.width -le 0 -or $candidate.height -le 0) { continue }
    if ([int64]$candidate.id -eq $preferId) { return $candidate }
    if ($candidateHwnd -eq $fg) { return $candidate }
    if ($null -eq $fallback -and [PoracodeComputerUseNative]::IsWindowVisible($candidateHwnd)) {
      $fallback = $candidate
    }
  }
  return $fallback
}

function Activate-Window($window) {
  $hWnd = [IntPtr]([int64]$window.id)
  $ownerPid = [uint32]0
  [void][PoracodeComputerUseNative]::GetWindowThreadProcessId($hWnd, [ref]$ownerPid)
  # SW_RESTORE (9) un-maximizes a maximized window, which would move/resize it
  # AFTER the agent's screenshot and break coordinate math. Only restore when the
  # window is actually minimized; otherwise SW_SHOW (5) leaves geometry untouched.
  if ([PoracodeComputerUseNative]::IsIconic($hWnd)) {
    [void][PoracodeComputerUseNative]::ShowWindow($hWnd, 9)
    Start-Sleep -Milliseconds 40
  } else {
    [void][PoracodeComputerUseNative]::ShowWindow($hWnd, 5)
  }
  $activated = $false
  $usedAlt = $false
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    # Some WinUI/Store apps destroy the HWND mid-activation and recreate it.
    # Re-resolve by owning PID before each attempt so we don't chase a dead handle.
    if (-not [PoracodeComputerUseNative]::IsWindow($hWnd)) {
      $replacement = Find-WindowByProcessId $ownerPid ([int64]$window.id)
      if ($null -eq $replacement) { break }
      $hWnd = [IntPtr]([int64]$replacement.id)
      $window = $replacement
    }
    if ([PoracodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) { $activated = $true; break }
    # Prefer AttachThreadInput alone. The Alt nudge releases the foreground lock
    # but leaves many apps (WinUI / Store Notepad) in menu mode so type_text is
    # swallowed by the menu bar — only use it as a fallback.
    Try-SetForeground $hWnd
    Start-Sleep -Milliseconds 60
    if ([PoracodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) { $activated = $true; break }
    $usedAlt = $true
    # KEYEVENTF_EXTENDEDKEY (1) matches the documented Alt unlock sequence.
    [PoracodeComputerUseNative]::keybd_event(0x12, 0, 1, [UIntPtr]::Zero)
    [PoracodeComputerUseNative]::keybd_event(0x12, 0, 3, [UIntPtr]::Zero)
    Try-SetForeground $hWnd
    Start-Sleep -Milliseconds 60
    if ([PoracodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) { $activated = $true; break }
  }
  # Final HWND recovery: activation may have succeeded on a replacement window
  # that became foreground under the same process.
  if (-not [PoracodeComputerUseNative]::IsWindow($hWnd) -or -not $activated) {
    $replacement = Find-WindowByProcessId $ownerPid ([int64]$window.id)
    if ($null -ne $replacement) {
      $hWnd = [IntPtr]([int64]$replacement.id)
      $window = $replacement
      if ([PoracodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) {
        $activated = $true
      } elseif (-not $activated) {
        Try-SetForeground $hWnd
        Start-Sleep -Milliseconds 60
        if ([PoracodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) { $activated = $true }
      }
    }
  }
  if (-not $activated) {
    throw "Focus did not reach the target window. The desktop may be locked or another secure surface may be active."
  }
  if ($usedAlt) {
    # Dismiss menu mode left by the Alt nudge so subsequent typing lands in the
    # document/control instead of the File menu accelerator.
    [PoracodeComputerUseNative]::Key(0x1B, $false)
    [PoracodeComputerUseNative]::Key(0x1B, $true)
    Start-Sleep -Milliseconds 40
  }
  # Re-capture the window rect AFTER activation: show/restore may have changed the
  # window geometry. AllowHidden covers WinUI shells that briefly flip visibility
  # while becoming foreground; if the original HWND is gone, recover by PID/FG.
  $fresh = $null
  if ([PoracodeComputerUseNative]::IsWindow($hWnd)) {
    $fresh = Get-WindowObject $hWnd -AllowHidden
  }
  if ($null -eq $fresh) {
    $fresh = Find-WindowByProcessId $ownerPid ([int64]$window.id)
  }
  if ($null -eq $fresh) {
    throw "Window is no longer available (destroyed during activation). Call list_windows or get_window for a fresh id and retry."
  }
  return $fresh
}

function Capture-Window($window, $maxDimension, $format) {
  $hWnd = [IntPtr]([int64]$window.id)
  $srcWidth = [Math]::Max(1, [int]$window.width)
  $srcHeight = [Math]::Max(1, [int]$window.height)
  $bitmap = New-Object Drawing.Bitmap($srcWidth, $srcHeight)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $usedFallback = $false
  $scaledBitmap = $null
  try {
    $hdc = $graphics.GetHdc()
    try {
      $ok = [PoracodeComputerUseNative]::PrintWindow($hWnd, $hdc, 2)
    } finally {
      $graphics.ReleaseHdc($hdc)
    }
    if (-not $ok) {
      $usedFallback = $true
      $graphics.CopyFromScreen([int]$window.x, [int]$window.y, 0, 0, [Drawing.Size]::new($srcWidth, $srcHeight))
    }
    # Downscale (preserving aspect) so passive captures don't bill multi-MB PNGs
    # as image tokens on every get_window_state. Report the ACTUAL encoded pixel
    # size below so click coordinates can be mapped back to window points.
    $scale = 1.0
    $maxDim = [int]$maxDimension
    if ($maxDim -gt 0) {
      $largest = [Math]::Max($srcWidth, $srcHeight)
      if ($largest -gt $maxDim) { $scale = [double]$maxDim / [double]$largest }
    }
    $encWidth = [Math]::Max(1, [int][Math]::Round($srcWidth * $scale))
    $encHeight = [Math]::Max(1, [int][Math]::Round($srcHeight * $scale))
    $encodeBitmap = $bitmap
    if ($encWidth -ne $srcWidth -or $encHeight -ne $srcHeight) {
      $scaledBitmap = New-Object Drawing.Bitmap($encWidth, $encHeight)
      $sg = [Drawing.Graphics]::FromImage($scaledBitmap)
      try {
        $sg.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $sg.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $sg.DrawImage($bitmap, 0, 0, $encWidth, $encHeight)
      } finally {
        $sg.Dispose()
      }
      $encodeBitmap = $scaledBitmap
    }
    $stream = New-Object IO.MemoryStream
    try {
      $fmt = ([string]$format).ToLowerInvariant()
      if ($fmt -eq "png") {
        $encodeBitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        $mime = "image/png"
      } else {
        # JPEG (default) at quality 75 for passive captures. WebP has no
        # .NET Framework encoder, so JPEG is the smallest widely-supported option.
        $jpegCodec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatID -eq [Drawing.Imaging.ImageFormat]::Jpeg.Guid } | Select-Object -First 1
        $encoderParams = [Drawing.Imaging.EncoderParameters]::new(1)
        $encoderParams.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [int64]75)
        try {
          $encodeBitmap.Save($stream, $jpegCodec, $encoderParams)
        } finally {
          $encoderParams.Dispose()
        }
        $mime = "image/jpeg"
      }
      [pscustomobject]@{
        id = "window"
        mimeType = $mime
        data = [Convert]::ToBase64String($stream.ToArray())
        width = $encWidth
        height = $encHeight
        originX = [int]$window.x
        originY = [int]$window.y
        zIndex = 0
        fallback = $usedFallback
        scale = $scale
        sourceWidth = $srcWidth
        sourceHeight = $srcHeight
      }
    } finally {
      $stream.Dispose()
    }
  } finally {
    if ($null -ne $scaledBitmap) { $scaledBitmap.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Resolve-Key($token) {
  $raw = ([string]$token).Trim()
  $t = $raw.ToLowerInvariant()
  switch ($t) {
    "control" { return 0x11 }
    "ctrl" { return 0x11 }
    "control_l" { return 0x11 }
    "control_r" { return 0x11 }
    "shift" { return 0x10 }
    "shift_l" { return 0x10 }
    "shift_r" { return 0x10 }
    "alt" { return 0x12 }
    "alt_l" { return 0x12 }
    "alt_r" { return 0x12 }
    "win" { return 0x5B }
    "super" { return 0x5B }
    "meta" { return 0x5B }
    "cmd" { return 0x5B }
    "return" { return 0x0D }
    "enter" { return 0x0D }
    "tab" { return 0x09 }
    "escape" { return 0x1B }
    "esc" { return 0x1B }
    "space" { return 0x20 }
    "backspace" { return 0x08 }
    "delete" { return 0x2E }
    "insert" { return 0x2D }
    "ins" { return 0x2D }
    "capslock" { return 0x14 }
    "left" { return 0x25 }
    "arrowleft" { return 0x25 }
    "up" { return 0x26 }
    "arrowup" { return 0x26 }
    "right" { return 0x27 }
    "arrowright" { return 0x27 }
    "down" { return 0x28 }
    "arrowdown" { return 0x28 }
    "home" { return 0x24 }
    "end" { return 0x23 }
    "page_up" { return 0x21 }
    "pageup" { return 0x21 }
    "page_down" { return 0x22 }
    "pagedown" { return 0x22 }
    "period" { return 0xBE }
    "comma" { return 0xBC }
    "slash" { return 0xBF }
    "minus" { return 0xBD }
    "plus" { return 0xBB }
    "equal" { return 0xBB }
  }
  if ($t -match '^f([1-9]|1[0-9]|2[0-4])$') { return 0x70 + [int]$Matches[1] - 1 }
  if ($t -match '^kp_([0-9])$' -or $t -match '^numpad_([0-9])$') { return 0x60 + [int]$Matches[1] }
  if ($raw.Length -eq 1) {
    # Return the FULL VkKeyScan result, keeping the shift/ctrl/alt flags in the
    # high byte so Press-Chord can reproduce them (e.g. '!' => shift+1, 'A' => shift+a).
    $vk = [PoracodeComputerUseNative]::VkKeyScan([char]$raw[0])
    if ($vk -eq -1) { throw "Unsupported key: $token" }
    return [int]$vk
  }
  throw "Unsupported key: $token"
}

function Press-Chord($key) {
  $rawKey = ([string]$key).Trim()
  if ($rawKey.Length -eq 0) { throw "key is required" }
  # Splitting on '+' would drop a standalone or trailing literal '+' (e.g. "+"
  # or "ctrl++"); special-case it so the plus key is still emitted.
  if ($rawKey -eq '+') {
    $tokens = @('+')
  } else {
    $tokens = @($rawKey -split '\+' | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
    if ($rawKey.EndsWith('+')) { $tokens += '+' }
  }
  if ($tokens.Count -eq 0) { throw "key is required" }
  $modVks = New-Object System.Collections.Generic.List[uint16]
  $baseVks = New-Object System.Collections.Generic.List[uint16]
  foreach ($tok in $tokens) {
    $val = [int](Resolve-Key $tok)
    $vk = [uint16]($val -band 0xff)
    $mods = ($val -shr 8) -band 0xff
    if (($mods -band 1) -and (-not $modVks.Contains([uint16]0x10))) { $modVks.Add([uint16]0x10) }
    if (($mods -band 2) -and (-not $modVks.Contains([uint16]0x11))) { $modVks.Add([uint16]0x11) }
    if (($mods -band 4) -and (-not $modVks.Contains([uint16]0x12))) { $modVks.Add([uint16]0x12) }
    $baseVks.Add($vk)
  }
  $pressed = New-Object System.Collections.Generic.List[uint16]
  try {
    foreach ($vk in $modVks) { [PoracodeComputerUseNative]::Key($vk, $false); $pressed.Add($vk) }
    foreach ($vk in $baseVks) { [PoracodeComputerUseNative]::Key($vk, $false); $pressed.Add($vk) }
    for ($i = $baseVks.Count - 1; $i -ge 0; $i--) {
      [PoracodeComputerUseNative]::Key($baseVks[$i], $true); [void]$pressed.Remove($baseVks[$i])
    }
    for ($i = $modVks.Count - 1; $i -ge 0; $i--) {
      [PoracodeComputerUseNative]::Key($modVks[$i], $true); [void]$pressed.Remove($modVks[$i])
    }
  } finally {
    # Never leave a key physically down system-wide if we threw mid-sequence.
    for ($i = $pressed.Count - 1; $i -ge 0; $i--) {
      try { [PoracodeComputerUseNative]::Key($pressed[$i], $true) } catch {}
    }
  }
}

function Mouse-Click($button, $count) {
  $down = [PoracodeComputerUseNative]::MOUSEEVENTF_LEFTDOWN
  $up = [PoracodeComputerUseNative]::MOUSEEVENTF_LEFTUP
  $b = ([string]$button).ToLowerInvariant()
  if ($b -eq "right" -or $b -eq "r") {
    $down = [PoracodeComputerUseNative]::MOUSEEVENTF_RIGHTDOWN
    $up = [PoracodeComputerUseNative]::MOUSEEVENTF_RIGHTUP
  } elseif ($b -eq "middle" -or $b -eq "m") {
    $down = [PoracodeComputerUseNative]::MOUSEEVENTF_MIDDLEDOWN
    $up = [PoracodeComputerUseNative]::MOUSEEVENTF_MIDDLEUP
  }
  for ($i = 0; $i -lt [Math]::Max(1, [int]$count); $i++) {
    [PoracodeComputerUseNative]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 20
    [PoracodeComputerUseNative]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  }
}

function Invoke-ComputerUseAction($request) {
$result = $null
switch ([string]$request.action) {
  "list_windows" {
    $result = @(Get-WindowList | ForEach-Object {
      Select-Window $_
    })
  }
  "list_apps" {
    $groups = Get-WindowList | Group-Object app
    $result = @($groups | ForEach-Object {
      $first = $_.Group[0]
      [pscustomobject]@{
        id = $_.Name
        displayName = $first.displayName
        isRunning = $true
        windows = @($_.Group | ForEach-Object {
          Select-Window $_
        })
      }
    })
  }
  "get_window" {
    $window = Require-Window $request.input
    $result = Select-Window $window
  }
  "get_window_state" {
    $window = Require-Window $request.input.window
    $screenshots = @()
    $notes = @("Window listing and screenshots are passive and do not steal focus. Input actions switch to interactive mode, bring the target window to the foreground, and take exclusive control of the mouse/keyboard.")
    if ($request.input.include_screenshot -ne $false) {
      $maxDimension = if ($null -ne $request.input.max_dimension) { [int]$request.input.max_dimension } else { 1280 }
      $format = if ($request.input.format) { [string]$request.input.format } else { "jpeg" }
      $capture = Capture-Window $window $maxDimension $format
      if ($capture.fallback) { $notes += "Passive PrintWindow capture was unavailable; used visible screen-region capture." }
      if ($capture.scale -ne 1.0) {
        $notes += "Screenshot was downscaled to $($capture.width)x$($capture.height) px (scale $($capture.scale)) from the $($capture.sourceWidth)x$($capture.sourceHeight) window to shrink the payload. To convert a coordinate you read from this screenshot into the window-relative coordinate for click/scroll/drag, DIVIDE it by $($capture.scale) (both x and y)."
      }
      $screenshots = @([pscustomobject]@{
        id = $capture.id
        mimeType = $capture.mimeType
        data = $capture.data
        width = $capture.width
        height = $capture.height
        originX = $capture.originX
        originY = $capture.originY
        zIndex = $capture.zIndex
      })
    }
    $accessibility = $null
    if ($request.input.include_text -eq $true) {
      $accessibility = [pscustomobject]@{
        tree = 'Window: "' + $window.title + '", App: ' + $window.app
      }
      $notes += "Detailed UI Automation text is not available in this Poracode helper yet."
    }
    $result = [pscustomobject]@{
      window = Select-Window $window
      accessibility = $accessibility
      screenshots = $screenshots
      mode = "passive"
      notes = $notes
    }
  }
  "activate_window" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    $result = [pscustomobject]@{
      ok = $true
      mode = "interactive"
      window = Select-Window $window
    }
  }
  "click" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    $x = [int]$request.input.x
    $y = [int]$request.input.y
    [void][PoracodeComputerUseNative]::SetCursorPos([int]$window.x + $x, [int]$window.y + $y)
    Mouse-Click $request.input.mouse_button $request.input.click_count
    $result = [pscustomobject]@{
      ok = $true
      mode = "interactive"
      window = Select-Window $window
    }
  }
  "type_text" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    [PoracodeComputerUseNative]::SendUnicodeText([string]$request.input.text)
    $result = [pscustomobject]@{
      ok = $true
      mode = "interactive"
      window = Select-Window $window
    }
  }
  "press_key" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    Press-Chord $request.input.key
    $result = [pscustomobject]@{
      ok = $true
      mode = "interactive"
      window = Select-Window $window
    }
  }
  "scroll" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    [void][PoracodeComputerUseNative]::SetCursorPos([int]$window.x + [int]$request.input.x, [int]$window.y + [int]$request.input.y)
    if ([int]$request.input.scrollY -ne 0) {
      [PoracodeComputerUseNative]::mouse_event([PoracodeComputerUseNative]::MOUSEEVENTF_WHEEL, 0, 0, [uint32](-1 * [int]$request.input.scrollY), [UIntPtr]::Zero)
    }
    if ([int]$request.input.scrollX -ne 0) {
      [PoracodeComputerUseNative]::mouse_event([PoracodeComputerUseNative]::MOUSEEVENTF_HWHEEL, 0, 0, [uint32]([int]$request.input.scrollX), [UIntPtr]::Zero)
    }
    $result = [pscustomobject]@{
      ok = $true
      mode = "interactive"
      window = Select-Window $window
    }
  }
  "drag" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    $downSent = $false
    try {
      [void][PoracodeComputerUseNative]::SetCursorPos([int]$window.x + [int]$request.input.from_x, [int]$window.y + [int]$request.input.from_y)
      [PoracodeComputerUseNative]::mouse_event([PoracodeComputerUseNative]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
      $downSent = $true
      Start-Sleep -Milliseconds 40
      [void][PoracodeComputerUseNative]::SetCursorPos([int]$window.x + [int]$request.input.to_x, [int]$window.y + [int]$request.input.to_y)
      Start-Sleep -Milliseconds 40
      [PoracodeComputerUseNative]::mouse_event([PoracodeComputerUseNative]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
      $downSent = $false
    } finally {
      # Never leave the mouse button physically down if we threw mid-drag.
      if ($downSent) {
        try { [PoracodeComputerUseNative]::mouse_event([PoracodeComputerUseNative]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero) } catch {}
      }
    }
    $result = [pscustomobject]@{
      ok = $true
      mode = "interactive"
      window = Select-Window $window
    }
  }
  "launch_app" {
    $app = [string]$request.input.app
    if ($app.Trim().Length -eq 0 -or $app.Contains([char]0)) { throw "app is required" }
    # Defense-in-depth: refuse UNC paths and URL schemes so launch_app can't pull
    # a remote payload or hand off to a protocol handler. shell:AppsFolder is an
    # explicit allow-listed exception for Store/UWP aliases (calc, etc.); drive
    # paths such as C:\Windows\System32\notepad.exe are still allowed.
    # Mirrored in validateWindowsLaunchAppInput on the Node side — keep in sync.
    if ($app -match '^\\\\') { throw "UNC paths are not allowed for launch_app." }
    $isShellAppsFolder = $app -match '(?i)^shell:AppsFolder\\'
    $isDrivePath = $app -match '^[A-Za-z]:[\\/]'
    if (-not $isShellAppsFolder -and -not $isDrivePath -and $app -match '^[A-Za-z][A-Za-z0-9+.\-]*:') {
      throw "URL schemes are not allowed for launch_app."
    }
    if (-not $isShellAppsFolder -and -not $isDrivePath -and $app -match '[\\/]') {
      throw "Relative paths are not allowed for launch_app."
    }
    # Snapshot existing windows so we can detect a newly appeared one when the
    # launched stub process exits / redirects (e.g. System32\notepad.exe → Store
    # Notepad, or calc.exe → CalculatorApp under a different PID/path).
    $beforeIds = New-Object 'System.Collections.Generic.HashSet[int64]'
    foreach ($existing in (Get-WindowList)) { [void]$beforeIds.Add([int64]$existing.id) }
    $leaf = if ($isShellAppsFolder) {
      # shell:AppsFolder\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App → Calculator
      $token = ($app -split '\\')[-1]
      $aliasLeaf = $null
      foreach ($alias in $launchAliases) {
        if ($token -match $alias.tokenPattern) { $aliasLeaf = $alias.leaf; break }
      }
      if ($aliasLeaf) { $aliasLeaf } else { ($token -split '[_.!]')[0] }
    } else {
      [IO.Path]::GetFileNameWithoutExtension($app)
    }
    # Extra launch targets and title / process-name hints for aliases where
    # Start-Process alone often fails to resolve to a window (Store redirects,
    # e.g. calc → CalculatorApp). Declared once in $launchAliases at the top.
    $launchTargets = New-Object System.Collections.Generic.List[string]
    $launchTargets.Add($app)
    $titleHints = New-Object System.Collections.Generic.List[string]
    if ($leaf) {
      $titleHints.Add($leaf)
      foreach ($alias in $launchAliases) {
        if ($alias.names -notcontains $leaf.ToLowerInvariant()) { continue }
        foreach ($aliasTarget in $alias.targets) { $launchTargets.Add($aliasTarget) }
        foreach ($aliasHint in $alias.hints) { $titleHints.Add($aliasHint) }
        break
      }
    }

    function Find-LaunchedWindow([uint32]$targetPid) {
      foreach ($hWnd in [PoracodeComputerUseNative]::Windows()) {
        # Cheap pre-filter: resolve pid + newness from the handle alone and skip
        # windows that can never match before building the full window object.
        $wPid = [uint32]0
        [void][PoracodeComputerUseNative]::GetWindowThreadProcessId($hWnd, [ref]$wPid)
        $isNew = -not $beforeIds.Contains([int64]$hWnd)
        $pidMatch = ($targetPid -ne 0 -and $wPid -eq $targetPid)
        if (-not $isNew -and -not $pidMatch) { continue }
        $candidate = Get-WindowObject $hWnd
        if ($null -eq $candidate -or $candidate.width -le 0 -or $candidate.height -le 0) { continue }
        $hintMatch = $false
        if ($isNew) {
          foreach ($hint in $titleHints) {
            if (
              ($candidate.title -and $candidate.title -match [regex]::Escape($hint)) -or
              ($candidate.displayName -and [string]::Equals($candidate.displayName, $hint, [StringComparison]::OrdinalIgnoreCase)) -or
              ($candidate.app -and [IO.Path]::GetFileNameWithoutExtension([string]$candidate.app) -ieq $hint)
            ) { $hintMatch = $true; break }
          }
        }
        if ($pidMatch -or $hintMatch) { return $candidate }
      }
      return $null
    }

    $window = $null
    $anyLaunchAttempted = $false
    foreach ($target in $launchTargets) {
      $proc = $null
      try {
        $isShellOrProtocol = (
          $target -match '(?i)^shell:AppsFolder\\' -or
          $target -match '^[A-Za-z][A-Za-z0-9+.\-]*:'
        ) -and ($target -notmatch '^[A-Za-z]:\\')
        if ($isShellOrProtocol) {
          Start-Process -FilePath $target -ErrorAction Stop | Out-Null
        } else {
          $proc = Start-Process -FilePath $target -PassThru -ErrorAction Stop
        }
        $anyLaunchAttempted = $true
      } catch {
        continue
      }
      $targetPid = if ($proc -and $proc.Id) { [uint32]$proc.Id } else { [uint32]0 }
      # Per-target poll (~3s). If the stub starts but no window appears (common for
      # calc.exe → Store Calculator), fall through to the next alias.
      $deadline = (Get-Date).AddSeconds(3)
      while ((Get-Date) -lt $deadline -and $null -eq $window) {
        $window = Find-LaunchedWindow $targetPid
        if ($null -eq $window) { Start-Sleep -Milliseconds 150 }
      }
      if ($null -ne $window) { break }
    }
    if (-not $anyLaunchAttempted) { throw "Unable to launch app: $app" }
    if ($null -ne $window) {
      $result = [pscustomobject]@{
        ok = $true
        window = Select-Window $window
      }
    } else {
      $result = [pscustomobject]@{ ok = $true; window = $null; note = "App launched but no window became available within the timeout. Call list_windows to find it." }
    }
  }
  default {
    throw "Unknown action: $($request.action)"
  }
}
return $result
}

# Serve one JSON request per stdin line; emit exactly one JSON response line per
# request. Any throw inside an action becomes an { ok = $false; error } response
# so a single failing action never tears down the long-lived host.
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line.Trim().Length -eq 0) { continue }
  $reqId = $null
  try {
    $request = $line | ConvertFrom-Json
    $reqId = $request.id
    $result = Invoke-ComputerUseAction $request
    $response = [pscustomobject]@{ id = $reqId; ok = $true; result = $result }
  } catch {
    $response = [pscustomobject]@{ id = $reqId; ok = $false; error = [string]$_.Exception.Message }
  }
  [Console]::Out.WriteLine(($response | ConvertTo-Json -Depth 32 -Compress))
}
`;

// The helper is too large to pass via `-EncodedCommand` (base64 of the
// UTF-16LE script exceeds the ~32k Windows command-line limit and spawn fails
// with ENAMETOOLONG). Stage it to a temp `.ps1` once per process and run it
// with `-File`, leaving stdin free for the JSON request payload.
let cachedHelperPath: string | null = null;

function ensureWindowsHelperScript(): string {
  if (cachedHelperPath) return cachedHelperPath;
  const dir = join(tmpdir(), "poracode-computer-use");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "windows-helper.ps1");
  writeFileSync(path, WINDOWS_HELPER, "utf8");
  cachedHelperPath = path;
  return path;
}

const POWERSHELL_PATH = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const REQUEST_TIMEOUT_MS = 20_000;
// Responses can be multi-MB (screenshots). Cap the accumulated stdout so a
// runaway/garbage child can't grow the buffer without bound; on overflow we
// recycle the child.
const MAX_STDOUT_BUFFER_BYTES = 64 * 1024 * 1024;

// Escape every non-ASCII UTF-16 code unit so each request line is pure ASCII on
// the wire. PowerShell's ConvertFrom-Json rebuilds the original string (incl.
// emoji surrogate pairs) from the \uXXXX escapes, so correct Unicode input
// (type_text) never depends on the child's stdin code page.
function toAsciiRequestLine(payload: unknown): string {
  const json = JSON.stringify(payload);
  let out = "";
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    out += code > 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : json[i];
  }
  return `${out}\n`;
}

// Defense-in-depth: mirrored in the PowerShell helper's launch_app validation
// across the process boundary — keep both sides in sync.
function normalizeArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

type LegacyInteractiveResult = {
  ok: true;
  mode: "interactive";
  window?: ComputerUseWindow;
};

function withLegacyDelivery(result: LegacyInteractiveResult): ComputerUseInteractiveResult {
  return {
    ...result,
    delivery: {
      delivered: "foreground",
      route: "input",
      verified: "unverified",
      notes: ["legacy_driver"],
    },
  };
}

export class WindowsComputerUseDriver implements ComputerUseDriver {
  private readonly host = new PersistentJsonLineHost({
    label: "computer-use host",
    maxStdoutBufferBytes: MAX_STDOUT_BUFFER_BYTES,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    encodeRequest: toAsciiRequestLine,
    spawn: () => {
      const scriptPath = ensureWindowsHelperScript();
      return spawn(
        POWERSHELL_PATH,
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
        ],
        { windowsHide: true },
      );
    },
  });

  dispose(): void {
    this.host.dispose();
  }

  async describeStatus(): Promise<ComputerUseDriverStatus> {
    return {
      backend: "legacy",
      helper: null,
      capabilities: {
        backgroundPointer: false,
        backgroundKeyboard: false,
        backgroundChords: false,
        accessibilityTree: false,
        elementActions: false,
        occludedCapture: true,
        foregroundInput: true,
        launchApp: true,
        stableWindowIds: false,
      },
      permissions: { accessibility: "not_required", screenRecording: "not_required" },
      notes: ["Using the foreground-only legacy Windows driver."],
    };
  }

  async listApps(input?: ComputerUseListAppsInput): Promise<ComputerUseApp[]> {
    const apps = normalizeArray(
      await this.host.request<ComputerUseApp | ComputerUseApp[]>("list_apps"),
    );
    const query = input?.query?.trim().toLowerCase();
    if (!query) return apps;
    return apps.filter(
      (app) =>
        app.id.toLowerCase().includes(query) ||
        app.displayName?.toLowerCase().includes(query) ||
        app.windows.some((window) => window.title?.toLowerCase().includes(query)),
    );
  }

  async listWindows(): Promise<ComputerUseWindow[]> {
    return normalizeArray(
      await this.host.request<ComputerUseWindow | ComputerUseWindow[]>("list_windows"),
    );
  }

  getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow> {
    return this.host.request("get_window", input);
  }

  getWindowState(input: {
    format?: "jpeg" | "png";
    include_screenshot?: boolean;
    include_text?: boolean;
    max_dimension?: number;
    window: ComputerUseWindow;
  }): Promise<ComputerUseWindowState> {
    return this.host.request("get_window_state", input);
  }

  async activateWindow(input: {
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return withLegacyDelivery(
      await this.host.request<LegacyInteractiveResult>("activate_window", input),
    );
  }

  click(input: {
    click_count?: number;
    mouse_button?: string;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<ComputerUseInteractiveResult> {
    return this.host.request<LegacyInteractiveResult>("click", input).then(withLegacyDelivery);
  }

  typeText(input: {
    text: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.host.request<LegacyInteractiveResult>("type_text", input).then(withLegacyDelivery);
  }

  pressKey(input: {
    key: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.host.request<LegacyInteractiveResult>("press_key", input).then(withLegacyDelivery);
  }

  scroll(input: {
    scrollX: number;
    scrollY: number;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<ComputerUseInteractiveResult> {
    return this.host.request<LegacyInteractiveResult>("scroll", input).then(withLegacyDelivery);
  }

  drag(input: {
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.host.request<LegacyInteractiveResult>("drag", input).then(withLegacyDelivery);
  }

  findElements(input: Parameters<ComputerUseDriver["findElements"]>[0]) {
    return Promise.resolve(legacyElementRefusal(input.window));
  }

  invokeElement(input: Parameters<ComputerUseDriver["invokeElement"]>[0]) {
    return Promise.resolve(legacyElementRefusal(input.window));
  }

  setElementValue(input: Parameters<ComputerUseDriver["setElementValue"]>[0]) {
    return Promise.resolve(legacyElementRefusal(input.window));
  }

  launchApp(input: { app: string }): Promise<{
    ok: true;
    window?: ComputerUseWindow | null;
    note?: string;
  }> {
    validateWindowsLaunchAppInput(input.app);
    return this.host.request("launch_app", input);
  }
}
