import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { terminateChildProcessTree } from "@/shared/processTree";

interface PendingAssignment {
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

interface HelperReadyMessage {
  type: "ready";
}

interface HelperAssignedMessage {
  type: "assigned";
  id: number;
  pid: number;
}

interface HelperErrorMessage {
  type: "error";
  id?: number;
  message: string;
}

type HelperMessage = HelperReadyMessage | HelperAssignedMessage | HelperErrorMessage;

const START_TIMEOUT_MS = 30_000;
const DISPOSE_GRACE_MS = 500;

function buildHelperScript(): string {
  return String.raw`
$ErrorActionPreference = 'Stop'

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class LightcodeJobObjectApi {
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint ProcessSetQuota = 0x0100;
    private const uint ProcessTerminate = 0x0001;

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public IntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(
        IntPtr hJob,
        int infoType,
        IntPtr lpJobObjectInfo,
        uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr handle);

    public static IntPtr CreateKillOnCloseJobObject() {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed.");
        }

        JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;

        IntPtr buffer = Marshal.AllocHGlobal(Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>());
        try {
            Marshal.StructureToPtr(info, buffer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                buffer,
                (uint)Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject failed.");
            }
        } catch {
            CloseHandle(job);
            throw;
        } finally {
            Marshal.FreeHGlobal(buffer);
        }

        return job;
    }

    public static void AssignPid(IntPtr job, int pid) {
        IntPtr process = OpenProcess(ProcessSetQuota | ProcessTerminate, false, pid);
        if (process == IntPtr.Zero) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcess failed.");
        }

        try {
            if (!AssignProcessToJobObject(job, process)) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed.");
            }
        } finally {
            CloseHandle(process);
        }
    }

    public static void ExitWhenProcessExits(int pid) {
        Thread watcher = new Thread(() => {
            try {
                using (Process parent = Process.GetProcessById(pid)) {
                    parent.WaitForExit();
                }
            } catch {
                // Parent is already gone.
            }

            Environment.Exit(0);
        });
        watcher.IsBackground = true;
        watcher.Start();
    }
}
"@

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Send-Message($message) {
  [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress))
}

$job = [IntPtr]::Zero

try {
  $parentPidRaw = $env:LIGHTCODE_PARENT_PID
  if ($parentPidRaw) {
    [LightcodeJobObjectApi]::ExitWhenProcessExits([int]$parentPidRaw)
  }

  $job = [LightcodeJobObjectApi]::CreateKillOnCloseJobObject()
  Send-Message @{ type = 'ready' }

  while (($line = [Console]::In.ReadLine()) -ne $null) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $request = $line | ConvertFrom-Json
    if ($request.type -eq 'exit') {
      break
    }

    if ($request.type -ne 'assign') {
      Send-Message @{ type = 'error'; message = "Unsupported request type: $($request.type)" }
      continue
    }

    try {
      [LightcodeJobObjectApi]::AssignPid($job, [int]$request.pid)
      Send-Message @{ type = 'assigned'; id = [int]$request.id; pid = [int]$request.pid }
    } catch {
      Send-Message @{ type = 'error'; id = [int]$request.id; message = $_.Exception.Message }
    }
  }
} catch {
  Send-Message @{ type = 'error'; message = $_.Exception.Message }
  exit 1
} finally {
  if ($job -ne [IntPtr]::Zero) {
    [LightcodeJobObjectApi]::CloseHandle($job) | Out-Null
  }
}`;
}

function encodeHelperScript(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function buildStartError(stderrTail: string, reason?: string): Error {
  const details = [reason, stderrTail.trim()].filter(Boolean).join(" ").trim();
  return new Error(
    details
      ? `Windows Job Object helper failed to start. ${details}`
      : "Windows Job Object helper failed to start.",
  );
}

export class WindowsJobObjectManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: Interface | null = null;
  private pendingAssignments = new Map<number, PendingAssignment>();
  private nextRequestId = 1;
  private startPromise: Promise<void> | null = null;
  private startResolve: (() => void) | null = null;
  private startReject: ((reason?: unknown) => void) | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private isReady = false;
  private isDisposing = false;
  private stderrTail = "";

  async start(): Promise<void> {
    if (process.platform !== "win32") {
      return;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.isDisposing = false;
    this.stderrTail = "";
    this.isReady = false;

    const encodedScript = encodeHelperScript(buildHelperScript());
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        encodedScript,
      ],
      {
        env: {
          ...process.env,
          LIGHTCODE_PARENT_PID: String(process.pid),
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    this.child = child;
    this.stdoutReader = createInterface({ input: child.stdout });

    this.startPromise = new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
    });

    this.startTimer = setTimeout(() => {
      this.failStart(buildStartError(this.stderrTail, `Timed out after ${START_TIMEOUT_MS}ms.`));
      this.dispose();
    }, START_TIMEOUT_MS);

    child.stderr.on("data", (chunk) => {
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-4000);
    });

    child.once("error", (error) => {
      this.handleChildExit(buildStartError(this.stderrTail, error.message));
    });

    child.once("exit", (code, signal) => {
      const reason =
        code !== null
          ? `Exited with code ${code}.`
          : signal
            ? `Exited with signal ${signal}.`
            : "Exited unexpectedly.";
      this.handleChildExit(buildStartError(this.stderrTail, reason));
    });

    this.stdoutReader.on("line", (line) => {
      this.handleHelperLine(line);
    });

    return this.startPromise;
  }

