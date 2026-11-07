// Bundled with the server, not a separately installed script. The closed local
// stdin protocol carries task metadata only; provider credentials never enter it.
export const WINDOWS_SERVICE_CONTROL_VERSION = 1;
export const WINDOWS_SERVICE_CONTROL = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if (($request.PSObject.Properties.Name | Sort-Object) -join ',' -cne 'definition,id,operation,version' -or $request.version -ne 1 -or
      $request.operation -cnotin @('context','inspect','register','enable','disable','start','remove')) { throw 'Unsupported local task-control request.' }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $sid = $identity.User.Value
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Use the selected unelevated Windows user; elevation is not a service policy.' }
  $account = [ordered]@{sid=$sid;home=[Environment]::GetFolderPath('UserProfile')}
  $result = [ordered]@{version=1;account=$account;task=$null}
  if ($request.operation -eq 'context') {
    if ($null -ne $request.id -or $null -ne $request.definition) { throw 'Context does not accept a task selection.' }
  } else {
    if ($request.id -cnotmatch '^poracode-[a-f0-9]{32}$') { throw 'Invalid registered task identity.' }
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $folder = $service.GetFolder('\')
    $task = $null
    try { $task = $folder.GetTask($request.id) } catch {
      if ($_.Exception.HResult -ne -2147024894) { throw }
    }
    $selection = $request.definition
    $expected = $null
    if ($null -ne $selection) {
      if (($selection.PSObject.Properties.Name | Sort-Object) -join ',' -cne 'accountSid,arguments,config,entrypoint,executable,node,nonce,prefix,profile,version' -or
          $selection.version -ne 1 -or $selection.accountSid -cne $sid -or $selection.nonce -cnotmatch '^[a-f0-9]{48}$') { throw 'Task policy or account differs from this native context.' }
      $expected = $service.NewTask(0)
      $expected.RegistrationInfo.Description = 'Poracode ' + $selection.nonce
      $expected.RegistrationInfo.URI = '\' + $request.id
      $expected.RegistrationInfo.SecurityDescriptor = "D:P(A;;FA;;;$sid)"
      $expected.Principal.Id = 'PoracodeUser'
      $expected.Principal.UserId = $sid
      $expected.Principal.LogonType = 3
      $expected.Principal.RunLevel = 0
      $expected.Settings.AllowDemandStart = $true
      $expected.Settings.AllowHardTerminate = $false
      $expected.Settings.Enabled = $true
      $expected.Settings.Hidden = $false
      $expected.Settings.DisallowStartIfOnBatteries = $false
      $expected.Settings.StopIfGoingOnBatteries = $false
      $expected.Settings.RunOnlyIfIdle = $false
      $expected.Settings.IdleSettings.StopOnIdleEnd = $false
      $expected.Settings.IdleSettings.RestartOnIdle = $false
      $expected.Settings.ExecutionTimeLimit = 'PT0S'
      $expected.Settings.MultipleInstances = 2
      $expected.Settings.RestartCount = 0
      $trigger = $expected.Triggers.Create(9)
      $trigger.Id = 'UserLogon'
      $identifier = New-Object Security.Principal.SecurityIdentifier($sid)
      $trigger.UserId = $identifier.Translate([Security.Principal.NTAccount]).Value
      $trigger.Enabled = $true
      $action = $expected.Actions.Create(0)
      $expected.Actions.Context = 'PoracodeUser'
      $action.Id = 'PoracodeHost'
      $action.Path = $selection.executable
      $action.Arguments = $selection.arguments
      $action.WorkingDirectory = $selection.prefix
    } elseif ($request.operation -ne 'inspect') { throw 'Native effects require a complete registered definition.' }
    function Assert-Definition {
      if ($null -eq $task -or $null -eq $expected) { throw 'The registered task is absent or has no qualified definition.' }
      # Use the same native serializer for loaded and generated definitions;
      # Scheduler omits defaults and changes XML element ordering at registration.
      $loaded = $service.NewTask(0)
      $loaded.XmlText = [string]$task.Xml
      $expected.Settings.Enabled = $loaded.Settings.Enabled
      if ([string]$loaded.XmlText -cne [string]$expected.XmlText) { throw 'The loaded task definition differs; refusing further native effects.' }
      $acl = New-Object Security.AccessControl.RawSecurityDescriptor([string]$task.GetSecurityDescriptor(7))
      if ($acl.Owner.Value -cne $sid -or $null -eq $acl.DiscretionaryAcl) { throw 'Native task access is not owned by the selected account.' }
      # Scheduler may add a redundant read ACE for the same principal. Permit
      # only unconditional grants to that SID, with exactly full-control rights.
      $access = 0
      foreach ($ace in $acl.DiscretionaryAcl) {
        if ([int]$ace.AceType -ne 0 -or [int]$ace.AceFlags -ne 0 -or $ace.SecurityIdentifier.Value -cne $sid) { throw 'The native task access control differs from the selected account policy.' }
        $access = $access -bor $ace.AccessMask
      }
      if ($access -ne 0x1f01ff) { throw 'The native task access rights differ from the selected account policy.' }
    }
    if ($null -ne $task -and $null -ne $expected) { Assert-Definition }
    if ($request.operation -in @('enable','disable','start') -or ($request.operation -eq 'remove' -and $null -ne $task)) {
      Assert-Definition
    }
    $snapshotXml = if ($null -ne $task) { [string]$task.Xml } else { $null }
    if ($null -ne $task -or $null -ne $expected) {
      $instances = $null
      $instanceCount = 0
      $taskState = $null
      if ($null -ne $task) {
        $instances = $task.GetInstances(0)
        $instanceCount = [int]$instances.Count
        $taskState = [ordered]@{found=$true;qualified=($null -ne $expected);enabled=[bool]$task.Enabled;instances=$instanceCount;wrapperPid=0;hostPid=0;phase='inactive';lastResult=[int64]$task.LastTaskResult}
      }
      if ($null -ne $expected) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PoracodeTaskArgv {
  [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CommandLineToArgvW(string s,out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
  public static string[] Parse(string s) {
    int n; var p=CommandLineToArgvW(s,out n);
    if(p==IntPtr.Zero) throw new InvalidOperationException("Cannot inspect native process argv.");
    try { var a=new string[n]; for(int i=0;i<n;i++) a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size)); return a; }
    finally { LocalFree(p); }
  }
}
'@
        function Same-Path([string]$a,[string]$b) { return $a.Replace('\\?\','') -ieq $b.Replace('\\?\','') }
        function Assert-Account($process) {
          $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -OperationTimeoutSec 3
          if ($owner.ReturnValue -ne 0 -or $owner.Sid -cne $sid) { throw 'A selected task process belongs to another account.' }
        }
        $processes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='service-launcher-v1.exe'" -OperationTimeoutSec 5)
        $wrappers = @($processes | Where-Object { Same-Path ([string]$_.ExecutablePath) $selection.executable })
        $hosts = @($processes | Where-Object {
          if (-not (Same-Path ([string]$_.ExecutablePath) $selection.node)) { return $false }
          $argv = [PoracodeTaskArgv]::Parse([string]$_.CommandLine)
          return ($argv.Length -gt 4 -and $argv[2] -ceq '--base-dir' -and (Same-Path $argv[3] $selection.profile) -and $argv[4] -ceq 'serve')
        })
        if ($instanceCount -gt 1 -or $wrappers.Count -gt 1 -or $hosts.Count -gt 1) { throw 'Ambiguous task/process topology; no process was adopted.' }
        if ($instanceCount -eq 0) {
          if ($wrappers.Count -ne 0 -or $hosts.Count -ne 0) { throw 'An orphaned launcher/host remains outside this task; inspect status/doctor and stop it explicitly.' }
        } else {
          $taskState.phase = 'activating'
          if ($wrappers.Count -eq 1) {
            $wrapper = $wrappers[0]
            if ([int]$instances.Item(1).EnginePID -ne [int]$wrapper.ProcessId) { throw 'The task engine is not the selected launcher.' }
            $argv = [PoracodeTaskArgv]::Parse([string]$wrapper.CommandLine)
            $wanted = @($selection.executable) + @([PoracodeTaskArgv]::Parse('launcher ' + $selection.arguments) | Select-Object -Skip 1)
            if ($argv.Length -ne $wanted.Length) { throw 'Launcher argv differs from the selected registration.' }
            for ($i=0;$i -lt $argv.Length;$i++) { if ($argv[$i] -cne $wanted[$i]) { throw 'Launcher argv differs from the selected registration.' } }
            Assert-Account $wrapper
            $taskState.wrapperPid = [int]$wrapper.ProcessId
            if ($hosts.Count -eq 1) {
              $hostProcess = $hosts[0]
              $argv = [PoracodeTaskArgv]::Parse([string]$hostProcess.CommandLine)
              $wanted = @($selection.node,$selection.entrypoint,'--base-dir',$selection.profile,'serve')
              if ($null -ne $selection.config) { $wanted += @('--config',$selection.config) }
              if ($argv.Length -ne $wanted.Length -or [int]$hostProcess.ParentProcessId -ne [int]$wrapper.ProcessId -or $hostProcess.CreationDate -lt $wrapper.CreationDate) { throw 'Host process custody differs from the selected task.' }
              for ($i=0;$i -lt $argv.Length;$i++) { if (-not (Same-Path $argv[$i] $wanted[$i])) { throw 'Host argv differs from the selected registration.' } }
              Assert-Account $hostProcess
              $taskState.hostPid = [int]$hostProcess.ProcessId
              $taskState.phase = 'active'
            }
          } elseif ($hosts.Count -ne 0) { throw 'The selected host has no attested launcher; no owner was adopted.' }
        }
        if ($null -ne $task -and [string]$task.Xml -cne $snapshotXml) { throw 'Task definition changed during inspection.' }
        if ($request.operation -eq 'register' -and $null -eq $task) {
          $task = $folder.RegisterTaskDefinition($request.id,$expected,34,$sid,$null,3,"D:P(A;;FA;;;$sid)")
          Assert-Definition
          $count = [int]$task.GetInstances(0).Count
          $phase = if ($count -eq 0) { 'inactive' } else { 'activating' }
          $taskState = [ordered]@{found=$true;qualified=$true;enabled=[bool]$task.Enabled;instances=$count;wrapperPid=0;hostPid=0;phase=$phase;lastResult=[int64]$task.LastTaskResult}
        }
        if ($request.operation -eq 'enable') { $task.Enabled = $true; $taskState.enabled = $true }
        if ($request.operation -eq 'disable') { $task.Enabled = $false; $taskState.enabled = $false }
        if ($request.operation -in @('start','remove') -and ($instanceCount -ne 0 -or $wrappers.Count -ne 0 -or $hosts.Count -ne 0)) { throw 'Task/launcher/host retirement is unconfirmed; no start/removal was attempted.' }
        if ($request.operation -eq 'start') {
          if ($null -eq $task) { throw 'The selected task is absent.' }
          [void]$task.Run($null)
        }
        if ($request.operation -eq 'remove' -and $null -ne $task) { $folder.DeleteTask($request.id,0); $taskState = $null }
      }
      $result.task = $taskState
    } elseif ($request.operation -notin @('inspect','remove')) { throw 'The selected task is absent.' }
  }
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 8 -Compress))
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;
