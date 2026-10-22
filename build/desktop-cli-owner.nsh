!include LogicLib.nsh

Var PoraCliRunning
Var PoraCliRunningPid
Var PoraCliRunningPrefix
Var PoraCliRunningReason
Var PoraCliExitWait
Var PoraCliExitStarted

; A bundled headless owner uses the desktop executable too. Never hand it to
; electron-builder's default image/prefix kill path. Snapshot reads do not signal
; or terminate any process; unqualified matching candidates refuse replacement.
Function ${PORACODE_CLI_PREFIX}PoraCliCheckRunning
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  StrCpy $PoraCliRunning 2
  StrCpy $PoraCliRunningPid 0
  StrCpy $PoraCliRunningReason "The selected runtime's ownership could not be verified."
  StrCmp $INSTDIR "" done
  ClearErrors
  GetFullPathName $PoraCliRunningPrefix "$INSTDIR"
  IfErrors done
  ${If} ${FileExists} "$PoraCliRunningPrefix\*.*"
    StrCpy $0 $PoraCliRunningPrefix
    System::Call 'kernel32::CreateFileW(w r0, i 0, i 7, p 0, i 3, i 0x02000000, p 0) p.r1'
    IntCmp $1 -1 done
    System::Call 'kernel32::GetFinalPathNameByHandleW(p r1, w .r2, i ${NSIS_MAX_STRLEN}, i 0) i.r3'
    System::Call 'kernel32::CloseHandle(p r1)'
    IntCmp $3 0 done done
    IntCmp $3 ${NSIS_MAX_STRLEN} done 0 done
    StrCpy $0 $2 4
    StrCmp $0 "\\?\" 0 done
    StrCpy $PoraCliRunningPrefix $2 "" 4
  ${EndIf}
  StrCpy $0 $PoraCliRunningPrefix 1 1
  ${If} $0 != ":"
    StrCpy $PoraCliRunningReason "This installer requires a qualified physical local drive path; UNC/device-path ownership is not qualified."
    Goto done
  ${EndIf}
  System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) p.r0'
  IntCmp $0 -1 done
  ; NSIS installers and System plug-ins are 32-bit, including x64/arm64 app
  ; targets. PROCESSENTRY32W is 556 bytes for this ABI (native pointer is 4).
  System::Alloc 556
  Pop $1
  StrCmp $1 0 close_snapshot
  System::Call '*$1(i 556)'
  System::Call 'kernel32::Process32FirstW(p r0, p r1) i.r2'
  StrCmp $2 0 close_entry
  next_process:
    System::Call '*$1(i, i, i .r2, p, i, i, i, i, i, &w260 .r3)'
    System::Call 'kernel32::OpenProcess(i 0x1000, i 0, i r2) p.r4 ?e'
    Pop $5
    ${If} $4 == 0
      ; Skip unrelated protected system processes. A matching filename in this
      ; installation, including a legacy executable, needs a qualified path.
      StrCmp $5 87 advance
      ${If} $3 == "${PRODUCT_FILENAME}.exe"
      ${OrIf} ${FileExists} "$PoraCliRunningPrefix\$3"
        StrCpy $PoraCliRunningReason "A matching process could not be scoped to this installation without additional access."
        Goto close_entry
      ${EndIf}
      Goto advance
    ${EndIf}
    StrCpy $6 ${NSIS_MAX_STRLEN}
    System::Call 'kernel32::QueryFullProcessImageNameW(p r4, i 0, w .r5, *i r6r6) i.r7'
    System::Call 'kernel32::CloseHandle(p r4)'
    ${If} $7 == 0
      ${If} $3 == "${PRODUCT_FILENAME}.exe"
      ${OrIf} ${FileExists} "$PoraCliRunningPrefix\$3"
        StrCpy $PoraCliRunningReason "A matching process could not be scoped to this installation without additional access."
        Goto close_entry
      ${EndIf}
      Goto advance
    ${EndIf}
    StrCpy $8 "$PoraCliRunningPrefix\"
    StrLen $9 $8
    StrCpy $5 $5 $9
    ${If} $5 == $8
      StrCpy $PoraCliRunning 1
      StrCpy $PoraCliRunningPid $2
      StrCpy $PoraCliRunningReason "A process is still executing code from the selected physical installation directory."
      Goto close_entry
    ${EndIf}
    advance:
    System::Call 'kernel32::Process32NextW(p r0, p r1) i.r2 ?e'
    Pop $3
    StrCmp $2 0 exhausted next_process
  exhausted:
    ${If} $3 == 18
      StrCpy $PoraCliRunning 0
    ${EndIf}
  close_entry:
    System::Free $1
  close_snapshot:
    System::Call 'kernel32::CloseHandle(p r0)'
  done:
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro customCheckAppRunning
  Call ${PORACODE_CLI_PREFIX}PoraCliCheckRunning
  ${If} $PoraCliRunning == 1
    ${StdUtils.TestParameter} $PoraCliExitWait "updated"
    ${If} $PoraCliExitWait == "true"
      ; quitAndInstall starts the installer before the desktop's shutdown join.
      ; Wait for that owner to retire; never terminate a bundled server.
      System::Call 'kernel32::GetTickCount() i .s'
      Pop $PoraCliExitStarted
      ${DoWhile} $PoraCliRunning == 1
        System::Call 'kernel32::GetTickCount() i .s'
        Pop $PoraCliExitWait
        IntOp $PoraCliExitWait $PoraCliExitWait - $PoraCliExitStarted
        ${If} $PoraCliExitWait >= 30000
          ${ExitDo}
        ${EndIf}
        Sleep 250
        Call ${PORACODE_CLI_PREFIX}PoraCliCheckRunning
      ${Loop}
    ${EndIf}
  ${EndIf}
  ${If} $PoraCliRunning != 0
    DetailPrint "Desktop replacement refused: $PoraCliRunningReason"
    DetailPrint "Desktop replacement refused: the selected runtime is running or its ownership could not be qualified. Quit the desktop or run ${PORACODE_CLI_COMMAND} stop with the server's exact --base-dir, then retry. No process was stopped."
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Quit the desktop and explicitly stop any server using this desktop runtime before retrying. No process will be stopped automatically."
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
