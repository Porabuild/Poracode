# Install the Poracode CLI from a GitHub Release self-contained archive on
# Windows. Needs only PowerShell 5.1+ and the tar.exe that ships with Windows 10
# 1803 and later: no Node, npm, registry access or compiler. The archive
# carries its own Node.
#
#   irm https://poracode.com/install.ps1 | iex
#
# Environment:
#   PORACODE_CHANNEL           release train: stable (default) or nightly
#   PORACODE_VERSION           exact version to install (overrides the channel)
#   PORACODE_INSTALL_DIR       install prefix (default: %LOCALAPPDATA%\Poracode\server).
#                              Each version lives in <prefix>\releases\<version> and
#                              <prefix>\current points at the active one, the layout
#                              `poracode service` and `poracode upgrade` manage
#   PORACODE_BIN_DIR           where poracode.cmd goes (default: %LOCALAPPDATA%\Poracode\bin)
#   PORACODE_RELEASE_BASE_URL  mirror for releases/download (default: GitHub)
#   PORACODE_NO_MODIFY_PATH=1  never edit the user PATH
#   PORACODE_NO_TUI=1          skip downloading the terminal UI during install
#
# Profile data (projects, threads, settings) lives outside the prefix and is
# never touched by this script.
& {
  $ErrorActionPreference = "Stop"
  $ProgressPreference = "SilentlyContinue"
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = "Porabuild/Poracode"
  $baseUrl = if ($env:PORACODE_RELEASE_BASE_URL) { $env:PORACODE_RELEASE_BASE_URL.TrimEnd("/") } else { "https://github.com/$repo/releases/download" }
  $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME "AppData\Local" }
  $prefix = if ($env:PORACODE_INSTALL_DIR) { $env:PORACODE_INSTALL_DIR } else { Join-Path $localAppData "Poracode\server" }
  $binDir = if ($env:PORACODE_BIN_DIR) { $env:PORACODE_BIN_DIR } else { Join-Path $localAppData "Poracode\bin" }
  $channel = if ($env:PORACODE_CHANNEL) { $env:PORACODE_CHANNEL } else { "stable" }
  $version = $env:PORACODE_VERSION
  $prefix = [System.IO.Path]::GetFullPath($prefix)
  $binDir = [System.IO.Path]::GetFullPath($binDir)
  $shimMarker = "rem poracode-installer-shim v1"

  # Throw instead of `exit`: under `irm | iex`, exit would close the session.
  function Fail([string] $message) { throw "poracode install: $message" }
  function Say([string] $message) { [Console]::Error.WriteLine("  $message") }

  function Get-Status($errorRecord) {
    $response = $errorRecord.Exception.Response
    if ($response) { return [int]$response.StatusCode }
    return 0
  }

  $rawArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch ($rawArch) {
    "AMD64" { $arch = "x64" }
    "ARM64" { Fail "Windows on Arm has no self-contained CLI yet; install the desktop app from https://poracode.com/download" }
    default { Fail "unsupported architecture $rawArch" }
  }
  $target = "win32-$arch"
  $tar = Join-Path $env:SystemRoot "System32\tar.exe"
  if (-not (Test-Path $tar)) { Fail "tar.exe is missing; Windows 10 1803 or later is required" }

  if (-not $version) {
    Say "Finding the latest $channel release..."
    $headers = @{ "User-Agent" = "poracode-install"; "Accept" = "application/json" }
    if ($channel -eq "stable") {
      # Only plain releases are marked latest; this github.com page is not
      # rate-limited like the API and never returns a nightly.
      $release = Invoke-RestMethod -Uri "https://github.com/$repo/releases/latest" -Headers $headers
      if ($release.tag_name -match '^v(\d+\.\d+\.\d+)$') { $version = $Matches[1] }
    } elseif ($channel -eq "nightly") {
      for ($page = 1; -not $version -and $page -le 5; $page++) {
        $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=100&page=$page" -Headers $headers
        if (-not $releases) { break }
        $tag = ($releases | Where-Object { $_.tag_name -match '^v\d+\.\d+\.\d+-nightly\.\d+$' } | Select-Object -First 1).tag_name
        if ($tag) { $version = $tag.Substring(1) }
      }
    } else {
      Fail "PORACODE_CHANNEL must be stable or nightly"
    }
    if (-not $version) { Fail "could not find a $channel release; set PORACODE_VERSION" }
  }
  $version = $version.TrimStart("v")
  if ($version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') { Fail "invalid version '$version'" }

  $archive = "poracode-$version-$target.zip"
  $releasesDir = Join-Path $prefix "releases"
  $releaseDir = Join-Path $releasesDir $version
  $current = Join-Path $prefix "current"
  $launcher = Join-Path $current "bin\poracode.cmd"

  function Get-InstalledVersion([string] $root) {
    $cmd = Join-Path $root "bin\poracode.cmd"
    if (-not (Test-Path (Join-Path $root "standalone.json")) -or -not (Test-Path $cmd)) { return $null }
    try { return ((& $cmd --version 2>$null) | Select-Object -Last 1) } catch { return $null }
  }

  $serviceRegistered = $false
  try { $null = [System.IO.File]::GetAttributes((Join-Path $prefix "service-registration.json")); $serviceRegistered = $true } catch { }
  $priorVersion = Get-InstalledVersion $current
  if ($serviceRegistered -and -not $priorVersion) { Fail "the registered service has no usable current release; inspect its registration before retrying" }

  if ($serviceRegistered -and $priorVersion -eq $version) {
    $releaseDir = $current
    Say "Poracode $version is already installed."
  } elseif ((Get-InstalledVersion $releaseDir) -eq $version) {
    Say "Poracode $version is already installed."
  } else {
    Say "Installing Poracode $version ($target)..."
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("poracode-install-" + [System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $staging = $null
    try {
      try {
        Invoke-WebRequest -Uri "$baseUrl/v$version/SHA256SUMS" -OutFile (Join-Path $tmp "SHA256SUMS") -UseBasicParsing
      } catch {
        if ((Get-Status $_) -eq 404) {
          $nightlyHint = if (-not $env:PORACODE_VERSION -and $channel -eq "stable") { " (try `$env:PORACODE_CHANNEL = 'nightly')" } else { "" }
          Fail "release $version has no SHA256SUMS; releases before the one-line installer need the desktop app or a newer version$nightlyHint"
        }
        Fail "could not download the release checksums from $baseUrl/v$version/"
      }
      $expected = $null
      foreach ($line in Get-Content (Join-Path $tmp "SHA256SUMS")) {
        $parts = $line.Trim() -split '\s+', 2
        if ($parts.Count -eq 2 -and ($parts[1] -eq $archive -or $parts[1] -eq "*$archive")) {
          $expected = $parts[0].ToLowerInvariant()
          break
        }
      }
      if (-not $expected) { Fail "release $version has no self-contained archive for $target" }

      Say "Downloading $archive..."
      $archivePath = Join-Path $tmp $archive
      Invoke-WebRequest -Uri "$baseUrl/v$version/$archive" -OutFile $archivePath -UseBasicParsing
      Say "Verifying the download..."
      $actual = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
      if ($actual -ne $expected) { Fail "checksum mismatch for $archive (expected $expected, got $actual)" }

      # Untrusted bytes until proven otherwise: no absolute or parent paths, no links.
      $members = & $tar -tf $archivePath
      if ($LASTEXITCODE -ne 0) { Fail "$archive is not a readable archive" }
      foreach ($member in $members) {
        if ($member -match '^[\\/]' -or $member -match '^[A-Za-z]:' -or ($member -split '[\\/]') -contains "..") {
          Fail "$archive contains a path outside the install directory"
        }
      }
      if (& $tar -tvf $archivePath | Where-Object { $_ -match '^[lh]' }) {
        Fail "$archive contains a link entry"
      }

      New-Item -ItemType Directory -Force -Path $releasesDir | Out-Null
      $staging = Join-Path $releasesDir (".staging-" + [System.IO.Path]::GetRandomFileName())
      New-Item -ItemType Directory -Path $staging | Out-Null
      Say "Extracting..."
      & $tar -xf $archivePath -C $staging
      if ($LASTEXITCODE -ne 0) { Fail "could not extract $archive" }
      $marker = Get-Content (Join-Path $staging "standalone.json") -Raw | ConvertFrom-Json
      if ($marker.target -ne $target -or $marker.version -ne $version) {
        Fail "$archive is not a self-contained archive for $target $version"
      }
      if ((Get-InstalledVersion $staging) -ne $version) {
        Fail "the downloaded Poracode $version does not run on this machine"
      }
      if (Test-Path $releaseDir) { Remove-Item -Recurse -Force $releaseDir }
      Move-Item $staging $releaseDir
      $staging = $null
    } finally {
      if ($staging -and (Test-Path $staging)) { Remove-Item -Recurse -Force $staging }
      Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
  }

  # A registered service owns its current link and must use the upgrade
  # protocol (drain, backup, candidate admission) before switching versions.
  if ($serviceRegistered) {
    if ($priorVersion -ne $version) {
      Say "Upgrading the registered service safely..."
      & $launcher update $version --prefix $prefix
      if ($LASTEXITCODE -ne 0 -or (Get-InstalledVersion $current) -ne $version) {
        Fail "the registered service could not be upgraded; inspect it before retrying"
      }
    }
  } else {
    $releaseCommand = Join-Path $releaseDir "bin\poracode.cmd"
    $activationHelp = & $releaseCommand install-activate --help 2>$null
    if ($LASTEXITCODE -eq 0 -and (($activationHelp -join "`n") -match "install-activate PREFIX RELEASE")) {
      & $releaseCommand install-activate $prefix $releaseDir
      if ($LASTEXITCODE -ne 0) { Fail "could not select the release while another install or migration is active; retry" }
    } else {
      # Older released CLIs have no activation helper. Their fresh install
      # retains the original junction path; registered services use update.
      $currentAttributes = $null
      try { $currentAttributes = [System.IO.File]::GetAttributes($current) } catch { }
      if ($null -ne $currentAttributes) {
        if (-not ($currentAttributes -band [System.IO.FileAttributes]::ReparsePoint)) {
          Fail "$current is a directory, not a release link; move it aside and retry"
        }
        cmd /c rmdir "$current" | Out-Null
      }
      cmd /c mklink /J "$current" "$releaseDir" | Out-Null
      if ($LASTEXITCODE -ne 0) { Fail "could not link $current to $releaseDir" }
    }
  }

  # A small shim on PATH; never replace a poracode.cmd this installer does not own.
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  $shim = Join-Path $binDir "poracode.cmd"
  $linked = $true
  if ((Test-Path $shim) -and -not ((Get-Content $shim -Raw) -match [regex]::Escape($shimMarker))) {
    Say "Kept the existing $shim, which this installer does not own."
    Say "Run $launcher directly, or set PORACODE_BIN_DIR to another directory."
    $linked = $false
  } else {
    $shimLauncher = $launcher
    $defaultPrefix = [System.IO.Path]::GetFullPath((Join-Path $localAppData "Poracode\server"))
    $defaultBinDir = [System.IO.Path]::GetFullPath((Join-Path $localAppData "Poracode\bin"))
    if ($prefix -eq $defaultPrefix -and $binDir -eq $defaultBinDir) {
      $shimLauncher = '%~dp0..\server\current\bin\poracode.cmd'
    } elseif ($launcher -match '[^\x20-\x7e]|[%"]') {
      Fail "the custom install path cannot be represented safely in a Windows command shim"
    }
    Set-Content -Path $shim -Encoding ASCII -Value @("@echo off", "setlocal DisableDelayedExpansion", $shimMarker, "`"$shimLauncher`" %*")
  }

  if ($linked -and $env:PORACODE_NO_MODIFY_PATH -ne "1") {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Environment", $true)
    try {
      $raw = $key.GetValue("Path", "", [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $entries = @($raw -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') })
      if (-not ($entries -contains $binDir.TrimEnd('\'))) {
        # Keep the value's registry type so %VARIABLE% entries keep expanding.
        $kind = if ($raw -and $key.GetValueKind("Path") -eq [Microsoft.Win32.RegistryValueKind]::String) {
          [Microsoft.Win32.RegistryValueKind]::String
        } else {
          [Microsoft.Win32.RegistryValueKind]::ExpandString
        }
        $updated = if ($raw) { "$($raw.TrimEnd(';'));$binDir" } else { $binDir }
        $key.SetValue("Path", $updated, $kind)
        # Clearing an unused variable broadcasts the change to new terminals.
        [Environment]::SetEnvironmentVariable("PORACODE_INSTALL_PATH_REFRESH", $null, "User")
        Say "Added $binDir to your user PATH."
      }
    } finally {
      $key.Close()
    }
    if (-not (($env:Path -split ';') -contains $binDir)) { $env:Path = "$env:Path;$binDir" }
  } elseif ($linked) {
    Say "Add $binDir to your PATH to run poracode."
  }

  $resolved = Get-Command poracode -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($linked -and $resolved -and $resolved.Source -ne $shim) {
    Say "Another poracode comes first on PATH: $($resolved.Source)"
  }
  if (Test-Path (Join-Path $prefix "service-registration.json")) {
    Say "A managed service uses this prefix. Check it with:"
    Say "  poracode service status --prefix `"$prefix`""
  }

  # Fetch the terminal UI now, so the first `poracode` opens without a download.
  if ($env:PORACODE_NO_TUI -ne "1") {
    try {
      & $launcher tui --prefetch | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
    } catch {
      Say "Could not download the terminal UI now; poracode downloads it on first run."
    }
  }

  [Console]::Error.WriteLine("")
  [Console]::Error.WriteLine("  Installed Poracode $version")
  [Console]::Error.WriteLine("")
  Say "poracode               open the terminal UI"
  Say "poracode serve --open  start the server and open the web app"
  Say "poracode up            use it from your other devices"
  Say "poracode update        move to the newest release"
  Say "poracode --help        all commands"
  [Console]::Error.WriteLine("")
}