  async assignPid(pid: number): Promise<void> {
    if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
      return;
    }

    await this.start();

    const child = this.child;
    if (!child || !this.isReady || child.stdin.destroyed) {
      throw new Error("Windows Job Object helper is not ready.");
    }

    const id = this.nextRequestId++;

    return new Promise<void>((resolve, reject) => {
      this.pendingAssignments.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ type: "assign", id, pid })}\n`, (error) => {
        if (!error) {
          return;
        }
        this.pendingAssignments.delete(id);
        reject(error);
      });
    });
  }

  dispose(): void {
    this.isDisposing = true;
    this.clearStartState();
    this.rejectPendingAssignments(new Error("Windows Job Object helper disposed."));

    const child = this.child;
    this.child = null;

    const reader = this.stdoutReader;
    this.stdoutReader = null;
    reader?.close();
    this.isReady = false;
    this.startPromise = null;

    if (!child) {
      return;
    }

    try {
      if (!child.stdin.destroyed) {
        child.stdin.write(`${JSON.stringify({ type: "exit" })}\n`);
        child.stdin.end();
      }
    } catch {
      // Ignore shutdown races.
    }

    const forceCloseTimer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        terminateChildProcessTree(child);
      }
    }, DISPOSE_GRACE_MS);
    forceCloseTimer.unref?.();
  }

  private handleHelperLine(line: string): void {
    let message: HelperMessage;
    try {
      message = JSON.parse(line) as HelperMessage;
    } catch {
      return;
    }

    if (message.type === "ready") {
      this.isReady = true;
      this.resolveStart();
      return;
    }

    if (message.type === "assigned") {
      const pending = this.pendingAssignments.get(message.id);
      if (!pending) {
        return;
      }
      this.pendingAssignments.delete(message.id);
      pending.resolve();
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pendingAssignments.get(message.id);
      if (!pending) {
        return;
      }
      this.pendingAssignments.delete(message.id);
      pending.reject(new Error(message.message));
      return;
    }

    this.handleChildExit(buildStartError(this.stderrTail, message.message));
  }

  private handleChildExit(error: Error): void {
    const child = this.child;
    this.child = null;

    const reader = this.stdoutReader;
    this.stdoutReader = null;
    reader?.close();

    this.isReady = false;
    this.startPromise = null;
    this.failStart(error);
    this.rejectPendingAssignments(error);

    if (!this.isDisposing && child) {
      console.error("[lightcode] Windows Job Object helper exited:", error.message);
    }
  }

  private resolveStart(): void {
    if (!this.startResolve) {
      return;
    }
    const resolve = this.startResolve;
    this.clearStartState();
    resolve();
  }

  private failStart(error: Error): void {
    if (!this.startReject) {
      return;
    }
    const reject = this.startReject;
    this.clearStartState();
    reject(error);
  }

  private clearStartState(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    this.startResolve = null;
    this.startReject = null;
  }

  private rejectPendingAssignments(error: Error): void {
    for (const [id, pending] of this.pendingAssignments) {
      pending.reject(error);
      this.pendingAssignments.delete(id);
    }
  }
}
