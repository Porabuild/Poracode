import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ComputerUseApp,
  ComputerUseDriver,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "../mcp/types";
import { runProcess } from "./common";

const WINDOWS_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
$request = if ($raw.Trim().Length -gt 0) { $raw | ConvertFrom-Json } else { @{} }

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class LightcodeComputerUseNative {
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
try { [void][LightcodeComputerUseNative]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch {}

$ASFW_ANY = [uint32]"0xFFFFFFFF"

function Get-WindowObject([IntPtr]$hWnd) {
  if (-not [LightcodeComputerUseNative]::IsWindow($hWnd)) { return $null }
  if (-not [LightcodeComputerUseNative]::IsWindowVisible($hWnd)) { return $null }
  $titleBuilder = [Text.StringBuilder]::new(512)
  [void][LightcodeComputerUseNative]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString()
  if ($title.Trim().Length -eq 0) { return $null }
  $procId = [uint32]0
  [void][LightcodeComputerUseNative]::GetWindowThreadProcessId($hWnd, [ref]$procId)
  try { $process = Get-Process -Id ([int]$procId) -ErrorAction Stop } catch { $process = $null }
  $rect = New-Object LightcodeComputerUseNative+RECT
  [void][LightcodeComputerUseNative]::GetWindowRect($hWnd, [ref]$rect)
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

function Get-WindowList {
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($hWnd in [LightcodeComputerUseNative]::Windows()) {
    $window = Get-WindowObject $hWnd
    if ($null -ne $window -and $window.width -gt 0 -and $window.height -gt 0) {
      $items.Add($window)
    }
  }
  $items
}

function Require-Window($req) {
  $hWnd = [IntPtr]([int64]$req.id)
  $window = Get-WindowObject $hWnd
  if ($null -eq $window) { throw "Window is no longer available." }
  if ($req.app -and $window.app -ne [string]$req.app) {
    throw "Window app no longer matches the requested app."
  }
  $window
}

function Activate-Window($window) {
  $hWnd = [IntPtr]([int64]$window.id)
  # SW_RESTORE (9) un-maximizes a maximized window, which would move/resize it
  # AFTER the agent's screenshot and break coordinate math. Only restore when the
  # window is actually minimized; otherwise SW_SHOW (5) leaves geometry untouched.
  if ([LightcodeComputerUseNative]::IsIconic($hWnd)) {
    [void][LightcodeComputerUseNative]::ShowWindow($hWnd, 9)
    Start-Sleep -Milliseconds 40
  } else {
    [void][LightcodeComputerUseNative]::ShowWindow($hWnd, 5)
  }
  $activated = $false
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    if ([LightcodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) { $activated = $true; break }
    [void][LightcodeComputerUseNative]::AllowSetForegroundWindow($ASFW_ANY)
    # An alt-key nudge releases the foreground lock so SetForegroundWindow is honored.
    [LightcodeComputerUseNative]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [LightcodeComputerUseNative]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    $fg = [LightcodeComputerUseNative]::GetForegroundWindow()
    $fgPid = [uint32]0
    $fgThread = [LightcodeComputerUseNative]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    $cur = [LightcodeComputerUseNative]::GetCurrentThreadId()
    $attached = $false
    if ($fgThread -ne $cur) { $attached = [LightcodeComputerUseNative]::AttachThreadInput($fgThread, $cur, $true) }
    try {
      [void][LightcodeComputerUseNative]::BringWindowToTop($hWnd)
      [void][LightcodeComputerUseNative]::SetForegroundWindow($hWnd)
    } finally {
      if ($attached) { [void][LightcodeComputerUseNative]::AttachThreadInput($fgThread, $cur, $false) }
    }
    Start-Sleep -Milliseconds 60
    if ([LightcodeComputerUseNative]::GetForegroundWindow() -eq $hWnd) { $activated = $true; break }
  }
  if (-not $activated) {
    throw "Focus did not reach the target window. The desktop may be locked or another secure surface may be active."
  }
  # Re-capture the window rect AFTER activation: show/restore may have changed the
  # window geometry, so return the fresh object for coordinate math.
  $fresh = Get-WindowObject $hWnd
  if ($null -eq $fresh) { return $window }
  return $fresh
}

function Capture-Window($window) {
  $hWnd = [IntPtr]([int64]$window.id)
  $width = [Math]::Max(1, [int]$window.width)
  $height = [Math]::Max(1, [int]$window.height)
  $bitmap = New-Object Drawing.Bitmap($width, $height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $usedFallback = $false
  try {
    $hdc = $graphics.GetHdc()
    try {
      $ok = [LightcodeComputerUseNative]::PrintWindow($hWnd, $hdc, 2)
    } finally {
      $graphics.ReleaseHdc($hdc)
    }
    if (-not $ok) {
      $usedFallback = $true
      $graphics.CopyFromScreen([int]$window.x, [int]$window.y, 0, 0, [Drawing.Size]::new($width, $height))
    }
    $stream = New-Object IO.MemoryStream
    try {
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      [pscustomobject]@{
        id = "window"
        mimeType = "image/png"
        data = [Convert]::ToBase64String($stream.ToArray())
        width = $width
        height = $height
        originX = [int]$window.x
        originY = [int]$window.y
        zIndex = 0
        fallback = $usedFallback
      }
    } finally {
      $stream.Dispose()
    }
  } finally {
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
    $vk = [LightcodeComputerUseNative]::VkKeyScan([char]$raw[0])
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
    foreach ($vk in $modVks) { [LightcodeComputerUseNative]::Key($vk, $false); $pressed.Add($vk) }
    foreach ($vk in $baseVks) { [LightcodeComputerUseNative]::Key($vk, $false); $pressed.Add($vk) }
    for ($i = $baseVks.Count - 1; $i -ge 0; $i--) {
      [LightcodeComputerUseNative]::Key($baseVks[$i], $true); [void]$pressed.Remove($baseVks[$i])
    }
    for ($i = $modVks.Count - 1; $i -ge 0; $i--) {
      [LightcodeComputerUseNative]::Key($modVks[$i], $true); [void]$pressed.Remove($modVks[$i])
    }
  } finally {
    # Never leave a key physically down system-wide if we threw mid-sequence.
    for ($i = $pressed.Count - 1; $i -ge 0; $i--) {
      try { [LightcodeComputerUseNative]::Key($pressed[$i], $true) } catch {}
    }
  }
}

function Mouse-Click($button, $count) {
  $down = [LightcodeComputerUseNative]::MOUSEEVENTF_LEFTDOWN
  $up = [LightcodeComputerUseNative]::MOUSEEVENTF_LEFTUP
  $b = ([string]$button).ToLowerInvariant()
  if ($b -eq "right" -or $b -eq "r") {
    $down = [LightcodeComputerUseNative]::MOUSEEVENTF_RIGHTDOWN
    $up = [LightcodeComputerUseNative]::MOUSEEVENTF_RIGHTUP
  } elseif ($b -eq "middle" -or $b -eq "m") {
    $down = [LightcodeComputerUseNative]::MOUSEEVENTF_MIDDLEDOWN
    $up = [LightcodeComputerUseNative]::MOUSEEVENTF_MIDDLEUP
  }
  for ($i = 0; $i -lt [Math]::Max(1, [int]$count); $i++) {
    [LightcodeComputerUseNative]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 20
    [LightcodeComputerUseNative]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  }
}

switch ([string]$request.action) {
  "list_windows" {
    $result = @(Get-WindowList | ForEach-Object {
      [pscustomobject]@{ app = $_.app; id = $_.id; title = $_.title; x = $_.x; y = $_.y; width = $_.width; height = $_.height }
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
          [pscustomobject]@{ app = $_.app; id = $_.id; title = $_.title; x = $_.x; y = $_.y; width = $_.width; height = $_.height }
        })
      }
    })
  }
  "get_window" {
    $window = Require-Window $request.input
    $result = [pscustomobject]@{ app = $window.app; id = $window.id; title = $window.title; x = $window.x; y = $window.y; width = $window.width; height = $window.height }
  }
  "get_window_state" {
    $window = Require-Window $request.input.window
    $screenshots = @()
    $notes = @("Window listing and screenshots are passive. Input actions switch to interactive mode and activate the target window.")
    if ($request.input.include_screenshot -ne $false) {
      $capture = Capture-Window $window
      if ($capture.fallback) { $notes += "Passive PrintWindow capture was unavailable; used visible screen-region capture." }
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
      $notes += "Detailed UI Automation text is not available in this Lightcode helper yet."
    }
    $result = [pscustomobject]@{
      window = [pscustomobject]@{ app = $window.app; id = $window.id; title = $window.title; x = $window.x; y = $window.y; width = $window.width; height = $window.height }
      accessibility = $accessibility
      screenshots = $screenshots
      mode = "passive"
      notes = $notes
    }
  }
  "activate_window" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    $result = [pscustomobject]@{ ok = $true; mode = "interactive" }
  }
  "click" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    $x = [int]$request.input.x
    $y = [int]$request.input.y
    [void][LightcodeComputerUseNative]::SetCursorPos([int]$window.x + $x, [int]$window.y + $y)
    Mouse-Click $request.input.mouse_button $request.input.click_count
    $result = [pscustomobject]@{ ok = $true; mode = "interactive" }
  }
  "type_text" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    [LightcodeComputerUseNative]::SendUnicodeText([string]$request.input.text)
    $result = [pscustomobject]@{ ok = $true; mode = "interactive" }
  }
  "press_key" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    Press-Chord $request.input.key
    $result = [pscustomobject]@{ ok = $true; mode = "interactive" }
  }
  "scroll" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    [void][LightcodeComputerUseNative]::SetCursorPos([int]$window.x + [int]$request.input.x, [int]$window.y + [int]$request.input.y)
    if ([int]$request.input.scrollY -ne 0) {
      [LightcodeComputerUseNative]::mouse_event([LightcodeComputerUseNative]::MOUSEEVENTF_WHEEL, 0, 0, [uint32](-1 * [int]$request.input.scrollY), [UIntPtr]::Zero)
    }
    if ([int]$request.input.scrollX -ne 0) {
      [LightcodeComputerUseNative]::mouse_event([LightcodeComputerUseNative]::MOUSEEVENTF_HWHEEL, 0, 0, [uint32]([int]$request.input.scrollX), [UIntPtr]::Zero)
    }
    $result = [pscustomobject]@{ ok = $true; mode = "interactive" }
  }
  "drag" {
    $window = Require-Window $request.input.window
    $window = Activate-Window $window
    $downSent = $false
    try {
      [void][LightcodeComputerUseNative]::SetCursorPos([int]$window.x + [int]$request.input.from_x, [int]$window.y + [int]$request.input.from_y)
      [LightcodeComputerUseNative]::mouse_event([LightcodeComputerUseNative]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
      $downSent = $true
      Start-Sleep -Milliseconds 40
      [void][LightcodeComputerUseNative]::SetCursorPos([int]$window.x + [int]$request.input.to_x, [int]$window.y + [int]$request.input.to_y)
      Start-Sleep -Milliseconds 40
      [LightcodeComputerUseNative]::mouse_event([LightcodeComputerUseNative]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
      $downSent = $false
    } finally {
      # Never leave the mouse button physically down if we threw mid-drag.
      if ($downSent) {
        try { [LightcodeComputerUseNative]::mouse_event([LightcodeComputerUseNative]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero) } catch {}
      }
    }
    $result = [pscustomobject]@{ ok = $true; mode = "interactive" }
  }
  "launch_app" {
    $app = [string]$request.input.app
    if ($app.Trim().Length -eq 0) { throw "app is required" }
    # Defense-in-depth: refuse UNC paths and URL schemes so launch_app can't pull
    # a remote payload or hand off to a protocol handler.
    if ($app -match '^\\\\') { throw "UNC paths are not allowed for launch_app." }
    if ($app -match '^[A-Za-z][A-Za-z0-9+.\-]*://') { throw "URL schemes are not allowed for launch_app." }
    $proc = Start-Process -FilePath $app -PassThru
    $window = $null
    if ($proc -and $proc.Id) {
      $targetPid = [uint32]$proc.Id
      # Start-Process returns before the window exists; poll (bounded ~4s) for a
      # visible, titled top-level window owned by the new process.
      $deadline = (Get-Date).AddSeconds(4)
      while ((Get-Date) -lt $deadline -and $null -eq $window) {
        foreach ($hWnd in [LightcodeComputerUseNative]::Windows()) {
          $wPid = [uint32]0
          [void][LightcodeComputerUseNative]::GetWindowThreadProcessId($hWnd, [ref]$wPid)
          if ($wPid -eq $targetPid) {
            $candidate = Get-WindowObject $hWnd
            if ($null -ne $candidate -and $candidate.width -gt 0 -and $candidate.height -gt 0) {
              $window = $candidate
              break
            }
          }
        }
        if ($null -eq $window) { Start-Sleep -Milliseconds 150 }
      }
    }
    if ($null -ne $window) {
      $result = [pscustomobject]@{
        ok = $true
        window = [pscustomobject]@{ app = $window.app; id = $window.id; title = $window.title; x = $window.x; y = $window.y; width = $window.width; height = $window.height }
      }
    } else {
      $result = [pscustomobject]@{ ok = $true; window = $null; note = "App launched but no window became available within the timeout." }
    }
  }
  "set_value" {
    throw "set_value is not supported yet; click or focus the target field, then use type_text."
  }
  "perform_secondary_action" {
    throw "perform_secondary_action is not supported yet; use keyboard navigation or coordinate input."
  }
  default {
    throw "Unknown action: $($request.action)"
  }
}

$result | ConvertTo-Json -Depth 32 -Compress
`;

// The helper is too large to pass via `-EncodedCommand` (base64 of the
// UTF-16LE script exceeds the ~32k Windows command-line limit and spawn fails
// with ENAMETOOLONG). Stage it to a temp `.ps1` once per process and run it
// with `-File`, leaving stdin free for the JSON request payload.
let cachedHelperPath: string | null = null;

function ensureWindowsHelperScript(): string {
  if (cachedHelperPath) return cachedHelperPath;
  const dir = join(tmpdir(), "lightcode-computer-use");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "windows-helper.ps1");
  writeFileSync(path, WINDOWS_HELPER, "utf8");
  cachedHelperPath = path;
  return path;
}

async function runWindowsComputerUse<T>(action: string, input?: unknown): Promise<T> {
  const scriptPath = ensureWindowsHelperScript();
  const { stdout } = await runProcess(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    {
      input: JSON.stringify({ action, input: input ?? {} }),
      timeoutMs: 20_000,
      maxBufferBytes: 24 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout.trim()) as T;
}

function normalizeArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export class WindowsComputerUseDriver implements ComputerUseDriver {
  async listApps(): Promise<ComputerUseApp[]> {
    return normalizeArray(
      await runWindowsComputerUse<ComputerUseApp | ComputerUseApp[]>("list_apps"),
    );
  }

  async listWindows(): Promise<ComputerUseWindow[]> {
    return normalizeArray(
      await runWindowsComputerUse<ComputerUseWindow | ComputerUseWindow[]>("list_windows"),
    );
  }

  getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow> {
    return runWindowsComputerUse("get_window", input);
  }

  getWindowState(input: {
    include_screenshot?: boolean;
    include_text?: boolean;
    window: ComputerUseWindow;
  }): Promise<ComputerUseWindowState> {
    return runWindowsComputerUse("get_window_state", input);
  }

  activateWindow(input: { window: ComputerUseWindow }): Promise<{ ok: true; mode: "interactive" }> {
    return runWindowsComputerUse("activate_window", input);
  }

  click(input: {
    click_count?: number;
    mouse_button?: string;
    window: ComputerUseWindow;
    x?: number;
    y?: number;
  }): Promise<{ ok: true; mode: "interactive" }> {
    return runWindowsComputerUse("click", input);
  }

  typeText(input: { text: string; window: ComputerUseWindow }): Promise<{
    ok: true;
    mode: "interactive";
  }> {
    return runWindowsComputerUse("type_text", input);
  }

  pressKey(input: { key: string; window: ComputerUseWindow }): Promise<{
    ok: true;
    mode: "interactive";
  }> {
    return runWindowsComputerUse("press_key", input);
  }

  scroll(input: {
    scrollX: number;
    scrollY: number;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<{ ok: true; mode: "interactive" }> {
    return runWindowsComputerUse("scroll", input);
  }

  drag(input: {
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }> {
    return runWindowsComputerUse("drag", input);
  }

  launchApp(input: { app: string }): Promise<{
    ok: true;
    window?: ComputerUseWindow | null;
    note?: string;
  }> {
    return runWindowsComputerUse("launch_app", input);
  }

  setValue(input: {
    element_index: number;
    value: string;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }> {
    return runWindowsComputerUse("set_value", input);
  }

  performSecondaryAction(input: {
    action: string;
    element_index: number;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }> {
    return runWindowsComputerUse("perform_secondary_action", input);
  }
}
