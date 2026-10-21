Unicode true
RequestExecutionLevel user
SilentInstall silent
!include "fixture-config.nsh"
!include FileFunc.nsh
!include "${FIXTURE_STDUTILS_INCLUDE}"
!include "${PORACODE_CLI_SOURCE}"
!addplugindir /x86-unicode "${FIXTURE_STDUTILS_PLUGINS}"
!insertmacro customHeader
OutFile "${FIXTURE_EXE}"

!macro Expect VALUE EXPECTED CASE
  ${If} "${VALUE}" != "${EXPECTED}"
    FileOpen $9 "${FIXTURE_RESULT}" w
    FileWrite $9 "FAIL: ${CASE}; observed=${VALUE}; expected=${EXPECTED}; ownership=$PoraCliRunningReason"
    FileClose $9
    DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

Section
  ${GetParameters} $0
  ${If} $0 == "/GuardWorker"
    FileOpen $9 "${FIXTURE_ROOT}\guard-ready" w
    FileWrite $9 "ready"
    FileClose $9
    worker_wait:
      IfFileExists "${FIXTURE_ROOT}\guard-release" worker_done
      Sleep 25
      Goto worker_wait
    worker_done:
    SetErrorLevel 0
    Quit
  ${EndIf}
  ${If} $0 == "/GuardReject"
    StrCpy $INSTDIR "${FIXTURE_ROOT}"
    !insertmacro customCheckAppRunning
    SetErrorLevel 99
    Quit
  ${EndIf}
  SetRegView 32
  StrCpy $INSTDIR "${FIXTURE_ROOT}"
  Call PoraCliCheckRunning
  !insertmacro Expect "$PoraCliRunning" "1" "held exact runtime remains running"
  StrCpy $INSTDIR "${FIXTURE_ROOT}\unrelated-prefix"
  CreateDirectory "$INSTDIR"
  Call PoraCliCheckRunning
  !insertmacro Expect "$PoraCliRunning" "0" "same-name process in another verified prefix is not this owner"
  StrCpy $INSTDIR "${FIXTURE_ROOT}"
  StrCpy $PoraCliPerUser 1
  ; All keys below are a fresh UUID-scoped test hive, never HKCU\Environment.
  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegExpandStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "%SystemRoot%\literal ü;C:\existing;;"
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "registered" "append"
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadKind" "2" "expand-string type"
  !insertmacro Expect "$PoraCliReadRaw" "%SystemRoot%\literal ü;C:\existing;;;$PoraCliEntry" "unexpanded exact contents"
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "removed" "owned removal"
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadKind" "2" "remove preserves type"
  !insertmacro Expect "$PoraCliReadRaw" "%SystemRoot%\literal ü;C:\existing;;" "remove preserves repeated/trailing delimiters"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "C:\earlier npm;$PoraCliEntry"
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "registered" "pre-existing entry"
  !insertmacro Expect "$PoraCliAdded" "0" "no ownership claim over pre-existing entry"
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadKind" "1" "plain string type"
  !insertmacro Expect "$PoraCliReadRaw" "C:\earlier npm;$PoraCliEntry" "pre-existing entry preserved"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "registered" "absent user PATH"
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadStatus" "2" "restore absent value without deleting environment key"

  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  WriteRegExpandStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "$PoraCliEntry;"
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadStatus" "0" "an externally added empty component remains present"
  !insertmacro Expect "$PoraCliReadRaw" "" "empty component survives removal"
  !insertmacro Expect "$PoraCliReadKind" "2" "external empty component retains registry type"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" ""
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadStatus" "0" "preserve present empty value"
  !insertmacro Expect "$PoraCliReadRaw" "" "empty raw value"
  !insertmacro Expect "$PoraCliReadKind" "1" "empty plain-string type"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "C:\keep"
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  Call PoraCliReadRecord
  StrCpy $8 $PoraCliReadRaw
  FileOpen $9 "$PoraCliEntry\${PORACODE_CLI_COMMAND}.cmd" w
  FileWrite $9 "tampered command"
  FileClose $9
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "changed launcher"
  Call PoraCliReadRecord
  !insertmacro Expect "$PoraCliReadRaw" "$8" "changed launcher preserves custody"
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadRaw" "C:\keep;$PoraCliEntry" "changed launcher preserves PATH"
  FileOpen $9 "$PoraCliEntry\${PORACODE_CLI_COMMAND}.cmd" w
  FileWrite $9 "@echo off$\r$\nexit /b 0$\r$\n"
  FileClose $9

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "C:\keep"
  WriteRegStr HKCU "${PORACODE_CLI_REG_KEY}" "Registration" "2|future bytes"
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "future version"
  Call PoraCliReadRecord
  !insertmacro Expect "$PoraCliReadRaw" "2|future bytes" "future bytes retained"
  WriteRegDWORD HKCU "${PORACODE_CLI_REG_KEY}" "Registration" 1
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "unsupported record registry type"
  ReadRegDWORD $0 HKCU "${PORACODE_CLI_REG_KEY}" "Registration"
  !insertmacro Expect "$0" "1" "unsupported type retained"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegStr HKCU "${PORACODE_CLI_REG_KEY}" "FutureRegistration" "future namespace"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "unknown value layout"
  ReadRegStr $0 HKCU "${PORACODE_CLI_REG_KEY}" "FutureRegistration"
  !insertmacro Expect "$0" "future namespace" "future namespace retained"
  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegStr HKCU "${PORACODE_CLI_REG_KEY}\Future" "Metadata" "future subkey"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "unknown subkey layout"
  ReadRegStr $0 HKCU "${PORACODE_CLI_REG_KEY}\Future" "Metadata"
  !insertmacro Expect "$0" "future subkey" "future subkey retained"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  WriteRegExpandStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "C:\keep"
  Call PoraCliManage
  StrCpy $PoraCliState "prepared"
  Call PoraCliBuildRecord
  WriteRegStr HKCU "${PORACODE_CLI_REG_KEY}" "Registration" $PoraCliNextRecord
  StrCpy $8 $PoraCliNextRecord
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "prepared custody refuses automatic adoption"
  Call PoraCliReadRecord
  !insertmacro Expect "$PoraCliReadRaw" "$8" "prepared bytes retained"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  Call PoraCliManage
  StrCpy $8 "1|$PoraCliId|S-1-0-0|installed|$INSTDIR|${PORACODE_CLI_COMMAND}|${PORACODE_CLI_LAUNCHER_SHA256}|1|2|0"
  WriteRegStr HKCU "${PORACODE_CLI_REG_KEY}" "Registration" $8
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "wrong account"
  Call PoraCliReadRecord
  !insertmacro Expect "$PoraCliReadRaw" "$8" "wrong-account bytes retained"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  ; Write a value beyond the NSIS string bound directly through Win32. The
  ; production reader must refuse; it must never truncate/rewrite this value.
  IntOp $2 ${NSIS_MAX_STRLEN} + 16
  IntOp $2 $2 * 2
  System::Alloc $2
  Pop $0
  IntOp $3 $2 / 2
  IntOp $3 $3 - 1
  System::Call 'msvcrt::wmemset(p r0, i 120, i r3) p.r1 ?c'
  IntOp $4 $3 * 2
  IntOp $4 $4 + $0
  System::Call '*$4(&w1 "")'
  System::Call 'advapi32::RegCreateKeyExW(p 0x80000001, w "${PORACODE_CLI_ENV_KEY}", i 0, p 0, i 0, i 3, p 0, *p .r5, p 0) i.r6'
  System::Call 'advapi32::RegSetValueExW(p r5, w "Path", i 0, i 2, p r0, i r2) i.r6'
  System::Call 'advapi32::RegCloseKey(p r5)'
  System::Free $0
  StrCpy $8 $2
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "oversized raw PATH"
  System::Call 'advapi32::RegOpenKeyExW(p 0x80000001, w "${PORACODE_CLI_ENV_KEY}", i 0, i 1, *p .r5) i.r3'
  !insertmacro Expect "$3" "0" "oversized PATH key remains readable"
  System::Call 'advapi32::RegQueryValueExW(p r5, w "Path", p 0, p 0, p 0, *i .r2) i.r3'
  System::Call 'advapi32::RegCloseKey(p r5)'
  !insertmacro Expect "$3" "0" "oversized PATH remains readable"
  !insertmacro Expect "$2" "$8" "oversized PATH byte count unchanged"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  StrCpy $INSTDIR "${FIXTURE_ROOT}\literal %PATH%"
  CreateDirectory "$INSTDIR\resources\desktop-cli"
  CopyFiles /SILENT "${FIXTURE_ROOT}\resources\desktop-cli\${PORACODE_CLI_COMMAND}.cmd" "$INSTDIR\resources\desktop-cli\${PORACODE_CLI_COMMAND}.cmd"
  WriteRegExpandStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "C:\keep"
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "refused" "literal percent cannot retarget an expandable entry"
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadRaw" "C:\keep" "percent refusal preserves raw PATH"
  WriteRegStr HKCU "${PORACODE_CLI_ENV_KEY}" "Path" "C:\keep"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "registered" "literal percent is representable in REG_SZ"
  StrCpy $PoraCliAction "remove"
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "removed" "literal percent owned removal"
  Call PoraCliReadPath
  !insertmacro Expect "$PoraCliReadRaw" "C:\keep" "plain-string prefix remains exact"

  DeleteRegKey HKCU "${FIXTURE_REG_ROOT}"
  StrCpy $PoraCliPerUser 0
  Call PoraCliManage
  !insertmacro Expect "$PoraCliResult" "skipped" "all-users install does not edit current-user PATH"
  Call PoraCliReadRecord
  !insertmacro Expect "$PoraCliReadStatus" "2" "all-users record absent"
  FileOpen $9 "${FIXTURE_RESULT}" w
  FileWrite $9 "PASS"
  FileClose $9
  SetErrorLevel 0
SectionEnd
